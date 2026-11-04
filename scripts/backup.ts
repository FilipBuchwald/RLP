// Pełna kopia bazy produkcyjnej (schemat + dane) jako plik SQL w backups/.
// Użycie: npm run backup  (wymaga `wrangler login`). Przywracanie: README, sekcja „Kopia zapasowa”.
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'

const stamp = new Date()
  .toISOString()
  .slice(0, 16)
  .replace(/[-:T]/g, (c) => (c === 'T' ? '-' : ''))
const file = `backups/padel-liga-${stamp}.sql`
mkdirSync('backups', { recursive: true })
execFileSync('npx', ['wrangler', 'd1', 'export', 'padel-liga', '--remote', '--output', file], {
  stdio: 'inherit',
})
console.log(`\nZapisano ${file} (${Math.round(statSync(file).size / 1024)} KB)`)
