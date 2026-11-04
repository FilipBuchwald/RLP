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

type PlayerRow = {
  id: string
  name: string
  color: string
  is_guest: number
  tournaments: number
}

type VariantRow = {
  id: string
  player_id: string
  name: string
  color: string
  tournaments: number
}

export const toPlayer = (r: PlayerRow, variants: VariantRow[] = []): PlayerDto => ({
  id: r.id,
  name: r.name,
  color: r.color,
  isGuest: r.is_guest === 1,
  tournaments: r.tournaments,
  variants: variants
    .filter((v) => v.player_id === r.id)
    .map((v) => ({ id: v.id, name: v.name, color: v.color, tournaments: v.tournaments })),
})

const VARIANT_SELECT = `SELECT id, player_id, name, color,
  (SELECT COUNT(*) FROM session_players sp WHERE sp.variant_id = player_variants.id) AS tournaments
  FROM player_variants`

const PLAYER_SELECT = `SELECT id, name, color, is_guest,
  (SELECT COUNT(*) FROM session_players sp WHERE sp.player_id = players.id) AS tournaments
  FROM players`

export async function listPlayers(db: D1Database): Promise<PlayerDto[]> {
  const [p, v] = await db.batch([
    db.prepare(`${PLAYER_SELECT} ORDER BY created_at, rowid`),
    db.prepare(`${VARIANT_SELECT} ORDER BY created_at, rowid`),
  ])
  const variants = v.results as VariantRow[]
  return (p.results as PlayerRow[]).map((r) => toPlayer(r, variants))
}

export async function getPlayer(db: D1Database, id: string): Promise<PlayerDto | null> {
  const [p, v] = await db.batch([
    db.prepare(`${PLAYER_SELECT} WHERE id = ?`).bind(id),
    db.prepare(`${VARIANT_SELECT} WHERE player_id = ? ORDER BY created_at, rowid`).bind(id),
  ])
  const row = (p.results as PlayerRow[])[0]
  return row ? toPlayer(row, v.results as VariantRow[]) : null
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
type SessionPlayerRow = { session_id: string; player_id: string; variant_id: string | null }
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
        `SELECT sp.session_id, sp.player_id, sp.variant_id FROM session_players sp
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
  const variantsBySession = new Map<string, Record<string, string>>()
  for (const x of sp.results as SessionPlayerRow[]) {
    const list = playersBySession.get(x.session_id) ?? []
    list.push(x.player_id)
    playersBySession.set(x.session_id, list)
    if (x.variant_id) {
      const v = variantsBySession.get(x.session_id) ?? {}
      v[x.player_id] = x.variant_id
      variantsBySession.set(x.session_id, v)
    }
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
    variants: variantsBySession.get(x.id) ?? {},
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
