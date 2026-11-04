// Kształty danych w JSON-ie API (/api/*) — wspólne dla Workera i frontendu.
import type { PlayerProfile, StatsRow } from './stats'
import type { Match, PlayerId, Round, SessionData } from './types'

export interface PlayerDto {
  id: PlayerId
  name: string
  color: string
  isGuest: boolean
}

/** GET /api/me */
export interface MeDto {
  /** access = Cloudflare Access, code = wspólny kod grupy, dev = lokalnie, none = tylko odczyt */
  mode: 'access' | 'dev' | 'code' | 'none'
  user: string | null
  canWrite: boolean
  /** Stan podanego kodu (tryb 'code'). */
  code: 'none' | 'ok' | 'wrong' | 'locked'
}

export type SessionMode = 'plan' | 'open'
export type SessionStatus = 'live' | 'done'

export interface MatchDto extends Match {
  id: string
}

export interface RoundDto extends Round {
  id: string
  matches: MatchDto[]
}

/** Turniej z rundami i meczami. Zgodny z `SessionData`, więc działa z funkcjami z shared/stats. */
export interface SessionDto extends SessionData {
  season: number
  mode: SessionMode
  plannedRounds: number | null
  status: SessionStatus
  createdBy: string | null
  /** Kiedy poprawiono wyniki po zapisaniu turnieju (ISO, UTC), null = nigdy. */
  editedAt: string | null
  rounds: RoundDto[]
}

export interface RankingDto {
  season: number
  regulars: StatsRow[]
  guests: StatsRow[]
  totals: { nights: number; matches: number; players: number }
}

export interface PlayerStatsDto {
  season: number
  player: PlayerDto
  /** null, gdy gracz nie zagrał jeszcze w tym sezonie */
  profile: PlayerProfile | null
}

/** Treść odpowiedzi 409 z POST /api/sessions/:id/finish, gdy liczby meczów są nierówne. */
export interface UnequalDto {
  error: string
  code: 'unequal'
  counts: Record<PlayerId, number>
  min: number
  max: number
  completeRounds: number
  nextEqualRound: number
}

// --- treści żądań ---

export interface CreatePlayerBody {
  name: string
  isGuest?: boolean
}
export interface UpdatePlayerBody {
  name?: string
  color?: string
  isGuest?: boolean
}
export interface CreateSessionBody {
  playerIds: PlayerId[]
  targetPoints: number
  courts: number
  mode: SessionMode
  plannedRounds?: number
}
export interface ScoreBody {
  scoreA: number
}
export interface FinishBody {
  cap?: number
}
/** Poprawki wyników zapisanego turnieju — wszystkie naraz (atomowo). */
export interface ScoresBody {
  scores: { matchId: string; scoreA: number }[]
}

/** Kopia zapasowa: komplet danych w jednym pliku. */
export interface ExportDto {
  app: 'padel-liga'
  version: 1
  exportedAt: string
  players: PlayerDto[]
  sessions: SessionDto[]
}
