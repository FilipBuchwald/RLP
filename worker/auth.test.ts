import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  LOCK_WINDOW_MS,
  MAX_FAILURES,
  checkCode,
  codesEqual,
  issuerFor,
  verifyAccessJwt,
  type AccessConfig,
  type AttemptStore,
} from './auth'

const cfg: AccessConfig = { teamDomain: 'padel.cloudflareaccess.com', aud: 'aud-123' }
let keys: ReturnType<typeof createLocalJWKSet>
let sign: (
  claims: Record<string, unknown>,
  opts?: { iss?: string; aud?: string; exp?: string },
) => Promise<string>
let signOther: typeof sign

beforeAll(async () => {
  const good = await generateKeyPair('RS256')
  const evil = await generateKeyPair('RS256')
  keys = createLocalJWKSet({
    keys: [{ ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'RS256' }],
  })
  const make =
    (key: CryptoKey) =>
    (claims: Record<string, unknown>, o: { iss?: string; aud?: string; exp?: string } = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(o.iss ?? 'https://padel.cloudflareaccess.com')
        .setAudience(o.aud ?? 'aud-123')
        .setIssuedAt()
        .setExpirationTime(o.exp ?? '1h')
        .sign(key)
  sign = make(good.privateKey)
  signOther = make(evil.privateKey)
})

describe('verifyAccessJwt', () => {
  it('poprawny token → e-mail (małymi literami)', async () => {
    expect(await verifyAccessJwt(await sign({ email: 'Filip@Example.com' }), cfg, keys)).toBe(
      'filip@example.com',
    )
  })
  it('podpis innym kluczem → odrzucony', async () => {
    await expect(verifyAccessJwt(await signOther({ email: 'x@y.z' }), cfg, keys)).rejects.toThrow()
  })
  it('inny AUD (token innej aplikacji) → odrzucony', async () => {
    await expect(
      verifyAccessJwt(await sign({ email: 'x@y.z' }, { aud: 'inna' }), cfg, keys),
    ).rejects.toThrow()
  })
  it('inny wystawca → odrzucony', async () => {
    await expect(
      verifyAccessJwt(
        await sign({ email: 'x@y.z' }, { iss: 'https://evil.cloudflareaccess.com' }),
        cfg,
        keys,
      ),
    ).rejects.toThrow()
  })
  it('wygasły token → odrzucony', async () => {
    await expect(
      verifyAccessJwt(await sign({ email: 'x@y.z' }, { exp: '-1m' }), cfg, keys),
    ).rejects.toThrow()
  })
  it('token bez e-maila → odrzucony', async () => {
    await expect(verifyAccessJwt(await sign({ sub: 'service' }), cfg, keys)).rejects.toThrow()
  })
  it('śmieci zamiast tokenu → odrzucone', async () => {
    await expect(verifyAccessJwt('abc.def.ghi', cfg, keys)).rejects.toThrow()
  })
  it('issuerFor akceptuje domenę z https:// i ukośnikiem', () => {
    expect(issuerFor('https://padel.cloudflareaccess.com/')).toBe(
      'https://padel.cloudflareaccess.com',
    )
  })
})

describe('kod grupy', () => {
  const memoryStore = (): AttemptStore & {
    rows: Map<string, { failures: number; windowStart: number }>
  } => {
    const rows = new Map<string, { failures: number; windowStart: number }>()
    return {
      rows,
      get: async (ip) => rows.get(ip) ?? null,
      fail: async (ip, now) => {
        const r = rows.get(ip)
        if (!r || now - r.windowStart >= LOCK_WINDOW_MS)
          rows.set(ip, { failures: 1, windowStart: now })
        else r.failures++
      },
      clear: async (ip) => void rows.delete(ip),
    }
  }

  it('codesEqual: równe / różne / różnej długości', async () => {
    expect(await codesEqual('123456', '123456')).toBe(true)
    expect(await codesEqual('123457', '123456')).toBe(false)
    expect(await codesEqual('1234567', '123456')).toBe(false)
  })

  it('spacje i wielkość liter nie mają znaczenia', async () => {
    const store = memoryStore()
    expect(await checkCode(' Padel 2026 ', 'padel2026', 'ip', store)).toBe('ok')
  })

  it('zły kod liczy się jako nieudana próba, dobry ją kasuje', async () => {
    const store = memoryStore()
    expect(await checkCode('zly', 'dobry123', 'ip', store)).toBe('wrong')
    expect(store.rows.get('ip')?.failures).toBe(1)
    expect(await checkCode('dobry123', 'dobry123', 'ip', store)).toBe('ok')
    expect(store.rows.has('ip')).toBe(false)
  })

  it(`po ${MAX_FAILURES} błędach blokada — nawet dobry kod nie przechodzi; po kwadransie znowu można`, async () => {
    const store = memoryStore()
    const t0 = 1_000_000
    for (let i = 0; i < MAX_FAILURES; i++)
      expect(await checkCode('zly', 'dobry123', 'ip', store, t0 + i)).toBe('wrong')
    expect(await checkCode('dobry123', 'dobry123', 'ip', store, t0 + 100)).toBe('locked')
    expect(await checkCode('dobry123', 'dobry123', 'inne-ip', store, t0 + 100)).toBe('ok')
    expect(await checkCode('dobry123', 'dobry123', 'ip', store, t0 + LOCK_WINDOW_MS)).toBe('ok')
  })
})
