import { int, json, notFound, conflict, readBody } from '../http'
import { loadSession } from '../db'
import type { Handler } from '../router'

// PUT /api/matches/:id { scoreA } → serwer ustawia scoreB = target − scoreA
export const setScore: Handler = async ({ request, env, params }) => {
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.status, s.target_points FROM matches m
     JOIN rounds r ON r.id = m.round_id JOIN sessions s ON s.id = r.session_id
     WHERE m.id = ?`,
  )
    .bind(params.id!)
    .first<{ session_id: string; status: string; target_points: number }>()
  if (!row) throw notFound('Nie ma takiego meczu')
  if (row.status !== 'live') throw conflict('Turniej jest już zakończony — popraw wynik w Historii')

  const body = await readBody(request)
  const scoreA = int(body.scoreA, 'scoreA', 0, row.target_points)
  await env.DB.prepare('UPDATE matches SET score_a = ?, score_b = ? WHERE id = ?')
    .bind(scoreA, row.target_points - scoreA, params.id!)
    .run()
  return json(await loadSession(env.DB, row.session_id))
}
