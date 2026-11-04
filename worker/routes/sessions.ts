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
  if (!s) throw notFound('Nie ma takiego wieczoru')
  if (s.status !== 'live') throw conflict('Wieczór jest już zakończony')
  return s
}

const reload = async (db: D1Database, id: string) => json(await loadSession(db, id))

// GET /api/sessions/live → wieczór na żywo albo null
export const live: Handler = async ({ env }) => json(await loadLiveSession(env.DB))

// GET /api/sessions?season=2026 → zakończone wieczory, od najnowszego
export const history: Handler = async ({ env, url }) => {
  const season = seasonParam(url, currentSeason())
  const sessions = await loadSessions(env.DB, "sessions.season = ? AND sessions.status = 'done'", [
    season,
  ])
  return json(sessions.reverse())
}

// POST /api/sessions { playerIds, targetPoints, courts, mode, plannedRounds? }
// Tworzy wieczór i od razu losuje 1. rundę — wszystko w jednym batchu (atomowo).
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
    throw conflict('Trwa już inny wieczór — zakończ go albo odrzuć')

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
    if (isUniqueViolation(e, 'sessions.status')) throw conflict('Trwa już inny wieczór')
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
    throw conflict('Plan rund jest zakończony — zakończ wieczór')

  try {
    await env.DB.batch(insertRound(env.DB, s.id, makeRound(s.players, s.rounds, s.courts)))
  } catch (e) {
    // Dwa telefony kliknęły jednocześnie — runda już istnieje, nie losujemy drugi raz.
    if (isUniqueViolation(e, 'rounds.')) throw conflict('Ta runda została już wylosowana')
    throw e
  }
  return reload(env.DB, s.id)
}

// POST /api/sessions/:id/finish { cap? }
// Niedokończone rundy są odrzucane. Nierówne liczby meczów bez `cap` → 409 z licznikami.
export const finish: Handler = async ({ request, env, params }) => {
  const s = await liveSessionById(env.DB, params.id!)
  const body = await readBody(request)
  const db = env.DB

  const incomplete = s.rounds.filter((r) => !isRoundComplete(r))
  const st = equalityStatus(s)

  // Nic nie zostało rozegrane — wieczór znika, jak w prototypie.
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

// DELETE /api/sessions/:id → odrzuca trwający wieczór bez zapisu
export const discard: Handler = async ({ env, params }) => {
  const s = await liveSessionById(env.DB, params.id!)
  await env.DB.batch(deleteSession(env.DB, s.id))
  return noContent()
}
