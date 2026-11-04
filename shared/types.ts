// Typy domenowe wspólne dla frontendu, Workera i testów.

export type PlayerId = string
export type Pair = readonly [PlayerId, PlayerId]

/** Mecz wylosowany, jeszcze bez wyniku. */
export interface MatchDraw {
  court: number
  a: Pair
  b: Pair
}

export interface Match extends MatchDraw {
  /** null = brak wyniku */
  scoreA: number | null
  scoreB: number | null
}

/** Runda zwrócona przez `makeRound` (bez wyników). */
export interface RoundDraw {
  number: number
  sitting: PlayerId[]
  matches: MatchDraw[]
}

export interface Round {
  number: number
  sitting: PlayerId[]
  matches: Match[]
}

export interface SessionData {
  id: string
  /** YYYY-MM-DD */
  date: string
  players: PlayerId[]
  courts: number
  /** Łączna liczba punktów w meczu (16 / 21 / 24 / 32). */
  target: number
  /** Przycięcie: każdemu liczą się tylko pierwsze `cap` meczów. null = brak. */
  cap: number | null
  rounds: Round[]
  /** Wersja gracza w tym turnieju (playerId → variantId); brak wpisu = bez wersji. */
  variants?: Record<PlayerId, string>
}
