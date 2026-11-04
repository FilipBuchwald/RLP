import { pickColor } from '../../shared/colors'
import { getPlayer, listPlayers, newId } from '../db'
import { badRequest, bool, conflict, json, noContent, notFound, readBody, str } from '../http'
import type { PlayerDto } from '../../shared/dto'
import type { Handler } from '../router'

const NAME_MAX = 20
const COLOR_RE = /^#[0-9a-f]{6}$/i

// Porównanie w JS, bo lower() w SQLite nie zna polskich liter (Ł, Ś…).
const norm = (s: string) => s.toLocaleLowerCase('pl')

async function assertNameFree(db: D1Database, name: string, exceptId?: string) {
  const { results } = await db
    .prepare('SELECT id, name FROM players')
    .all<{ id: string; name: string }>()
  if (results.some((p) => p.id !== exceptId && norm(p.name) === norm(name)))
    throw conflict(`Gracz „${name}” już istnieje`)
}

// GET /api/players
export const list: Handler = async ({ env }) => json(await listPlayers(env.DB))

// POST /api/players { name, isGuest? }
export const create: Handler = async ({ request, env }) => {
  const body = await readBody(request)
  const name = str(body.name, 'name', 1, NAME_MAX)
  const isGuest = body.isGuest === undefined ? false : bool(body.isGuest, 'isGuest')
  await assertNameFree(env.DB, name)

  const { results } = await env.DB.prepare('SELECT color FROM players').all<{ color: string }>()
  const color = pickColor(results.map((r) => r.color))
  const player = { id: newId(), name, color, isGuest, tournaments: 0, variants: [] }
  await env.DB.prepare('INSERT INTO players (id, name, color, is_guest) VALUES (?, ?, ?, ?)')
    .bind(player.id, player.name, player.color, player.isGuest ? 1 : 0)
    .run()
  return json(player, 201)
}

// PATCH /api/players/:id { name?, color?, isGuest? }
export const update: Handler = async ({ request, env, params }) => {
  const current = await getPlayer(env.DB, params.id!)
  if (!current) throw notFound('Nie ma takiego gracza')

  const body = await readBody(request)
  const next = { ...current }
  if (body.name !== undefined) {
    next.name = str(body.name, 'name', 1, NAME_MAX)
    await assertNameFree(env.DB, next.name, current.id)
  }
  if (body.color !== undefined) {
    next.color = str(body.color, 'color', 7, 7)
    if (!COLOR_RE.test(next.color)) throw badRequest('Pole color: #rrggbb')
  }
  if (body.isGuest !== undefined) next.isGuest = bool(body.isGuest, 'isGuest')

  await env.DB.prepare('UPDATE players SET name = ?, color = ?, is_guest = ? WHERE id = ?')
    .bind(next.name, next.color.toLowerCase(), next.isGuest ? 1 : 0, current.id)
    .run()
  return json({ ...next, color: next.color.toLowerCase() })
}

// DELETE /api/players/:id → tylko gracz bez żadnego turnieju (np. literówka przy dodawaniu).
// Kto już grał, zostaje — inaczej zniknęłyby jego mecze z historii i rankingu.
export const remove: Handler = async ({ env, params }) => {
  const current = await getPlayer(env.DB, params.id!)
  if (!current) throw notFound('Nie ma takiego gracza')
  // Warunek w SQL: w międzyczasie ktoś mógł dopisać gracza do nowego turnieju.
  const unused = 'NOT EXISTS (SELECT 1 FROM session_players WHERE player_id = ?)'
  const db = env.DB
  const [, res] = await db.batch([
    db
      .prepare(`DELETE FROM player_variants WHERE player_id = ? AND ${unused}`)
      .bind(current.id, current.id),
    db.prepare(`DELETE FROM players WHERE id = ? AND ${unused}`).bind(current.id, current.id),
  ])
  if (!res.meta.changes)
    throw conflict(`${current.name} ma już rozegrane turnieje — nie można usunąć`)
  return noContent()
}

// --- wersje gracza (np. koszulki) ---

const MAX_VARIANTS = 6

async function playerOr404(db: D1Database, id: string) {
  const p = await getPlayer(db, id)
  if (!p) throw notFound('Nie ma takiego gracza')
  return p
}

function variantFields(body: Record<string, unknown>, partial: boolean) {
  const out: { name?: string; color?: string } = {}
  if (!partial || body.name !== undefined) out.name = str(body.name, 'name', 1, NAME_MAX)
  if (!partial || body.color !== undefined) {
    const color = str(body.color, 'color', 7, 7)
    if (!COLOR_RE.test(color)) throw badRequest('Pole color: #rrggbb')
    out.color = color.toLowerCase()
  }
  return out
}

function assertVariantNameFree(p: PlayerDto, name: string, exceptId?: string) {
  if (p.variants.some((v) => v.id !== exceptId && norm(v.name) === norm(name)))
    throw conflict(`${p.name} ma już wersję „${name}”`)
}

// POST /api/players/:id/variants { name, color } → gracz z wersjami
export const createVariant: Handler = async ({ request, env, params }) => {
  const p = await playerOr404(env.DB, params.id!)
  const f = variantFields(await readBody(request), false)
  if (p.variants.length >= MAX_VARIANTS) throw conflict(`Maksymalnie ${MAX_VARIANTS} wersji`)
  assertVariantNameFree(p, f.name!)
  await env.DB.prepare(
    'INSERT INTO player_variants (id, player_id, name, color) VALUES (?, ?, ?, ?)',
  )
    .bind(newId(), p.id, f.name, f.color)
    .run()
  return json(await getPlayer(env.DB, p.id), 201)
}

// PATCH /api/players/:id/variants/:variantId { name?, color? }
export const updateVariant: Handler = async ({ request, env, params }) => {
  const p = await playerOr404(env.DB, params.id!)
  const v = p.variants.find((x) => x.id === params.variantId)
  if (!v) throw notFound('Nie ma takiej wersji')
  const f = variantFields(await readBody(request), true)
  if (f.name) assertVariantNameFree(p, f.name, v.id)
  await env.DB.prepare('UPDATE player_variants SET name = ?, color = ? WHERE id = ?')
    .bind(f.name ?? v.name, f.color ?? v.color, v.id)
    .run()
  return json(await getPlayer(env.DB, p.id))
}

// DELETE /api/players/:id/variants/:variantId → tylko wersja, która nie grała
export const removeVariant: Handler = async ({ env, params }) => {
  const p = await playerOr404(env.DB, params.id!)
  const v = p.variants.find((x) => x.id === params.variantId)
  if (!v) throw notFound('Nie ma takiej wersji')
  const res = await env.DB.prepare(
    `DELETE FROM player_variants WHERE id = ?
     AND NOT EXISTS (SELECT 1 FROM session_players WHERE variant_id = ?)`,
  )
    .bind(v.id, v.id)
    .run()
  if (!res.meta.changes)
    throw conflict(`Wersja „${v.name}” już grała — zostaje w statystykach (możesz zmienić nazwę)`)
  return json(await getPlayer(env.DB, p.id))
}
