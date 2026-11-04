import { describe, expect, it } from 'vitest'
import {
  effectiveCourts,
  makeRound,
  nextEqualRound,
  pairKey,
  pairings,
  planOptions,
  seededRandom,
  stepFor,
  type Random,
} from './americano'
import type { PlayerId, RoundDraw } from './types'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`)

function simulate(players: PlayerId[], courts: number, rounds: number, random: Random) {
  const history: RoundDraw[] = []
  for (let i = 0; i < rounds; i++) history.push(makeRound(players, history, courts, random))
  return history
}

function tally(players: PlayerId[], rounds: RoundDraw[]) {
  const played = new Map(players.map((p) => [p, 0]))
  const sat = new Map(players.map((p) => [p, 0]))
  for (const r of rounds) {
    r.sitting.forEach((p) => sat.set(p, sat.get(p)! + 1))
    r.matches.forEach((m) => [...m.a, ...m.b].forEach((p) => played.set(p, played.get(p)! + 1)))
  }
  const spread = (m: Map<string, number>) => Math.max(...m.values()) - Math.min(...m.values())
  return { played, sat, playedSpread: spread(played), satSpread: spread(sat) }
}

/** Wszystkie konfiguracje z planu: 4–10 graczy × 1–2 korty. */
const CONFIGS = ids(7).flatMap((_, i) => [1, 2].map((courts) => ({ n: i + 4, courts })))
const SEEDS = [1, 7, 2026, 31337, 99991]

describe('pairings', () => {
  it('liczy wszystkie podziały na pary', () => {
    expect(pairings(ids(2))).toHaveLength(1)
    expect(pairings(ids(4))).toHaveLength(3)
    expect(pairings(ids(8))).toHaveLength(105)
  })
})

describe('stepFor / effectiveCourts', () => {
  it('przykłady z planu (1 kort)', () => {
    expect([4, 5, 6, 7, 8].map((n) => stepFor(n, 1))).toEqual([1, 5, 3, 7, 2])
  })
  it('8 graczy na 2 kortach: co 1 rundę', () => expect(stepFor(8, 2)).toBe(1))
  it('2 korty dopiero od 8 graczy', () => {
    expect(effectiveCourts(7, 2)).toBe(1)
    expect(effectiveCourts(8, 2)).toBe(2)
    expect(stepFor(6, 2)).toBe(stepFor(6, 1))
  })
  it('nextEqualRound: najbliższa wielokrotność step po bieżącej rundzie', () => {
    expect(nextEqualRound(0, 3)).toBe(3)
    expect(nextEqualRound(2, 3)).toBe(3)
    expect(nextEqualRound(3, 3)).toBe(6)
  })
})

describe('planOptions', () => {
  it.each(CONFIGS)(
    '$n graczy, $courts kort(y): wielokrotności step, ≥ 2 mecze, ≤ 30 rund',
    ({ n, courts }) => {
      const step = stepFor(n, courts)
      const opts = planOptions(n, courts, 24)
      expect(opts.length).toBeGreaterThan(0)
      expect(opts.length).toBeLessThanOrEqual(5)
      for (const o of opts) {
        expect(o.rounds % step).toBe(0)
        expect(o.rounds).toBeLessThanOrEqual(30)
        expect(o.perPlayer).toBeGreaterThanOrEqual(2)
        expect(Number.isInteger(o.perPlayer)).toBe(true)
        expect(o.minutes).toBe(o.rounds * 13)
      }
    },
  )
  it('4 graczy: od 2 rund (1 runda = 1 mecz to za mało)', () => {
    expect(planOptions(4, 1, 24).map((o) => o.rounds)).toEqual([2, 3, 4, 5, 6])
  })
  it('6 graczy: 3, 6, 9… rund po 2, 4, 6… meczów', () => {
    expect(planOptions(6, 1, 16).slice(0, 2)).toEqual([
      { rounds: 3, perPlayer: 2, minutes: 27 },
      { rounds: 6, perPlayer: 4, minutes: 54 },
    ])
  })
  it('mniej niż 4 graczy: brak opcji', () => expect(planOptions(3, 1, 24)).toEqual([]))
})

describe('makeRound', () => {
  it('odrzuca mniej niż 4 graczy', () => {
    expect(() => makeRound(ids(3), [], 1)).toThrow()
  })

  it.each(CONFIGS)('$n graczy, $courts kort(y): poprawny kształt rundy', ({ n, courts }) => {
    const players = ids(n)
    const c = effectiveCourts(n, courts)
    const rounds = simulate(players, courts, 6, seededRandom(n * 10 + courts))
    rounds.forEach((r, i) => {
      expect(r.number).toBe(i + 1)
      expect(r.matches.map((m) => m.court)).toEqual(Array.from({ length: c }, (_, k) => k + 1))
      expect(r.sitting).toHaveLength(n - 4 * c)
      const everyone = [...r.sitting, ...r.matches.flatMap((m) => [...m.a, ...m.b])]
      expect(everyone.slice().sort()).toEqual(players.slice().sort())
    })
  })

  it.each(CONFIGS)(
    '$n graczy, $courts kort(y): równe pauzy w każdej chwili (różnica ≤ 1)',
    ({ n, courts }) => {
      const players = ids(n)
      for (const seed of SEEDS) {
        const rounds = simulate(players, courts, 3 * stepFor(n, courts) + 2, seededRandom(seed))
        for (let k = 1; k <= rounds.length; k++)
          expect(tally(players, rounds.slice(0, k)).satSpread).toBeLessThanOrEqual(1)
      }
    },
  )

  it.each(CONFIGS)(
    '$n graczy, $courts kort(y): po każdych `step` rundach wszyscy mają równo meczów',
    ({ n, courts }) => {
      const players = ids(n)
      const step = stepFor(n, courts)
      for (const seed of SEEDS) {
        const rounds = simulate(players, courts, 3 * step, seededRandom(seed))
        for (let k = step; k <= rounds.length; k += step)
          expect(tally(players, rounds.slice(0, k)).playedSpread).toBe(0)
      }
    },
  )

  it.each(CONFIGS)(
    '$n graczy, $courts kort(y): nie pauzuje dwa razy z rzędu, gdy nie musi',
    ({ n, courts }) => {
      const players = ids(n)
      const sitCount = n - 4 * effectiveCourts(n, courts)
      if (sitCount === 0 || 2 * sitCount > n) return
      for (const seed of SEEDS) {
        const rounds = simulate(players, courts, 2 * stepFor(n, courts), seededRandom(seed))
        for (let i = 1; i < rounds.length; i++) {
          const prev = new Set(rounds[i - 1].sitting)
          expect(rounds[i].sitting.filter((p) => prev.has(p))).toEqual([])
        }
      }
    },
  )

  it.each(CONFIGS)(
    '$n graczy, $courts kort(y): brak powtórki partnera, gdy da się jej uniknąć',
    ({ n, courts }) => {
      const players = ids(n)
      for (const seed of SEEDS) {
        const random = seededRandom(seed)
        const history: RoundDraw[] = []
        // Do n−1 rund: w tym zakresie powtórki partnerów zwykle da się jeszcze unikać.
        for (let i = 0; i < n - 1; i++) {
          const partners = new Set(
            history.flatMap((r) => r.matches.flatMap((m) => [pairKey(...m.a), pairKey(...m.b)])),
          )
          const round = makeRound(players, history, courts, random)
          const playing = round.matches.flatMap((m) => [...m.a, ...m.b])
          const avoidable = pairings(playing).some((pr) =>
            pr.every(([x, y]) => !partners.has(pairKey(x, y))),
          )
          const repeats = round.matches
            .flatMap((m) => [m.a, m.b])
            .filter((t) => partners.has(pairKey(...t)))
          if (avoidable) expect(repeats).toEqual([])
          history.push(round)
        }
      }
    },
  )

  it('4 graczy: przez 3 rundy każdy gra z każdym jako partner', () => {
    const rounds = simulate(ids(4), 1, 3, seededRandom(5))
    const partners = rounds.flatMap((r) =>
      r.matches.flatMap((m) => [pairKey(...m.a), pairKey(...m.b)]),
    )
    expect(new Set(partners).size).toBe(6)
  })

  it('jest deterministyczny przy tym samym ziarnie', () => {
    const a = simulate(ids(7), 1, 5, seededRandom(42))
    const b = simulate(ids(7), 1, 5, seededRandom(42))
    expect(a).toEqual(b)
  })
})
