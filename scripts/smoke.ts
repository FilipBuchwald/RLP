// Rozgrywa całe wieczory samymi wywołaniami API (oba tryby, przycięcie, wyścigi, błędy).
// Użycie: npm run dev, potem npm run smoke. Zmienia LOKALNĄ bazę — na koniec przywróć: npm run seed
import assert from 'node:assert/strict'
import type {
  ExportDto,
  PlayerDto,
  RankingDto,
  SessionDto,
  PlayerStatsDto,
  UnequalDto,
} from '../shared/dto'
import { table } from '../shared/stats'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE))
  throw new Error('Smoke test tylko lokalnie')

async function api<T = unknown>(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T }
}

let step = 0
const ok = (msg: string) => console.log(`  ✓ ${String(++step).padStart(2)} ${msg}`)

async function scoreRound(s: SessionDto): Promise<SessionDto> {
  let cur = s
  for (const m of s.rounds.at(-1)!.matches) {
    const scoreA = Math.floor(Math.random() * (s.target + 1))
    const r = await api<SessionDto>('PUT', `/matches/${m.id}`, { scoreA })
    assert.equal(r.status, 200)
    const saved = r.data.rounds.at(-1)!.matches.find((x) => x.id === m.id)!
    assert.equal(saved.scoreA! + saved.scoreB!, s.target)
    cur = r.data
  }
  return cur
}

async function main() {
  console.log(`Smoke test API: ${BASE}`)

  // --- przygotowanie ---
  const live0 = await api<SessionDto | null>('GET', '/sessions/live')
  if (live0.data) await api('DELETE', `/sessions/${live0.data.id}`)
  const players = (await api<PlayerDto[]>('GET', '/players')).data
  assert.ok(players.length >= 8, 'Potrzeba ≥ 8 graczy — uruchom najpierw npm run seed')
  const ids = players.map((p) => p.id)
  ok(`${players.length} graczy w bazie`)

  // --- gracze ---
  const dup = await api('POST', '/players', { name: players[0].name.toLocaleUpperCase('pl') })
  assert.equal(dup.status, 409)
  const bad = await api('POST', '/players', { name: '   ' })
  assert.equal(bad.status, 400)
  ok('gracze: duplikat imienia (bez względu na wielkość liter) → 409, puste imię → 400')

  // --- walidacja tworzenia ---
  assert.equal(
    (
      await api('POST', '/sessions', {
        playerIds: ids.slice(0, 3),
        targetPoints: 24,
        courts: 1,
        mode: 'open',
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await api('POST', '/sessions', {
        playerIds: ids.slice(0, 6),
        targetPoints: 25,
        courts: 1,
        mode: 'open',
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await api('POST', '/sessions', {
        playerIds: ids.slice(0, 6),
        targetPoints: 24,
        courts: 1,
        mode: 'plan',
        plannedRounds: 4,
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await api('POST', '/sessions', {
        playerIds: [...ids.slice(0, 3), 'nie-ma'],
        targetPoints: 24,
        courts: 1,
        mode: 'open',
      })
    ).status,
    400,
  )
  ok('walidacja: < 4 graczy, zły target, plan spoza opcji, nieznany gracz → 400')

  // --- tryb „bez limitu” z przycięciem: 7 graczy, 1 kort ---
  const open = await api<SessionDto>('POST', '/sessions', {
    playerIds: ids.slice(0, 7),
    targetPoints: 24,
    courts: 2,
    mode: 'open',
  })
  assert.equal(open.status, 201)
  let s = open.data
  assert.equal(s.courts, 1, '2 korty przy 7 osobach → 1')
  assert.equal(s.rounds.length, 1)
  assert.equal(s.rounds[0].sitting.length, 3)
  ok('bez limitu: wieczór utworzony, 1. runda wylosowana, korty zredukowane do 1')

  assert.equal(
    (
      await api('POST', '/sessions', {
        playerIds: ids.slice(0, 4),
        targetPoints: 24,
        courts: 1,
        mode: 'open',
      })
    ).status,
    409,
  )
  ok('drugi wieczór na żywo → 409')

  assert.equal((await api('POST', `/sessions/${s.id}/rounds`)).status, 409)
  ok('następna runda bez kompletu wyników → 409')

  for (let r = 0; r < 4; r++) {
    s = await scoreRound(s)
    if (r < 3) s = (await api<SessionDto>('POST', `/sessions/${s.id}/rounds`)).data
  }
  // cofnięcie rundy: dwa telefony naraz → cofa się dokładnie jedna; stary numer → 409
  s = (await api<SessionDto>('POST', `/sessions/${s.id}/rounds`)).data
  assert.equal(s.rounds.length, 5)
  const undo = await Promise.all([
    api('DELETE', `/sessions/${s.id}/rounds/5`),
    api('DELETE', `/sessions/${s.id}/rounds/5`),
  ])
  assert.ok(undo.some((r) => r.status === 200))
  assert.ok(undo.every((r) => r.status === 200 || r.status === 409))
  s = (await api<SessionDto>('GET', '/sessions/live')).data!
  assert.equal(s.rounds.length, 4)
  assert.equal((await api('DELETE', `/sessions/${s.id}/rounds/5`)).status, 409)
  ok('cofnięcie rundy 5: dwa telefony naraz → cofnięta jedna runda, stary numer → 409')

  // 5. runda wylosowana ponownie i tylko częściowo wpisana — przy końcu ma zostać odrzucona
  s = (await api<SessionDto>('POST', `/sessions/${s.id}/rounds`)).data
  assert.equal(s.rounds.length, 5)
  assert.equal((await api<SessionDto>('GET', '/sessions/live')).data!.id, s.id)
  ok('4 rundy rozegrane, 5. wylosowana bez wyników; GET /sessions/live zwraca ten wieczór')

  const unequal = await api<UnequalDto>('POST', `/sessions/${s.id}/finish`)
  assert.equal(unequal.status, 409)
  assert.equal(unequal.data.code, 'unequal')
  assert.equal(unequal.data.completeRounds, 4)
  assert.equal(unequal.data.nextEqualRound, 7)
  assert.ok(unequal.data.min < unequal.data.max)
  ok(
    `koniec bez cap → 409 z licznikami (min ${unequal.data.min}, max ${unequal.data.max}, równo po rundzie 7)`,
  )

  assert.equal(
    (await api('POST', `/sessions/${s.id}/finish`, { cap: unequal.data.max })).status,
    400,
  )
  const fin = await api<SessionDto>('POST', `/sessions/${s.id}/finish`, { cap: unequal.data.min })
  assert.equal(fin.status, 200)
  assert.equal(fin.data.status, 'done')
  assert.equal(fin.data.cap, unequal.data.min)
  assert.equal(fin.data.rounds.length, 4, 'niedokończona runda odrzucona')
  for (const row of table([fin.data])) assert.equal(row.matches, unequal.data.min)
  ok(
    `przycięcie do ${unequal.data.min}: zapisane, każdy ma ${unequal.data.min} policzonych meczów, 5. runda usunięta`,
  )

  const m0 = fin.data.rounds[0].matches[0]
  assert.equal((await api('PUT', `/matches/${m0.id}`, { scoreA: 10 })).status, 409)
  assert.equal((await api('DELETE', `/sessions/${s.id}`)).status, 409)
  assert.equal((await api('DELETE', `/sessions/${s.id}/rounds/4`)).status, 409)
  ok('zakończony wieczór: wynik na żywo, odrzucenie i cofanie rundy → 409')

  // --- poprawka wyniku w zapisanym wieczorze ---
  const newA = (m0.scoreA! + 5) % (fin.data.target + 1)
  const fixPath = `/sessions/${s.id}/scores`
  assert.equal(
    (await api('PUT', fixPath, { scores: [{ matchId: 'nie-ma', scoreA: 1 }] })).status,
    400,
  )
  assert.equal(
    (await api('PUT', fixPath, { scores: [{ matchId: m0.id, scoreA: fin.data.target + 1 }] }))
      .status,
    400,
  )
  const fixed = await api<SessionDto>('PUT', fixPath, {
    scores: [{ matchId: m0.id, scoreA: newA }],
  })
  assert.equal(fixed.status, 200)
  const m0after = fixed.data.rounds[0].matches[0]
  assert.equal(m0after.scoreA, newA)
  assert.equal(m0after.scoreB, fixed.data.target - newA)
  assert.ok(fixed.data.editedAt, 'editedAt ustawione')
  assert.equal(fixed.data.cap, unequal.data.min)
  for (const row of table([fixed.data])) assert.equal(row.matches, unequal.data.min)
  ok(
    `poprawka w zapisanym wieczorze: ${m0.scoreA}:${m0.scoreB} → ${newA}:${m0after.scoreB}, przycięcie bez zmian; zły mecz / wynik → 400`,
  )

  // --- tryb „plan rund”: 6 graczy, 3 rundy; równoległe losowanie ---
  const plan = await api<SessionDto>('POST', '/sessions', {
    playerIds: ids.slice(0, 6),
    targetPoints: 16,
    courts: 1,
    mode: 'plan',
    plannedRounds: 3,
  })
  assert.equal(plan.status, 201)
  assert.equal((await api('DELETE', `/sessions/${plan.data.id}/rounds/1`)).status, 409)
  assert.equal(
    (
      await api('PUT', `/sessions/${plan.data.id}/scores`, {
        scores: [{ matchId: plan.data.rounds[0].matches[0].id, scoreA: 3 }],
      })
    ).status,
    409,
  )
  ok('plan: cofnięcie jedynej rundy → 409; poprawki trwającego wieczoru przez Historię → 409')
  s = await scoreRound(plan.data)
  assert.equal(
    (await api('PUT', `/matches/${s.rounds[0].matches[0].id}`, { scoreA: 17 })).status,
    400,
  )
  const race = await Promise.all([
    api('POST', `/sessions/${s.id}/rounds`),
    api('POST', `/sessions/${s.id}/rounds`),
  ])
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409])
  ok('plan: wynik > target → 400; dwa telefony losują naraz → jedna runda (200 + 409)')

  s = (await api<SessionDto>('GET', '/sessions/live')).data!
  assert.equal(s.rounds.length, 2)
  s = await scoreRound(s)
  s = (await api<SessionDto>('POST', `/sessions/${s.id}/rounds`)).data
  s = await scoreRound(s)
  assert.equal((await api('POST', `/sessions/${s.id}/rounds`)).status, 409)
  ok('plan: po 3/3 rundach losowanie kolejnej → 409')

  const planFin = await api<SessionDto>('POST', `/sessions/${s.id}/finish`)
  assert.equal(planFin.status, 200)
  assert.equal(planFin.data.cap, null)
  for (const row of table([planFin.data])) assert.equal(row.matches, 2)
  ok('plan: zakończony bez przycięcia, każdy po 2 mecze')

  // --- odrzucenie i pusty wieczór ---
  const d = await api<SessionDto>('POST', '/sessions', {
    playerIds: ids.slice(0, 4),
    targetPoints: 24,
    courts: 1,
    mode: 'open',
  })
  assert.equal((await api('DELETE', `/sessions/${d.data.id}`)).status, 204)
  assert.equal((await api('GET', '/sessions/live')).data, null)
  const e = await api<SessionDto>('POST', '/sessions', {
    playerIds: ids.slice(0, 4),
    targetPoints: 24,
    courts: 1,
    mode: 'open',
  })
  assert.equal((await api('POST', `/sessions/${e.data.id}/finish`)).status, 204)
  assert.equal((await api('GET', '/sessions/live')).data, null)
  ok('odrzucenie → 204; zakończenie bez rozegranej rundy → wieczór znika (204)')

  // --- ranking, historia, profil, gość → stały ---
  const season = Number(fin.data.date.slice(0, 4))
  const hist = (await api<SessionDto[]>('GET', `/sessions?season=${season}`)).data
  assert.ok(hist.some((x) => x.id === fin.data.id && x.cap === unequal.data.min))
  assert.ok(hist.every((x, i) => i === 0 || hist[i - 1].date >= x.date))
  ok(`historia ${season}: ${hist.length} wieczorów, od najnowszego, przycięty widoczny z cap`)

  const rk = (await api<RankingDto>('GET', `/ranking?season=${season}`)).data
  const avg = (await api<RankingDto>('GET', `/ranking?season=${season}&sort=avg`)).data
  assert.ok(rk.regulars.every((x, i) => i === 0 || rk.regulars[i - 1].points >= x.points))
  assert.ok(avg.regulars.every((x, i) => i === 0 || avg.regulars[i - 1].avg >= x.avg))
  ok(`ranking: ${rk.regulars.length} stałych + ${rk.guests.length} gości, sortowanie suma/średnia`)

  const guest = players.find((p) => p.isGuest)
  if (
    guest &&
    (await api<RankingDto>('GET', '/ranking?season=2026')).data.guests.some(
      (g) => g.id === guest.id,
    )
  ) {
    await api('PATCH', `/players/${guest.id}`, { isGuest: false })
    const after = (await api<RankingDto>('GET', '/ranking?season=2026')).data
    assert.ok(after.regulars.some((x) => x.id === guest.id))
    assert.ok(!after.guests.some((x) => x.id === guest.id))
    await api('PATCH', `/players/${guest.id}`, { isGuest: true })
    ok(`gość → stały: ${guest.name} przechodzi do głównej tabeli z dotychczasowymi wynikami`)
  }

  const prof = (await api<PlayerStatsDto>('GET', `/players/${ids[0]}/stats?season=${season}`)).data
  assert.ok(prof.profile && prof.profile.form.length <= 8 && prof.profile.position >= 1)
  assert.equal((await api('GET', '/players/nie-ma/stats')).status, 404)
  ok(
    `profil ${prof.player.name}: ${prof.profile.position}. miejsce, forma ${prof.profile.form.join('')}`,
  )

  // --- kopia zapasowa ---
  const res = await fetch(BASE + '/api/export')
  assert.equal(res.status, 200)
  assert.match(res.headers.get('Content-Disposition') ?? '', /attachment; filename="padel-liga-/)
  const dump = (await res.json()) as ExportDto
  assert.equal(dump.app, 'padel-liga')
  assert.equal(dump.players.length, (await api<PlayerDto[]>('GET', '/players')).data.length)
  assert.ok(dump.sessions.some((x) => x.id === fin.data.id && x.editedAt))
  ok(`kopia JSON: ${dump.players.length} graczy, ${dump.sessions.length} wieczorów`)

  console.log('\nWszystko działa. Przywróć dane demo: npm run seed')
}

main().catch((e) => {
  console.error('\n✗', e)
  process.exit(1)
})
