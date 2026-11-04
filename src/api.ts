// Klient /api. Frontend rozmawia wyłącznie z Workerem — nigdy bezpośrednio z bazą.
import type {
  CreatePlayerBody,
  MeDto,
  CreateSessionBody,
  ScoresBody,
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

const SESSION_EXPIRED = 'Logowanie wygasło — odśwież stronę'

// Wspólny kod grupy (tryb bez Cloudflare Access) — zapamiętany na tym telefonie.
const CODE_KEY = 'padel-edit-code'
export const editCode = {
  get: () => {
    try {
      return localStorage.getItem(CODE_KEY)
    } catch {
      return null
    }
  },
  set: (code: string) => localStorage.setItem(CODE_KEY, code),
  clear: () => localStorage.removeItem(CODE_KEY),
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    const headers: Record<string, string> = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    // Kod tylko przy zapisach i /me — odczyty (polling) go nie potrzebują i nie nabijają licznika prób.
    const code = editCode.get()
    if (code && (method !== 'GET' || path === '/me')) headers['X-Edit-Code'] = code
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Wygasła sesja Cloudflare Access = przekierowanie na stronę logowania. Nie podążamy za nim.
      redirect: 'manual',
    })
  } catch {
    throw new ApiError(0, 'Brak połączenia z serwerem', null)
  }
  if (res.type === 'opaqueredirect') throw new ApiError(401, SESSION_EXPIRED, null)
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // np. strona logowania Cloudflare Access zamiast JSON-a
  }
  if (res.status === 401 && (data as { code?: string } | null)?.code === 'wrong_code')
    editCode.clear()
  if (!res.ok) {
    const d = (data ?? null) as Record<string, unknown> | null
    const msg = typeof d?.error === 'string' ? d.error : `Błąd ${res.status}`
    throw new ApiError(res.status, msg, d)
  }
  return data as T
}

/** Serwer odrzucił zapis, bo brak kodu albo kod jest zły. */
export const isCodeError = (e: unknown) =>
  e instanceof ApiError &&
  (e.status === 429 ||
    (e.status === 401 && ['need_code', 'wrong_code'].includes(String(e.data?.code))))

export const isUnequal = (e: unknown): e is ApiError & { data: UnequalDto } =>
  e instanceof ApiError && e.status === 409 && e.data?.code === 'unequal'

export const api = {
  me: async () => {
    const me = await request<MeDto>('GET', '/me')
    if (me.code === 'wrong') editCode.clear() // np. grupa zmieniła kod
    return me
  },
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
  /** Cofa ostatnią rundę wieczoru na żywo; `number` = numer tej rundy (chroni przed podwójnym cofnięciem). */
  undoRound: (id: string, number: number) =>
    request<SessionDto>('DELETE', `/sessions/${id}/rounds/${number}`),
  /** Poprawki wyników w zapisanym wieczorze — wszystkie naraz. */
  editScores: (id: string, scores: ScoresBody['scores']) =>
    request<SessionDto>('PUT', `/sessions/${id}/scores`, { scores } satisfies ScoresBody),
}

/** Kopia zapasowa (JSON) — zwykły link do pobrania. */
export const EXPORT_URL = '/api/export'
