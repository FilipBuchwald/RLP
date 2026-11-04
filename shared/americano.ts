// Americano: losowanie rund i arytmetyka „równej liczby meczów”.
// Logika przeniesiona z prototype-reference.html (makeRound, stepFor, opcje planu).
import type { MatchDraw, Pair, PlayerId, RoundDraw } from './types'

export const TARGET_POINTS = [16, 21, 24, 32] as const
export const MAX_PLAN_ROUNDS = 30
const MAX_PLAN_OPTIONS = 5

export type Random = () => number

/** Deterministyczny generator (LCG) — do testów i danych demo. */
export function seededRandom(seed: number): Random {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Klucz pary niezależny od kolejności. */
export const pairKey = (x: PlayerId, y: PlayerId) => (x < y ? `${x}|${y}` : `${y}|${x}`)

/** Wszystkie podziały listy (parzystej długości) na pary. Dla 8 elementów: 105. */
export function pairings<T>(items: readonly T[]): [T, T][][] {
  if (items.length === 0) return [[]]
  const [first, ...rest] = items
  const out: [T, T][][] = []
  rest.forEach((x, i) => {
    const remaining = rest.filter((_, j) => j !== i)
    for (const p of pairings(remaining)) out.push([[first, x], ...p])
  })
  return out
}

/** Faktyczna liczba kortów: 2 korty dopiero od 8 graczy. */
export function effectiveCourts(playerCount: number, courtsWanted: number): number {
  return Math.max(1, Math.min(courtsWanted, Math.floor(playerCount / 4)))
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

/** Co ile rund wszyscy mają równo meczów: N / gcd(N, 4 × korty). */
export function stepFor(playerCount: number, courtsWanted: number): number {
  const courts = effectiveCourts(playerCount, courtsWanted)
  return playerCount / gcd(playerCount, 4 * courts)
}

/** Najbliższa runda (> `doneRounds`), po której wszyscy będą mieli równo meczów. */
export function nextEqualRound(doneRounds: number, step: number): number {
  return (Math.floor(doneRounds / step) + 1) * step
}

/** Szacowany czas jednej rundy w minutach. */
export function minutesPerRound(target: number): number {
  if (target <= 16) return 9
  if (target <= 21) return 12
  if (target <= 24) return 13
  return 17
}

export interface PlanOption {
  rounds: number
  /** Ile meczów zagra każdy gracz. */
  perPlayer: number
  minutes: number
}

/** Podpowiedzi dla trybu „Plan rund”: wielokrotności `step`, każdy gra ≥ 2 mecze. */
export function planOptions(playerCount: number, courtsWanted: number, target: number) {
  const opts: PlanOption[] = []
  if (playerCount < 4) return opts
  const courts = effectiveCourts(playerCount, courtsWanted)
  const step = stepFor(playerCount, courts)
  for (let k = 1; opts.length < MAX_PLAN_OPTIONS && k * step <= MAX_PLAN_ROUNDS; k++) {
    const rounds = k * step
    const perPlayer = (rounds * 4 * courts) / playerCount
    if (perPlayer >= 2) opts.push({ rounds, perPlayer, minutes: rounds * minutesPerRound(target) })
  }
  return opts
}

/** Minimalny kształt rundy potrzebny do losowania (wyniki są nieistotne). */
export interface RoundHistory {
  sitting: readonly PlayerId[]
  matches: readonly Pick<MatchDraw, 'a' | 'b'>[]
}

/**
 * Losuje kolejną rundę.
 * 1. Pauzują ci, którzy pauzowali najmniej (kara 0,6 za pauzę w poprzedniej rundzie),
 *    potem ci, którzy zagrali najwięcej, potem losowo.
 * 2. Z grających wybiera podział na pary i zestawienie par w mecze o najniższym koszcie:
 *    Σ partner² × 100 + Σ rywal² × 10 + random().
 */
export function makeRound(
  players: readonly PlayerId[],
  history: readonly RoundHistory[],
  courtsWanted: number,
  random: Random = Math.random,
): RoundDraw {
  if (players.length < 4) throw new Error('Potrzeba minimum 4 graczy')

  const played = new Map<PlayerId, number>(players.map((p) => [p, 0]))
  const sat = new Map<PlayerId, number>(players.map((p) => [p, 0]))
  const partner = new Map<string, number>()
  const opp = new Map<string, number>()
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

  for (const r of history) {
    for (const p of r.sitting) inc(sat, p)
    for (const m of r.matches) {
      for (const p of [...m.a, ...m.b]) inc(played, p)
      inc(partner, pairKey(m.a[0], m.a[1]))
      inc(partner, pairKey(m.b[0], m.b[1]))
      for (const x of m.a) for (const y of m.b) inc(opp, pairKey(x, y))
    }
  }

  const courts = effectiveCourts(players.length, courtsWanted)
  const sitCount = players.length - courts * 4
  const lastSat = new Set(history.at(-1)?.sitting ?? [])

  const order = players
    .map((p) => ({
      p,
      a: (sat.get(p) ?? 0) + (lastSat.has(p) ? 0.6 : 0),
      b: -(played.get(p) ?? 0),
      c: random(),
    }))
    .sort((x, y) => x.a - y.a || x.b - y.b || x.c - y.c)
  const sitting = order.slice(0, sitCount).map((o) => o.p)
  const sittingSet = new Set(sitting)
  const playing = players.filter((p) => !sittingSet.has(p))

  let best: MatchDraw[] = []
  let bestCost = Infinity
  for (const pairs of pairings(playing)) {
    const partnerCost = pairs.reduce(
      (s, [x, y]) => s + (partner.get(pairKey(x, y)) ?? 0) ** 2 * 100,
      0,
    )
    if (partnerCost > bestCost) continue
    for (const matchup of pairings(pairs.map((_, i) => i))) {
      let cost = partnerCost
      for (const [i, j] of matchup)
        for (const x of pairs[i])
          for (const y of pairs[j]) cost += (opp.get(pairKey(x, y)) ?? 0) ** 2 * 10
      cost += random()
      if (cost < bestCost) {
        bestCost = cost
        best = matchup.map(([i, j], ci) => ({
          court: ci + 1,
          a: pairs[i] as Pair,
          b: pairs[j] as Pair,
        }))
      }
    }
  }

  return { number: history.length + 1, sitting, matches: best }
}
