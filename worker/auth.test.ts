import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { issuerFor, verifyAccessJwt, type AccessConfig } from './auth'

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
