// Tabela wieczoru, ranking sezonu, przycinanie i profil gracza.
// Nic nie jest zapisywane — wszystko liczymy z meczów (i z `cap` sesji).
import type { Match, PlayerId, Round, SessionData } from './types'

export const isScored = (m: Pick<Match, 'scoreA' | 'scoreB'>) =>
  m.scoreA != null && m.scoreB != null

export const isRoundComplete = (r: Pick<Round, 'matches'>) =>
  r.matches.length > 0 && r.matches.every(isScored)

/** Rundy w kolejności numerów, mecze w kolejności kortów — porządek „pierwszych meczów”. */
function ordered(rounds: readonly Round[]): Round[] {
  return rounds
    .slice()
    .sort((x, y) => x.number - y.number)
    .map((r) => ({ ...r, matches: r.matches.slice().sort((x, y) => x.court - y.court) }))
}

/** Ile meczów z wynikiem rozegrał każdy z graczy. */
export function matchCounts(
  players: readonly PlayerId[],
  rounds: readonly Round[],
): Record<PlayerId, number> {
  const c: Record<PlayerId, number> = Object.fromEntries(players.map((p) => [p, 0]))
  for (const r of rounds)
    for (const m of r.matches) {
      if (!isScored(m)) continue
      for (const p of [...m.a, ...m.b]) c[p] = (c[p] ?? 0) + 1
    }
  return c
}

/** Klucz „ten mecz nie liczy się temu graczowi”. */
export const cutKey = (roundNumber: number, court: number, player: PlayerId) =>
  `${roundNumber}:${court}:${player}`

/**
 * Mecze odcięte przy przycinaniu: każdemu liczą się tylko jego pierwsze `cap` meczów
 * (w kolejności rund). Zwraca zbiór kluczy `cutKey`.
 */
export function excluded(session: Pick<SessionData, 'cap' | 'rounds'>): Set<string> {
  const ex = new Set<string>()
  if (!session.cap) return ex
  const c = new Map<PlayerId, number>()
  for (const r of ordered(session.rounds))
    for (const m of r.matches) {
      if (!isScored(m)) continue
      for (const p of [...m.a, ...m.b]) {
        const n = (c.get(p) ?? 0) + 1
        c.set(p, n)
        if (n > session.cap) ex.add(cutKey(r.number, m.court, p))
      }
    }
  return ex
}

export type Result = 'W' | 'R' | 'P'
const result = (pf: number, pa: number): Result => (pf > pa ? 'W' : pf < pa ? 'P' : 'R')

/** Jeden policzony mecz z perspektywy gracza. */
interface PlayerMatch {
  player: PlayerId
  mate: PlayerId
  pointsFor: number
  pointsAgainst: number
  result: Result
}

/** Wszystkie policzone (z wynikiem, nieodcięte) mecze z perspektywy każdego gracza. */
function* countedMatches(session: SessionData): Generator<PlayerMatch> {
  const ex = excluded(session)
  for (const r of ordered(session.rounds))
    for (const m of r.matches) {
      if (m.scoreA == null || m.scoreB == null) continue
      const sides = [
        [m.a, m.scoreA, m.scoreB],
        [m.b, m.scoreB, m.scoreA],
      ] as const
      for (const [team, pf, pa] of sides)
        for (const [i, p] of team.entries()) {
          if (ex.has(cutKey(r.number, m.court, p))) continue
          yield {
            player: p,
            mate: team[1 - i],
            pointsFor: pf,
            pointsAgainst: pa,
            result: result(pf, pa),
          }
        }
    }
}

export interface StatsRow {
  id: PlayerId
  points: number
  matches: number
  wins: number
  draws: number
  losses: number
  nights: number
  /** punkty / mecz */
  avg: number
  /** 0–1 */
  winRate: number
}

/** Tabela dla zestawu wieczorów (jeden wieczór = tabela wieczoru, sezon = ranking). */
export function table(sessions: readonly SessionData[]): StatsRow[] {
  const t = new Map<PlayerId, Omit<StatsRow, 'nights' | 'avg' | 'winRate'> & { n: Set<string> }>()
  const get = (id: PlayerId) => {
    let row = t.get(id)
    if (!row) {
      row = { id, points: 0, matches: 0, wins: 0, draws: 0, losses: 0, n: new Set() }
      t.set(id, row)
    }
    return row
  }
  for (const s of sessions) {
    for (const p of s.players) get(p).n.add(s.id)
    for (const pm of countedMatches(s)) {
      const row = get(pm.player)
      row.points += pm.pointsFor
      row.matches++
      if (pm.result === 'W') row.wins++
      else if (pm.result === 'P') row.losses++
      else row.draws++
    }
  }
  return [...t.values()].map(({ n, ...x }) => ({
    ...x,
    nights: n.size,
    avg: x.matches ? x.points / x.matches : 0,
    winRate: x.matches ? x.wins / x.matches : 0,
  }))
}

export type SortBy = 'points' | 'avg'

export function sortRows(rows: readonly StatsRow[], by: SortBy = 'points'): StatsRow[] {
  return rows
    .slice()
    .sort(
      by === 'avg'
        ? (a, b) => b.avg - a.avg || b.points - a.points
        : (a, b) => b.points - a.points || b.avg - a.avg,
    )
}

/** Ranking sezonu: stali gracze w tabeli, goście osobno pod nią. */
export function ranking(
  sessions: readonly SessionData[],
  isGuest: (id: PlayerId) => boolean,
  by: SortBy = 'points',
) {
  const rows = sortRows(table(sessions), by)
  return { regulars: rows.filter((r) => !isGuest(r.id)), guests: rows.filter((r) => isGuest(r.id)) }
}

/** Czy wszyscy mają równo meczów (tylko ukończone rundy) — do zakończenia wieczoru. */
export function equalityStatus(session: Pick<SessionData, 'players' | 'rounds'>) {
  const rounds = session.rounds.filter(isRoundComplete)
  const counts = matchCounts(session.players, rounds)
  const values = Object.values(counts)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  return { completeRounds: rounds.length, counts, min, max, equal: min === max }
}

export interface PartnerStats {
  id: PlayerId
  matches: number
  points: number
  wins: number
  avg: number
}

export const FORM_LENGTH = 8
export const MIN_PARTNER_MATCHES = 2

export interface PlayerProfile {
  row: StatsRow
  /** Miejsce w swojej grupie (stali / goście), sortowanie po sumie punktów. */
  position: number
  guest: boolean
  /** Ostatnie mecze, od najstarszego. */
  form: Result[]
  bestPartner: PartnerStats | null
  worstPartner: PartnerStats | null
}

export function playerProfile(
  sessions: readonly SessionData[],
  id: PlayerId,
  isGuest: (id: PlayerId) => boolean,
): PlayerProfile | null {
  const chrono = sessions.slice().sort((a, b) => a.date.localeCompare(b.date))
  const { regulars, guests } = ranking(chrono, isGuest)
  const guest = isGuest(id)
  const group = guest ? guests : regulars
  const idx = group.findIndex((r) => r.id === id)
  if (idx < 0) return null

  const form: Result[] = []
  const partners = new Map<PlayerId, Omit<PartnerStats, 'avg'>>()
  for (const s of chrono)
    for (const pm of countedMatches(s)) {
      if (pm.player !== id) continue
      form.push(pm.result)
      const q = partners.get(pm.mate) ?? { id: pm.mate, matches: 0, points: 0, wins: 0 }
      q.matches++
      q.points += pm.pointsFor
      if (pm.result === 'W') q.wins++
      partners.set(pm.mate, q)
    }

  const mates = [...partners.values()]
    .filter((q) => q.matches >= MIN_PARTNER_MATCHES)
    .map((q) => ({ ...q, avg: q.points / q.matches }))
    .sort((a, b) => b.avg - a.avg)

  return {
    row: group[idx],
    position: idx + 1,
    guest,
    form: form.slice(-FORM_LENGTH),
    bestPartner: mates[0] ?? null,
    worstPartner: mates.length > 1 ? mates[mates.length - 1] : null,
  }
}
