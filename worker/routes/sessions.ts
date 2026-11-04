import {
  TARGET_POINTS,
  effectiveCourts,
  makeRound,
  nextEqualRound,
  planOptions,
  stepFor,
} from '../../shared/americano'
import type { SessionDto, UnequalDto } from '../../shared/dto'
import { equalityStatus, isRoundComplete } from '../../shared/stats'
import {
  deleteSession,
  insertRound,
  isUniqueViolation,
  loadLiveSession,
  loadSession,
  loadSessions,
  newId,
  currentSeason,
  todayWarsaw,
} from '../db'
import {
  badRequest,
  conflict,
  int,
  json,
  noContent,
  notFound,
  oneOf,
  readBody,
  seasonParam,
} from '../http'
import type { Handler } from '../router'

const MAX_PLAYERS = 16

async function liveSessionById(db: D1Database, id: string): Promise<SessionDto> {
  const s = await loadSession(db, id)
  if (!s) throw notFound('Nie ma takiego turnieju')
  if (s.status !== 'live') throw conflict('Turniej jest już zakończony')
  return s
}

const reload = async (db: D1Database, id: string) => json(await loadSession(db, id))

// GET /api/sessions/live → turniej na żywo albo null
export const live: Handler = async ({ env }) => json(await loadLiveSession(env.DB))

// GET /api/sessions?season=2026 → zakończone turnieje, od najnowszego
export const history: Handler = async ({ env, url }) => {
  const season = seasonParam(url, currentSeason())
  const sessions = await loadSessions(env.DB, "sessions.season = ? AND sessions.status = 'done'", [
    season,
  ])
  return json(sessions.reverse())
}

// POST /api/sessions { playerIds, targetPoints, courts, mode, plannedRounds? }
// Tworzy turniej i od razu losuje 1. rundę — wszystko w jednym batchu (atomowo).
export const create: Handler = async ({ request, env, user }) => {
  const body = await readBody(request)

  if (!Array.isArray(body.playerIds) || !body.playerIds.every((p) => typeof p === 'string'))
    throw badRequest('Pole playerIds: lista identyfikatorów graczy')
  const playerIds = [...new Set(body.playerIds as string[])]
  if (playerIds.length < 4) throw badRequest('Potrzeba minimum 4 graczy')
  if (playerIds.length > MAX_PLAYERS) throw badRequest(`Maksymalnie ${MAX_PLAYERS} graczy`)

  const target = oneOf(body.targetPoints, 'targetPoints', TARGET_POINTS)
  const courts = effectiveCourts(playerIds.length, oneOf(body.courts, 'courts', [1, 2] as const))
  const mode = oneOf(body.mode, 'mode', ['plan', 'open'] as const)

  let plannedRounds: number | null = null
  if (mode === 'plan') {
    const allowed = planOptions(playerIds.length, courts, target).map((o) => o.rounds)
    plannedRounds = int(body.plannedRounds, 'plannedRounds', 1, 30)
    if (!allowed.includes(plannedRounds))
      throw badRequest(`Pole plannedRounds: przy tym składzie jedno z ${allowed.join(', ')}`)
  }

  const { results: known } = await env.DB.prepare(
    `SELECT id FROM players WHERE id IN (${playerIds.map(() => '?').join(',')})`,
  )
    .bind(...playerIds)
    .all<{ id: string }>()
  if (known.length !== playerIds.length) throw badRequest('Nieznany gracz na liście')

  if (await loadLiveSession(env.DB))
    throw conflict('Trwa już inny turniej — zakończ go albo odrzuć')

  const id = newId()
  const date = todayWarsaw()
  const db = env.DB
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO sessions (id, date, season, target_points, courts, mode, planned_rounds, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'live', ?)`,
        )
        .bind(id, date, Number(date.slice(0, 4)), target, courts, mode, plannedRounds, user),
      ...playerIds.map((p) =>
        db.prepare('INSERT INTO session_players (session_id, player_id) VALUES (?, ?)').bind(id, p),
      ),
      ...insertRound(db, id, makeRound(playerIds, [], courts)),
    ])
  } catch (e) {
    if (isUniqueViolation(e, 'sessions.status')) throw conflict('Trwa już inny turniej')
    throw e
  }
  return json(await loadSession(db, id), 201)
}

// POST /api/sessions/:id/rounds → losuje następną rundę
export const nextRound: Handler = async ({ env, params }) => {
  const s = await liveSessionById(env.DB, params.id!)
  const current = s.rounds.at(-1)
  if (current && !isRoundComplete(current)) throw conflict('Bieżąca runda nie ma kompletu wyników')
  if (s.plannedRounds != null && s.rounds.length >= s.plannedRounds)
    throw conflict('Plan rund jest zakończony — zakończ turniej')

  try {
    await env.DB.batch(insertRound(env.DB, s.id, makeRound(s.players, s.rounds, s.courts)))
  } catch (e) {
    // Dwa telefony kliknęły jednocześnie — runda już istnieje, nie losujemy drugi raz.
    if (isUniqueViolation(e, 'rounds.')) throw conflict('Ta runda została już wylosowana')
    throw e
  }
  return reload(env.DB, s.id)
}

// DELETE /api/sessions/:id/rounds/:number → cofa ostatnią rundę (razem z jej wynikami).
// Poprzednia runda znów jest bieżąca: można poprawić jej wynik i wylosować dalej.
export const undoRound: Handler = async ({ env, params }) => {
  const s = await liveSessionById(env.DB, params.id!)
  const last = s.rounds.at(-1)
  if (!last || String(last.number) !== params.number)
    throw conflict('To już nie jest ostatnia runda — odśwież')
  if (s.rounds.length < 2) throw conflict('To pierwsza runda — jeśli trzeba, odrzuć cały turniej')

  // Warunek w SQL, bo w międzyczasie inny telefon mógł wylosować rundę albo zakończyć turniej:
  // usuwamy tylko wtedy, gdy to nadal ostatnia runda trwającego turnieju.
  const stillLast = `? = (SELECT MAX(number) FROM rounds WHERE session_id = ?)
    AND (SELECT status FROM sessions WHERE id = ?) = 'live'`
  const db = env.DB
  await db.batch([
    db
      .prepare(`DELETE FROM matches WHERE round_id = ? AND ${stillLast}`)
      .bind(last.id, last.number, s.id, s.id),
    db
      .prepare(`DELETE FROM rounds WHERE id = ? AND ${stillLast}`)
      .bind(last.id, last.number, s.id, s.id),
  ])
  return reload(db, s.id)
}

const MAX_SCORE_EDITS = 200

// PUT /api/sessions/:id/scores { scores: [{ matchId, scoreA }] } → poprawki w zapisanym turnieju.
// Wszystkie naraz (atomowo); scoreB = target − scoreA. Liczba meczów się nie zmienia, więc
// przycięcie (cap) zostaje ważne.
export const editScores: Handler = async ({ request, env, params }) => {
  const s = await loadSession(env.DB, params.id!)
  if (!s) throw notFound('Nie ma takiego turnieju')
  if (s.status !== 'done') throw conflict('Turniej trwa — wyniki wpisuj na żywo')

  const body = await readBody(request)
  if (!Array.isArray(body.scores) || body.scores.length > MAX_SCORE_EDITS)
    throw badRequest('Pole scores: lista { matchId, scoreA }')
  const current = new Map(s.rounds.flatMap((r) => r.matches).map((m) => [m.id, m.scoreA]))
  const changes = new Map<string, number>()
  for (const item of body.scores as unknown[]) {
    const { matchId, scoreA } = (item ?? {}) as Record<string, unknown>
    if (typeof matchId !== 'string' || !current.has(matchId))
      throw badRequest('Mecz spoza tego turnieju')
    const value = int(scoreA, 'scoreA', 0, s.target)
    if (current.get(matchId) !== value) changes.set(matchId, value)
    else changes.delete(matchId)
  }
  if (changes.size === 0) return json(s)

  const db = env.DB
  await db.batch([
    ...[...changes].map(([id, a]) =>
      db
        .prepare('UPDATE matches SET score_a = ?, score_b = ? WHERE id = ?')
        .bind(a, s.target - a, id),
    ),
    db
      .prepare("UPDATE sessions SET edited_at = datetime('now') WHERE id = ? AND status = 'done'")
      .bind(s.id),
  ])
  return reload(db, s.id)
}

// POST /api/sessions/:id/finish { cap? }
// Niedokończone rundy są odrzucane. Nierówne liczby meczów bez `cap` → 409 z licznikami.
export const finish: Handler = async ({ request, env, params }) => {
  const s = await liveSessionById(env.DB, params.id!)
  const body = await readBody(request)
  const db = env.DB

  const incomplete = s.rounds.filter((r) => !isRoundComplete(r))
  const st = equalityStatus(s)

  // Nic nie zostało rozegrane — turniej znika, jak w prototypie.
  if (st.completeRounds === 0) {
    await db.batch(deleteSession(db, s.id))
    return noContent()
  }

  let cap: number | null = null
  if (!st.equal) {
    // min = 0: ktoś nie zagrał jeszcze ani meczu, przycinać nie ma do czego.
    if (body.cap === undefined || st.min === 0) {
      const payload: Omit<UnequalDto, 'error'> = {
        code: 'unequal',
        counts: st.counts,
        min: st.min,
        max: st.max,
        completeRounds: st.completeRounds,
        nextEqualRound: nextEqualRound(st.completeRounds, stepFor(s.players.length, s.courts)),
      }
      throw conflict('Nierówna liczba meczów — przytnij albo grajcie dalej', payload)
    }
    cap = int(body.cap, 'cap', 1, st.min)
  }

  await db.batch([
    ...incomplete.flatMap((r) => [
      db.prepare('DELETE FROM matches WHERE round_id = ?').bind(r.id),
      db.prepare('DELETE FROM rounds WHERE id = ?').bind(r.id),
    ]),
    db
      .prepare("UPDATE sessions SET status = 'done', cap = ? WHERE id = ? AND status = 'live'")
      .bind(cap, s.id),
  ])
  return reload(db, s.id)
}

// DELETE /api/sessions/:id → odrzuca trwający turniej bez zapisu
export const discard: Handler = async ({ env, params }) => {
  const s = await liveSessionById(env.DB, params.id!)
  await env.DB.batch(deleteSession(env.DB, s.id))
  return noContent()
}
