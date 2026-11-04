// Kto wysłał żądanie? Na produkcji: podpisany token Cloudflare Access (JWT),
// lokalnie: DEV_USER_EMAIL z .dev.vars. Samemu nagłówkowi z e-mailem nie ufamy —
// każdy może go dopisać, a podpisu tokenu nie da się podrobić.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export type AuthResult =
  { ok: true; email: string | null } | { ok: false; status: 401; message: string }

export interface AccessConfig {
  /** np. "padel.cloudflareaccess.com" */
  teamDomain: string
  /** Application Audience (AUD) Tag aplikacji w Cloudflare Access */
  aud: string
}

export const issuerFor = (teamDomain: string) =>
  `https://${teamDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`

/** Weryfikuje token Access: podpis, wystawca, odbiorca (AUD), ważność. Zwraca e-mail. */
export async function verifyAccessJwt(
  token: string,
  cfg: AccessConfig,
  keys: JWTVerifyGetKey,
): Promise<string> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: issuerFor(cfg.teamDomain),
    audience: cfg.aud,
    algorithms: ['RS256'],
  })
  if (typeof payload.email !== 'string' || !payload.email) throw new Error('Token bez e-maila')
  return payload.email.toLowerCase()
}

// Klucze publiczne Access — pobierane raz na instancję Workera (jose sam je cache'uje i odświeża).
let jwks: { issuer: string; keys: JWTVerifyGetKey } | null = null
function remoteKeys(cfg: AccessConfig): JWTVerifyGetKey {
  const issuer = issuerFor(cfg.teamDomain)
  if (jwks?.issuer !== issuer)
    jwks = { issuer, keys: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)) }
  return jwks.keys
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function tokenFrom(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion')
  if (header) return header
  const cookie = request.headers.get('Cookie') ?? ''
  return /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie)?.[1] ?? null
}

export async function authenticate(request: Request, env: Env): Promise<AuthResult> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim()
  const aud = env.ACCESS_AUD?.trim()

  if (teamDomain && aud) {
    const token = tokenFrom(request)
    if (!token) return { ok: false, status: 401, message: 'Brak logowania (Cloudflare Access)' }
    try {
      const cfg = { teamDomain, aud }
      return { ok: true, email: await verifyAccessJwt(token, cfg, remoteKeys(cfg)) }
    } catch {
      return { ok: false, status: 401, message: 'Nieważne logowanie — odśwież stronę' }
    }
  }

  // Bez konfiguracji Access: e-mail z .dev.vars działa wyłącznie na localhost.
  if (env.DEV_USER_EMAIL && LOCAL_HOSTS.has(new URL(request.url).hostname))
    return { ok: true, email: env.DEV_USER_EMAIL }

  // Brak konfiguracji na produkcji: odczyt działa, zapisy odrzuci router (fail closed).
  return { ok: true, email: null }
}
