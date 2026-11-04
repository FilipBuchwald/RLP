import { useEffect, useState } from 'react'
import { api, type Health } from '../api'

/** Tymczasowa karta z Etapu 1: pokazuje, czy działa API (Pages Functions) i D1. */
export function EnvStatus() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <>
      <h2>Status środowiska</h2>
      <div className="card small">
        <div className="kv">
          <span className="muted">API</span>
          <b className={error ? 'err' : health ? 'ok' : 'muted'}>
            {error ? 'błąd' : health ? 'działa' : 'sprawdzam…'}
          </b>
        </div>
        <div className="kv">
          <span className="muted">Baza D1</span>
          <b>{health?.db ? `połączona · tabel: ${health.db.tables}` : '—'}</b>
        </div>
        <div className="kv">
          <span className="muted">Zalogowany jako</span>
          <b>{health?.user ?? '—'}</b>
        </div>
      </div>
    </>
  )
}
