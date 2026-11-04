// Odpowiedzi, błędy i walidacja wejścia.

export class HttpError extends Error {
  status: number
  extra: Record<string, unknown>
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status })
export const noContent = () => new Response(null, { status: 204 })
export const errorResponse = (
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
) => json({ error: message, ...extra }, status)

export const badRequest = (message: string) => new HttpError(400, message)
export const notFound = (message = 'Nie znaleziono') => new HttpError(404, message)
export const conflict = (message: string, extra?: Record<string, unknown>) =>
  new HttpError(409, message, extra)

/** Treść żądania jako obiekt (pusta treść → {}). */
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (!text.trim()) return {}
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw badRequest('Niepoprawny JSON')
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw badRequest('Oczekiwano obiektu JSON')
  return data as Record<string, unknown>
}

export function int(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max)
    throw badRequest(`Pole ${field}: liczba całkowita ${min}–${max}`)
  return v
}

export function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== 'string') throw badRequest(`Pole ${field}: tekst`)
  const s = v.trim().replace(/\s+/g, ' ')
  if (s.length < min || s.length > max) throw badRequest(`Pole ${field}: ${min}–${max} znaków`)
  return s
}

export function bool(v: unknown, field: string): boolean {
  if (typeof v !== 'boolean') throw badRequest(`Pole ${field}: true/false`)
  return v
}

export function oneOf<T extends string | number>(
  v: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (!allowed.includes(v as T)) throw badRequest(`Pole ${field}: jedno z ${allowed.join(', ')}`)
  return v as T
}

/** Parametr `?season=` (domyślnie bieżący rok). */
export function seasonParam(url: URL, fallback: number): number {
  const raw = url.searchParams.get('season')
  if (raw == null) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw badRequest('Parametr season: rok')
  return n
}
