import type { ExportDto } from '../../shared/dto'
import { listPlayers, loadSessions, todayWarsaw } from '../db'
import type { Handler } from '../router'

// GET /api/export → wszystkie dane (gracze + wszystkie wieczory) jako plik JSON.
// To te same dane, które i tak są do odczytu; pełna kopia SQL: `npm run backup` (README).
export const exportAll: Handler = async ({ env }) => {
  const [players, sessions] = await Promise.all([
    listPlayers(env.DB),
    loadSessions(env.DB, '1 = 1'),
  ])
  const data: ExportDto = {
    app: 'padel-liga',
    version: 1,
    exportedAt: new Date().toISOString(),
    players,
    sessions,
  }
  return new Response(JSON.stringify(data, null, 1), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="padel-liga-${todayWarsaw()}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
