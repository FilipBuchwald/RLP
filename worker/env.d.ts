// Bindingi i zmienne z wrangler.toml (+ .dev.vars lokalnie).
interface Env {
  DB: D1Database
  /** Cloudflare Access: domena zespołu, np. "padel.cloudflareaccess.com". Puste = Access wyłączony. */
  ACCESS_TEAM_DOMAIN?: string
  /** Cloudflare Access: Application Audience (AUD) Tag. */
  ACCESS_AUD?: string
  /** Wspólny kod grupy do zapisów (sekret: `wrangler secret put EDIT_CODE`, min. 6 znaków). */
  EDIT_CODE?: string
  /** Tylko lokalnie (plik .dev.vars, działa wyłącznie na localhost) — zamiast logowania Access. */
  DEV_USER_EMAIL?: string
}
