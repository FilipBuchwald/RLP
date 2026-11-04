// GET /api/health — sprawdza, czy Functions i D1 działają.
type DbInfo = { now: string; tables: number }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const db = await env.DB.prepare(
    `SELECT datetime('now') AS now,
            (SELECT COUNT(*) FROM sqlite_master
              WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
                AND name <> 'd1_migrations') AS tables`,
  ).first<DbInfo>()
  const user =
    request.headers.get('Cf-Access-Authenticated-User-Email') ?? env.DEV_USER_EMAIL ?? null

  return Response.json({ ok: true, db, user })
}
