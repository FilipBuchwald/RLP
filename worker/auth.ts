// Kto może zapisywać? Kolejność:
// 1. Cloudflare Access (ACCESS_TEAM_DOMAIN + ACCESS_AUD): podpisany token JWT — cała strona za logowaniem.
// 2. Lokalnie (localhost + DEV_USER_EMAIL z .dev.vars).
// 3. Wspólny kod grupy (sekret EDIT_CODE): czytać może każdy, zapisy wymagają nagłówka X-Edit-Code.
// 4. Nic nie skonfigurowane: tylko odczyt.
// Samemu nagłówkowi z e-mailem nigdy nie ufamy — każdy może go dopisać.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export type AuthMode = 'access' | 'dev' | 'code' | 'none'
/** Stan kodu podanego przez klienta (tylko tryb 'code'). */
export type CodeStatus = 'none' | 'ok' | 'wrong' | 'locked'

export type AuthResult =
  | { ok: true; mode: AuthMode; user: string | null; code: CodeStatus }
  | { ok: false; status: 401; message: string }

export const CODE_HEADER = 'X-Edit-Code'
/** Kto zapisał turniej w trybie kodu (kolumna sessions.created_by). */
export const CODE_USER = 'kod grupy'
export const MIN_CODE_LENGTH = 6

// --- Cloudflare Access ---

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

function accessToken(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion')
  if (header) return header
  const cookie = request.headers.get('Cookie') ?? ''
  return /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie)?.[1] ?? null
}

// --- kod grupy ---

const sha256 = async (s: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))

/** Porównanie w stałym czasie (porównujemy skróty, więc długość kodu też nie wycieka). */
export async function codesEqual(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Normalizacja: spacje i wielkość liter nie mają znaczenia (łatwiej wpisać na telefonie). */
export const normalizeCode = (s: string) => s.replace(/\s+/g, '').toLowerCase()

export const MAX_FAILURES = 10
export const LOCK_WINDOW_MS = 15 * 60 * 1000

export interface AttemptStore {
  get(ip: string): Promise<{ failures: number; windowStart: number } | null>
  fail(ip: string, now: number): Promise<void>
  clear(ip: string): Promise<void>
}

/** Sprawdza kod z blokadą: po MAX_FAILURES nieudanych próbach z IP — przerwa LOCK_WINDOW_MS. */
export async function checkCode(
  given: string,
  expected: string,
  ip: string,
  store: AttemptStore,
  now = Date.now(),
): Promise<CodeStatus> {
  const row = await store.get(ip)
  const active = row && now - row.windowStart < LOCK_WINDOW_MS
  if (active && row.failures >= MAX_FAILURES) return 'locked'
  if (await codesEqual(normalizeCode(given), normalizeCode(expected))) {
    if (row) await store.clear(ip)
    return 'ok'
  }
  await store.fail(ip, now)
  return 'wrong'
}

export function d1AttemptStore(db: D1Database): AttemptStore {
  return {
    async get(ip) {
      const r = await db
        .prepare('SELECT failures, window_start FROM code_attempts WHERE ip = ?')
        .bind(ip)
        .first<{ failures: number; window_start: number }>()
      return r ? { failures: r.failures, windowStart: r.window_start } : null
    },
    async fail(ip, now) {
      // Nowe okno, jeśli poprzednie minęło; inaczej +1.
      await db
        .prepare(
          `INSERT INTO code_attempts (ip, failures, window_start) VALUES (?1, 1, ?2)
           ON CONFLICT (ip) DO UPDATE SET
             failures = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE failures + 1 END,
             window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END`,
        )
        .bind(ip, now, LOCK_WINDOW_MS)
        .run()
    },
    async clear(ip) {
      await db.prepare('DELETE FROM code_attempts WHERE ip = ?').bind(ip).run()
    },
  }
}

// --- całość ---

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export async function authenticate(request: Request, env: Env): Promise<AuthResult> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim()
  const aud = env.ACCESS_AUD?.trim()

  if (teamDomain && aud) {
    const token = accessToken(request)
    if (!token) return { ok: false, status: 401, message: 'Brak logowania (Cloudflare Access)' }
    try {
      const cfg = { teamDomain, aud }
      const email = await verifyAccessJwt(token, cfg, remoteKeys(cfg))
      return { ok: true, mode: 'access', user: email, code: 'none' }
    } catch {
      return { ok: false, status: 401, message: 'Nieważne logowanie — odśwież stronę' }
    }
  }

  if (env.DEV_USER_EMAIL && LOCAL_HOSTS.has(new URL(request.url).hostname))
    return { ok: true, mode: 'dev', user: env.DEV_USER_EMAIL, code: 'none' }

  const expected = env.EDIT_CODE?.trim()
  if (expected && expected.length >= MIN_CODE_LENGTH) {
    const given = request.headers.get(CODE_HEADER)
    if (!given) return { ok: true, mode: 'code', user: null, code: 'none' }
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const code = await checkCode(given, expected, ip, d1AttemptStore(env.DB))
    return { ok: true, mode: 'code', user: code === 'ok' ? CODE_USER : null, code }
  }
  if (expected)
    console.warn(`EDIT_CODE jest za krótki (min. ${MIN_CODE_LENGTH} znaków) — zapisy wyłączone`)

  return { ok: true, mode: 'none', user: null, code: 'none' }
}
