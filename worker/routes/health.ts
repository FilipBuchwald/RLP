import { json } from '../http'
import type { Handler } from '../router'

// GET /api/health — sprawdza, czy Worker i D1 działają.
type DbInfo = { now: string; tables: number }

export const health: Handler = async ({ env, user }) => {
  const db = await env.DB.prepare(
    `SELECT datetime('now') AS now,
            (SELECT COUNT(*) FROM sqlite_master
              WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
                AND name <> 'd1_migrations') AS tables`,
  ).first<DbInfo>()

  return json({ ok: true, db, user })
}
