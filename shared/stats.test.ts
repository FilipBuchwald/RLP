import { describe, expect, it } from 'vitest'
import { makeRound, seededRandom } from './americano'
import {
  cutKey,
  equalityStatus,
  excluded,
  matchCounts,
  playerProfile,
  ranking,
  sortRows,
  table,
} from './stats'
import type { Match, Pair, Round, SessionData } from './types'

const m = (court: number, a: Pair, b: Pair, scoreA: number | null, target = 24): Match => ({
  court,
  a,
  b,
  scoreA,
  scoreB: scoreA == null ? null : target - scoreA,
})

const session = (
  over: Partial<SessionData> & Pick<SessionData, 'players' | 'rounds'>,
): SessionData => ({
  id: 's1',
  date: '2026-11-01',
  courts: 1,
  target: 24,
  cap: null,
  ...over,
})

/** Wieczór rozegrany „naprawdę”: losowanie z makeRound i losowe wyniki. */
function played(players: string[], rounds: number, seed: number, over: Partial<SessionData> = {}) {
  const random = seededRandom(seed)
  const rs: Round[] = []
  for (let i = 0; i < rounds; i++) {
    const draw = makeRound(players, rs, 1, random)
    rs.push({
      ...draw,
      matches: draw.matches.map((d) => m(d.court, d.a, d.b, Math.floor(random() * 25))),
    })
  }
  return session({ players, rounds: rs, ...over })
}

describe('table', () => {
  it('każdy gracz dostaje punkty swojej pary; W/R/P', () => {
    const s = session({
      players: ['a', 'b', 'c', 'd'],
      rounds: [
        { number: 1, sitting: [], matches: [m(1, ['a', 'b'], ['c', 'd'], 14)] },
        { number: 2, sitting: [], matches: [m(1, ['a', 'c'], ['b', 'd'], 12)] },
      ],
    })
    const rows = Object.fromEntries(table([s]).map((r) => [r.id, r]))
    expect(rows.a).toMatchObject({
      points: 26,
      matches: 2,
      wins: 1,
      draws: 1,
      losses: 0,
      nights: 1,
      avg: 13,
    })
    expect(rows.d).toMatchObject({
      points: 22,
      matches: 2,
      wins: 0,
      draws: 1,
      losses: 1,
      winRate: 0,
    })
  })

  it('pomija mecze bez wyniku', () => {
    const s = session({
      players: ['a', 'b', 'c', 'd'],
      rounds: [{ number: 1, sitting: [], matches: [m(1, ['a', 'b'], ['c', 'd'], null)] }],
    })
    expect(table([s]).find((r) => r.id === 'a')).toMatchObject({
      points: 0,
      matches: 0,
      nights: 1,
      avg: 0,
    })
  })

  it('sumuje wiele wieczorów i liczy wieczory', () => {
    const s1 = played(['a', 'b', 'c', 'd', 'e'], 5, 1, { id: 's1' })
    const s2 = played(['a', 'b', 'c', 'd'], 3, 2, { id: 's2' })
    const a = table([s1, s2]).find((r) => r.id === 'a')!
    const a1 = table([s1]).find((r) => r.id === 'a')!
    const a2 = table([s2]).find((r) => r.id === 'a')!
    expect(a.points).toBe(a1.points + a2.points)
    expect(a.matches).toBe(a1.matches + a2.matches)
    expect(a.nights).toBe(2)
  })

  it('sortowanie: suma albo średnia', () => {
    const rows = [
      { id: 'x', points: 100, avg: 10 },
      { id: 'y', points: 90, avg: 15 },
    ].map((r) => ({ matches: 0, wins: 0, draws: 0, losses: 0, nights: 1, winRate: 0, ...r }))
    expect(sortRows(rows, 'points').map((r) => r.id)).toEqual(['x', 'y'])
    expect(sortRows(rows, 'avg').map((r) => r.id)).toEqual(['y', 'x'])
  })
})

describe('przycinanie (cap)', () => {
  it('bez cap nic nie jest odcięte', () => {
    expect(excluded(played(['a', 'b', 'c', 'd', 'e'], 3, 3)).size).toBe(0)
  })

  it('każdemu liczą się dokładnie jego pierwsze `cap` meczów', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const base = played(players, 4, 11) // 7 graczy, 1 kort: po 4 rundach liczby meczów nierówne
    const { min, equal } = equalityStatus(base)
    expect(equal).toBe(false)

    const s = { ...base, cap: min }
    const ex = excluded(s)
    const rows = table([s])
    for (const p of players) {
      // policzone mecze = cap
      expect(rows.find((r) => r.id === p)!.matches).toBe(min)
      // odcięte są te późniejsze: po kolei rundy, pierwsze `cap` liczone, reszta nie
      const mine = s.rounds.flatMap((r) =>
        r.matches
          .filter((x) => [...x.a, ...x.b].includes(p))
          .map((x) => ex.has(cutKey(r.number, x.court, p))),
      )
      expect(mine).toEqual(mine.map((_, i) => i >= min))
    }
  })

  it('kolejność rund w danych nie ma znaczenia (liczymy po numerze rundy)', () => {
    const s = { ...played(['a', 'b', 'c', 'd', 'e'], 6, 4), cap: 3 }
    const shuffled = { ...s, rounds: s.rounds.slice().reverse() }
    expect([...excluded(shuffled)].sort()).toEqual([...excluded(s)].sort())
  })

  it('punkty odciętych meczów nie wchodzą do tabeli', () => {
    const s = session({
      players: ['a', 'b', 'c', 'd', 'e'],
      cap: 1,
      rounds: [
        { number: 1, sitting: ['e'], matches: [m(1, ['a', 'b'], ['c', 'd'], 20)] },
        { number: 2, sitting: ['d'], matches: [m(1, ['a', 'e'], ['b', 'c'], 4)] },
      ],
    })
    const rows = Object.fromEntries(table([s]).map((r) => [r.id, r]))
    expect(rows.a).toMatchObject({ points: 20, matches: 1 }) // 2. mecz odcięty
    expect(rows.e).toMatchObject({ points: 4, matches: 1 }) // dla e to pierwszy mecz
    expect(excluded(s)).toEqual(new Set([cutKey(2, 1, 'a'), cutKey(2, 1, 'b'), cutKey(2, 1, 'c')]))
  })
})

describe('equalityStatus', () => {
  it('ignoruje niedokończoną rundę', () => {
    const s = session({
      players: ['a', 'b', 'c', 'd', 'e'],
      rounds: [
        { number: 1, sitting: ['e'], matches: [m(1, ['a', 'b'], ['c', 'd'], 12)] },
        { number: 2, sitting: ['a'], matches: [m(1, ['b', 'e'], ['c', 'd'], null)] },
      ],
    })
    const st = equalityStatus(s)
    expect(st.completeRounds).toBe(1)
    expect(st.counts).toEqual({ a: 1, b: 1, c: 1, d: 1, e: 0 })
    expect(st).toMatchObject({ min: 0, max: 1, equal: false })
  })

  it('matchCounts liczy tylko mecze z wynikiem', () => {
    expect(
      matchCounts(
        ['a', 'b', 'c', 'd'],
        [{ number: 1, sitting: [], matches: [m(1, ['a', 'b'], ['c', 'd'], null)] }],
      ),
    ).toEqual({ a: 0, b: 0, c: 0, d: 0 })
  })
})

describe('ranking i profil', () => {
  const s1 = session({
    id: 's1',
    date: '2026-10-01',
    players: ['a', 'b', 'c', 'g'],
    rounds: [
      { number: 1, sitting: [], matches: [m(1, ['a', 'b'], ['c', 'g'], 16)] },
      { number: 2, sitting: [], matches: [m(1, ['a', 'c'], ['b', 'g'], 10)] },
      { number: 3, sitting: [], matches: [m(1, ['a', 'g'], ['b', 'c'], 12)] },
    ],
  })
  const s2 = session({
    id: 's2',
    date: '2026-10-08',
    players: ['a', 'b', 'c', 'g'],
    rounds: [
      { number: 1, sitting: [], matches: [m(1, ['a', 'b'], ['c', 'g'], 18)] },
      { number: 2, sitting: [], matches: [m(1, ['a', 'c'], ['b', 'g'], 6)] },
    ],
  })
  const isGuest = (id: string) => id === 'g'

  it('goście w osobnej sekcji', () => {
    const r = ranking([s1, s2], isGuest)
    expect(r.regulars.map((x) => x.id).sort()).toEqual(['a', 'b', 'c'])
    expect(r.guests.map((x) => x.id)).toEqual(['g'])
  })

  it('profil: forma od najstarszego, najlepszy i najsłabszy partner (min. 2 mecze)', () => {
    // podane w odwrotnej kolejności — profil sam sortuje po dacie
    const p = playerProfile([s2, s1], 'a', isGuest)!
    expect(p.form).toEqual(['W', 'P', 'R', 'W', 'P'])
    expect(p.bestPartner).toMatchObject({ id: 'b', matches: 2, avg: 17 })
    expect(p.worstPartner).toMatchObject({ id: 'c', matches: 2, avg: 8 })
    expect(p.row).toMatchObject({ points: 62, matches: 5, nights: 2 })
    expect(p.guest).toBe(false)
    expect(p.position).toBe(2) // b ma 78 pkt, a 62
  })

  it('profil gościa: miejsce wśród gości', () => {
    expect(playerProfile([s1, s2], 'g', isGuest)).toMatchObject({ guest: true, position: 1 })
  })

  it('forma: maks. 8 ostatnich meczów', () => {
    const s = played(['a', 'b', 'c', 'd'], 12, 9)
    expect(playerProfile([s], 'a', () => false)!.form).toHaveLength(8)
  })

  it('nieznany gracz → null', () => {
    expect(playerProfile([s1], 'zzz', isGuest)).toBeNull()
  })
})
