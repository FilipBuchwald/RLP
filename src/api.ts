// Klient /api. Frontend rozmawia wyłącznie z Workerem — nigdy bezpośrednio z bazą.
import type {
  CreatePlayerBody,
  CreateSessionBody,
  PlayerDto,
  PlayerStatsDto,
  RankingDto,
  SessionDto,
  UnequalDto,
  UpdatePlayerBody,
} from '../shared/dto'
import type { SortBy } from '../shared/stats'

export class ApiError extends Error {
  status: number
  data: Record<string, unknown> | null
  constructor(status: number, message: string, data: Record<string, unknown> | null) {
    super(message)
    this.status = status
    this.data = data
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // np. strona logowania Cloudflare Access zamiast JSON-a
  }
  if (!res.ok) {
    const d = (data ?? null) as Record<string, unknown> | null
    const msg = typeof d?.error === 'string' ? d.error : `Błąd ${res.status}`
    throw new ApiError(res.status, msg, d)
  }
  return data as T
}

export const isUnequal = (e: unknown): e is ApiError & { data: UnequalDto } =>
  e instanceof ApiError && e.status === 409 && e.data?.code === 'unequal'

export const api = {
  players: () => request<PlayerDto[]>('GET', '/players'),
  createPlayer: (body: CreatePlayerBody) => request<PlayerDto>('POST', '/players', body),
  updatePlayer: (id: string, body: UpdatePlayerBody) =>
    request<PlayerDto>('PATCH', `/players/${id}`, body),
  playerStats: (id: string, season: number) =>
    request<PlayerStatsDto>('GET', `/players/${id}/stats?season=${season}`),

  ranking: (season: number, sort: SortBy = 'points') =>
    request<RankingDto>('GET', `/ranking?season=${season}&sort=${sort}`),
  history: (season: number) => request<SessionDto[]>('GET', `/sessions?season=${season}`),

  live: () => request<SessionDto | null>('GET', '/sessions/live'),
  createSession: (body: CreateSessionBody) => request<SessionDto>('POST', '/sessions', body),
  setScore: (matchId: string, scoreA: number) =>
    request<SessionDto>('PUT', `/matches/${matchId}`, { scoreA }),
  nextRound: (id: string) => request<SessionDto>('POST', `/sessions/${id}/rounds`),
  /** null = wieczór bez rozegranych rund został usunięty */
  finish: (id: string, cap?: number) =>
    request<SessionDto | null>('POST', `/sessions/${id}/finish`, cap === undefined ? {} : { cap }),
  discard: (id: string) => request<null>('DELETE', `/sessions/${id}`),
}
