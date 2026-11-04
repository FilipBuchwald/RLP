// Dane demo do lokalnego testowania (jak w prototypie): 8 stałych graczy + gość, 5 wieczorów.
// Użycie: npm run seed  (czyści LOKALNĄ bazę i wgrywa dane demo)
import { writeFileSync } from 'node:fs'
import { makeRound, seededRandom, stepFor } from '../shared/americano'
import { PLAYER_COLORS } from '../shared/colors'
import { equalityStatus } from '../shared/stats'
import type { Round } from '../shared/types'

const out = process.argv[2]
if (!out) throw new Error('Podaj ścieżkę pliku SQL')

const names = ['Filip', 'Kuba', 'Marta', 'Tomek', 'Ola', 'Bartek', 'Kasia', 'Michał', 'Adam']
const skill = [0.62, 0.55, 0.5, 0.58, 0.45, 0.52, 0.42, 0.6, 0.5]
const GUEST = 8
const pid = (i: number) => `demo-p${i}`

type Night = {
  date: string
  idx: number[]
  rounds: number
  courts: number
  plan: boolean
  trim?: boolean
}
const nights: Night[] = [
  { date: '2026-10-06', idx: [0, 1, 2, 3, 4, 5], rounds: 6, courts: 1, plan: true },
  // 7 osób na 1 korcie, 8 rund → nierówno, przycięte do minimum
  { date: '2026-10-13', idx: [0, 1, 2, 3, 5, 6, 7], rounds: 8, courts: 1, plan: false, trim: true },
  { date: '2026-10-20', idx: [0, 1, 2, 3, 4, 5, 6, 7], rounds: 7, courts: 2, plan: false },
  { date: '2026-10-27', idx: [0, 2, 3, 4, 7, GUEST], rounds: 6, courts: 1, plan: true },
  { date: '2026-11-03', idx: [0, 1, 3, 5, 6, 7], rounds: 6, courts: 1, plan: false },
]

const q = (v: string | number | null) =>
  v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`
const sql: string[] = [
  'DELETE FROM matches;',
  'DELETE FROM rounds;',
  'DELETE FROM session_players;',
  'DELETE FROM sessions;',
  'DELETE FROM players;',
]

names.forEach((name, i) =>
  sql.push(
    `INSERT INTO players (id, name, color, is_guest, created_at) VALUES (${q(pid(i))}, ${q(name)}, ${q(PLAYER_COLORS[i])}, ${i === GUEST ? 1 : 0}, ${q(`2026-10-01 18:00:0${i}`)});`,
  ),
)

const random = seededRandom(2026)
const TARGET = 24
nights.forEach((n, si) => {
  const sid = `demo-s${si}`
  const players = n.idx.map(pid)
  const rounds: Round[] = []
  for (let r = 0; r < n.rounds; r++) {
    const draw = makeRound(players, rounds, n.courts, random)
    rounds.push({
      ...draw,
      matches: draw.matches.map((m) => {
        const sk = (t: readonly string[]) =>
          t.reduce((s, p) => s + skill[Number(p.slice(6))], 0) / 2
        const share = 0.5 + (sk(m.a) - sk(m.b)) * 1.6 + (random() - 0.5) * 0.34
        const scoreA = Math.max(4, Math.min(TARGET - 4, Math.round(TARGET * share)))
        return { ...m, scoreA, scoreB: TARGET - scoreA }
      }),
    })
  }
  const st = equalityStatus({ players, rounds })
  if (!st.equal && !n.trim) throw new Error(`Wieczór ${n.date}: nierówno, a nie ma przycięcia`)
  if (n.plan && n.rounds % stepFor(players.length, n.courts) !== 0)
    throw new Error(`Zły plan ${n.date}`)
  const cap = st.equal ? null : st.min

  sql.push(
    `INSERT INTO sessions (id, date, season, target_points, courts, mode, planned_rounds, cap, status, created_by, created_at) VALUES (${q(sid)}, ${q(n.date)}, 2026, ${TARGET}, ${n.courts}, ${q(n.plan ? 'plan' : 'open')}, ${n.plan ? n.rounds : 'NULL'}, ${q(cap)}, 'done', 'demo', ${q(`${n.date} 19:00:00`)});`,
  )
  for (const p of players)
    sql.push(`INSERT INTO session_players (session_id, player_id) VALUES (${q(sid)}, ${q(p)});`)
  for (const r of rounds) {
    const rid = `${sid}-r${r.number}`
    sql.push(
      `INSERT INTO rounds (id, session_id, number, sitting) VALUES (${q(rid)}, ${q(sid)}, ${r.number}, ${q(JSON.stringify(r.sitting))});`,
    )
    for (const m of r.matches)
      sql.push(
        `INSERT INTO matches (id, round_id, court, a1, a2, b1, b2, score_a, score_b) VALUES (${q(`${rid}-c${m.court}`)}, ${q(rid)}, ${m.court}, ${q(m.a[0])}, ${q(m.a[1])}, ${q(m.b[0])}, ${q(m.b[1])}, ${m.scoreA}, ${m.scoreB});`,
      )
  }
})

writeFileSync(out, sql.join('\n') + '\n')
console.log(`Zapisano ${sql.length} poleceń SQL do ${out}`)
