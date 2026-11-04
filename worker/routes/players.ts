import { pickColor } from '../../shared/colors'
import { getPlayer, listPlayers, newId } from '../db'
import { badRequest, bool, conflict, json, notFound, readBody, str } from '../http'
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
  const player = { id: newId(), name, color: pickColor(results.map((r) => r.color)), isGuest }
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
