// Klient /api. Frontend rozmawia wyłącznie z Workerem — nigdy bezpośrednio z bazą.

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<T>
}

export type Health = {
  ok: boolean
  db: { now: string; tables: number } | null
  user: string | null
}

export const api = {
  health: () => request<Health>('/health'),
}
