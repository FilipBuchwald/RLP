// Bindingi i zmienne z wrangler.toml (+ .dev.vars lokalnie).
interface Env {
  DB: D1Database
  /** Cloudflare Access: domena zespołu, np. "padel.cloudflareaccess.com". Puste = Access wyłączony. */
  ACCESS_TEAM_DOMAIN?: string
  /** Cloudflare Access: Application Audience (AUD) Tag. */
  ACCESS_AUD?: string
  /** Tylko lokalnie (plik .dev.vars, działa wyłącznie na localhost) — zamiast logowania Access. */
  DEV_USER_EMAIL?: string
}
