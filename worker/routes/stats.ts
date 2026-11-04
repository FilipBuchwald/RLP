import type { PlayerStatsDto, RankingDto } from '../../shared/dto'
import { playerProfile, ranking as computeRanking, type SortBy } from '../../shared/stats'
import { currentSeason, getPlayer, listPlayers, loadSessions } from '../db'
import { json, notFound, oneOf, seasonParam } from '../http'
import type { Handler } from '../router'

const doneSessions = (db: D1Database, season: number) =>
  loadSessions(db, "sessions.season = ? AND sessions.status = 'done'", [season])

async function guestChecker(db: D1Database) {
  const guests = new Set((await listPlayers(db)).filter((p) => p.isGuest).map((p) => p.id))
  return (id: string) => guests.has(id)
}

// GET /api/ranking?season=2026&sort=points|avg
export const ranking: Handler = async ({ env, url }) => {
  const season = seasonParam(url, currentSeason())
  const sort = oneOf(url.searchParams.get('sort') ?? 'points', 'sort', [
    'points',
    'avg',
  ] as SortBy[])
  const [sessions, isGuest] = await Promise.all([
    doneSessions(env.DB, season),
    guestChecker(env.DB),
  ])
  const { regulars, guests } = computeRanking(sessions, isGuest, sort)

  const body: RankingDto = {
    season,
    regulars,
    guests,
    totals: {
      nights: sessions.length,
      matches: sessions.reduce((n, s) => n + s.rounds.reduce((k, r) => k + r.matches.length, 0), 0),
      players: regulars.length + guests.length,
    },
  }
  return json(body)
}

// GET /api/players/:id/stats?season=2026
export const playerStats: Handler = async ({ env, url, params }) => {
  const season = seasonParam(url, currentSeason())
  const player = await getPlayer(env.DB, params.id!)
  if (!player) throw notFound('Nie ma takiego gracza')
  const [sessions, isGuest] = await Promise.all([
    doneSessions(env.DB, season),
    guestChecker(env.DB),
  ])

  const body: PlayerStatsDto = {
    season,
    player,
    profile: playerProfile(sessions, player.id, isGuest),
  }
  return json(body)
}
