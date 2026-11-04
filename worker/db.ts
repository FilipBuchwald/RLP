// Dostęp do D1: wczytywanie turniejów w kształcie SessionDto i budowanie zapisów.
import type {
  MatchDto,
  PlayerDto,
  RoundDto,
  SessionDto,
  SessionMode,
  SessionStatus,
} from '../shared/dto'
import type { RoundDraw } from '../shared/types'

export const newId = () => crypto.randomUUID()

/** Dzisiejsza data w Polsce, YYYY-MM-DD. */
export const todayWarsaw = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date())

export const currentSeason = () => Number(todayWarsaw().slice(0, 4))

// --- gracze ---

type PlayerRow = { id: string; name: string; color: string; is_guest: number }

export const toPlayer = (r: PlayerRow): PlayerDto => ({
  id: r.id,
  name: r.name,
  color: r.color,
  isGuest: r.is_guest === 1,
})

export async function listPlayers(db: D1Database): Promise<PlayerDto[]> {
  const { results } = await db
    .prepare('SELECT id, name, color, is_guest FROM players ORDER BY created_at, rowid')
    .all<PlayerRow>()
  return results.map(toPlayer)
}

export async function getPlayer(db: D1Database, id: string): Promise<PlayerDto | null> {
  const row = await db
    .prepare('SELECT id, name, color, is_guest FROM players WHERE id = ?')
    .bind(id)
    .first<PlayerRow>()
  return row ? toPlayer(row) : null
}

// --- turnieje ---

type SessionRow = {
  id: string
  date: string
  season: number
  target_points: number
  courts: number
  mode: SessionMode
  planned_rounds: number | null
  cap: number | null
  status: SessionStatus
  created_by: string | null
  edited_at: string | null
}
type SessionPlayerRow = { session_id: string; player_id: string }
type RoundRow = { id: string; session_id: string; number: number; sitting: string }
type MatchRow = {
  id: string
  round_id: string
  court: number
  a1: string
  a2: string
  b1: string
  b2: string
  score_a: number | null
  score_b: number | null
}

/**
 * Wczytuje turnieje z rundami i meczami (4 zapytania w jednym batchu = spójny odczyt).
 * `where` odnosi się do tabeli `sessions`, np. "sessions.status = 'live'".
 */
export async function loadSessions(
  db: D1Database,
  where: string,
  params: unknown[] = [],
): Promise<SessionDto[]> {
  const [s, sp, r, m] = await db.batch([
    db.prepare(`SELECT * FROM sessions WHERE ${where} ORDER BY date, created_at`).bind(...params),
    db
      .prepare(
        `SELECT sp.session_id, sp.player_id FROM session_players sp
         JOIN sessions ON sessions.id = sp.session_id WHERE ${where} ORDER BY sp.rowid`,
      )
      .bind(...params),
    db
      .prepare(
        `SELECT rounds.id, rounds.session_id, rounds.number, rounds.sitting FROM rounds
         JOIN sessions ON sessions.id = rounds.session_id WHERE ${where} ORDER BY rounds.number`,
      )
      .bind(...params),
    db
      .prepare(
        `SELECT matches.* FROM matches
         JOIN rounds ON rounds.id = matches.round_id
         JOIN sessions ON sessions.id = rounds.session_id WHERE ${where} ORDER BY matches.court`,
      )
      .bind(...params),
  ])

  const matchesByRound = new Map<string, MatchDto[]>()
  for (const x of m.results as MatchRow[]) {
    const list = matchesByRound.get(x.round_id) ?? []
    list.push({
      id: x.id,
      court: x.court,
      a: [x.a1, x.a2],
      b: [x.b1, x.b2],
      scoreA: x.score_a,
      scoreB: x.score_b,
    })
    matchesByRound.set(x.round_id, list)
  }

  const roundsBySession = new Map<string, RoundDto[]>()
  for (const x of r.results as RoundRow[]) {
    const list = roundsBySession.get(x.session_id) ?? []
    list.push({
      id: x.id,
      number: x.number,
      sitting: JSON.parse(x.sitting) as string[],
      matches: matchesByRound.get(x.id) ?? [],
    })
    roundsBySession.set(x.session_id, list)
  }

  const playersBySession = new Map<string, string[]>()
  for (const x of sp.results as SessionPlayerRow[]) {
    const list = playersBySession.get(x.session_id) ?? []
    list.push(x.player_id)
    playersBySession.set(x.session_id, list)
  }

  return (s.results as SessionRow[]).map((x) => ({
    id: x.id,
    date: x.date,
    season: x.season,
    target: x.target_points,
    courts: x.courts,
    mode: x.mode,
    plannedRounds: x.planned_rounds,
    cap: x.cap,
    status: x.status,
    createdBy: x.created_by,
    editedAt: x.edited_at ? x.edited_at.replace(' ', 'T') + 'Z' : null,
    players: playersBySession.get(x.id) ?? [],
    rounds: roundsBySession.get(x.id) ?? [],
  }))
}

export async function loadSession(db: D1Database, id: string): Promise<SessionDto | null> {
  return (await loadSessions(db, 'sessions.id = ?', [id]))[0] ?? null
}

export async function loadLiveSession(db: D1Database): Promise<SessionDto | null> {
  return (await loadSessions(db, "sessions.status = 'live'"))[0] ?? null
}

/** INSERT-y rundy i jej meczów (do wykonania w batchu razem z innymi zapisami). */
export function insertRound(
  db: D1Database,
  sessionId: string,
  draw: RoundDraw,
): D1PreparedStatement[] {
  const roundId = newId()
  return [
    db
      .prepare('INSERT INTO rounds (id, session_id, number, sitting) VALUES (?, ?, ?, ?)')
      .bind(roundId, sessionId, draw.number, JSON.stringify(draw.sitting)),
    ...draw.matches.map((mt) =>
      db
        .prepare(
          'INSERT INTO matches (id, round_id, court, a1, a2, b1, b2) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(newId(), roundId, mt.court, mt.a[0], mt.a[1], mt.b[0], mt.b[1]),
    ),
  ]
}

/** DELETE-y całego turnieju (jawnie, bez polegania na ON DELETE CASCADE). */
export function deleteSession(db: D1Database, sessionId: string): D1PreparedStatement[] {
  return [
    db
      .prepare('DELETE FROM matches WHERE round_id IN (SELECT id FROM rounds WHERE session_id = ?)')
      .bind(sessionId),
    db.prepare('DELETE FROM rounds WHERE session_id = ?').bind(sessionId),
    db.prepare('DELETE FROM session_players WHERE session_id = ?').bind(sessionId),
    db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId),
  ]
}

/** Czy błąd D1 to naruszenie unikalności (np. równoległe losowanie tej samej rundy). */
export const isUniqueViolation = (e: unknown, what: string) =>
  e instanceof Error && e.message.includes('UNIQUE constraint failed') && e.message.includes(what)
