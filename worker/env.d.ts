// Bindingi z wrangler.toml i zmienne środowiskowe dostępne w Workerze.
interface Env {
  DB: D1Database
  /** Tylko lokalnie (plik .dev.vars) — zastępuje nagłówek Cloudflare Access. */
  DEV_USER_EMAIL?: string
}
