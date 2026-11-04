import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import {
  TARGET_POINTS,
  effectiveCourts,
  minutesPerRound,
  planOptions,
  stepFor,
} from '../../../shared/americano'
import type { SessionMode } from '../../../shared/dto'
import { api } from '../../api'
import { errorMessage, useToast } from '../../context'
import { fmtDuration, plural } from '../../format'
import { keys, usePlayers } from '../../queries'
import { usePersistentState } from '../../usePersistentState'

type SetupState = {
  sel: string[]
  target: number
  courts: number
  mode: SessionMode | null
  rounds: number | null
}
const INITIAL: SetupState = { sel: [], target: 24, courts: 1, mode: null, rounds: null }
export const SETUP_KEY = 'padel-setup'

export function Setup() {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: players = [], isPending } = usePlayers()
  const [st, setSt] = usePersistentState<SetupState>(SETUP_KEY, INITIAL)
  const [newName, setNewName] = useState('')
  const [newGuest, setNewGuest] = useState(false)
  const [busy, setBusy] = useState(false)

  // Zaznaczeni, którzy nadal istnieją (lista graczy mogła się zmienić).
  const known = new Set(players.map((p) => p.id))
  const sel = st.sel.filter((id) => known.has(id) || isPending)
  const n = sel.length

  const maxCourts = Math.max(1, Math.min(2, Math.floor(n / 4)))
  const courts = effectiveCourts(Math.max(n, 4), Math.min(st.courts, maxCourts))
  const sit = n >= 4 ? n - courts * 4 : 0
  const step = n >= 4 ? stepFor(n, courts) : 1
  const opts = planOptions(n, courts, st.target)
  const rounds = st.rounds != null && opts.some((o) => o.rounds === st.rounds) ? st.rounds : null
  const ready = n >= 4 && st.mode != null && (st.mode === 'open' || rounds != null)

  const update = (patch: Partial<SetupState>) => setSt((s) => ({ ...s, ...patch }))
  const toggle = (id: string) =>
    update({ sel: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] })

  async function addPlayer(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const p = await api.createPlayer({ name, isGuest: newGuest })
      await qc.invalidateQueries({ queryKey: keys.players })
      setSt((s) => ({ ...s, sel: [...s.sel, p.id] }))
      setNewName('')
      setNewGuest(false)
    } catch (err) {
      toast(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    if (!ready || busy) return
    setBusy(true)
    try {
      // Kolejność jak na liście graczy (stabilna, niezależna od kolejności klikania).
      const playerIds = players.filter((p) => sel.includes(p.id)).map((p) => p.id)
      const session = await api.createSession({
        playerIds,
        targetPoints: st.target,
        courts,
        mode: st.mode!,
        plannedRounds: st.mode === 'plan' ? rounds! : undefined,
      })
      qc.setQueryData(keys.live, session)
      window.scrollTo({ top: 0 })
    } catch (err) {
      toast(errorMessage(err))
      await qc.invalidateQueries({ queryKey: keys.live })
    } finally {
      setBusy(false)
    }
  }

  const startLabel =
    n < 4
      ? 'Start — losuj 1. rundę'
      : !st.mode
        ? 'Wybierz, ile gracie'
        : st.mode === 'plan' && !rounds
          ? 'Wybierz liczbę rund'
          : 'Start — losuj 1. rundę'

  return (
    <>
      <h2>Nowy wieczór · Americano</h2>
      <div className="card">
        <div className="muted small" style={{ marginBottom: 10 }}>
          Kto dziś gra? <b style={{ color: 'var(--tx)' }}>{n}</b>{' '}
          {plural(n, 'osoba', 'osoby', 'osób')}
        </div>
        {isPending ? (
          <div className="muted small">Wczytuję graczy…</div>
        ) : (
          <div className="chips">
            {players.map((p) => {
              const on = sel.includes(p.id)
              return (
                <button
                  key={p.id}
                  className={`chip ${on ? 'on' : ''}`}
                  onClick={() => toggle(p.id)}
                >
                  <span className="ck">{on ? '✓' : ''}</span>
                  {p.name}
                  {p.isGuest && <span className="badge">gość</span>}
                </button>
              )
            })}
          </div>
        )}
        <form className="row" style={{ marginTop: 12 }} onSubmit={addPlayer}>
          <input
            className="field"
            placeholder="Dodaj nowego gracza"
            maxLength={20}
            autoComplete="off"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <label className="guestchk">
            <input
              type="checkbox"
              checked={newGuest}
              onChange={(e) => setNewGuest(e.target.checked)}
            />
            gość
          </label>
          <button className="btn" type="submit" disabled={busy || !newName.trim()}>
            Dodaj
          </button>
        </form>
      </div>

      <h2>Ustawienia</h2>
      <div className="card">
        <div className="opt">
          <div>
            <div style={{ fontWeight: 600 }}>Mecz do</div>
            <div className="muted small">łączna liczba punktów w meczu</div>
          </div>
          <span className="seg">
            {TARGET_POINTS.map((v) => (
              <button
                key={v}
                className={st.target === v ? 'on' : ''}
                onClick={() => update({ target: v })}
              >
                {v}
              </button>
            ))}
          </span>
        </div>
        <div className="opt">
          <div>
            <div style={{ fontWeight: 600 }}>Korty</div>
            <div className="muted small">
              {n >= 8 ? 'przy 8+ osobach można grać na 2' : '2 korty od 8 osób'}
            </div>
          </div>
          <span className="seg">
            {[1, 2].map((v) => (
              <button
                key={v}
                className={courts === v ? 'on' : ''}
                disabled={v > maxCourts}
                onClick={() => update({ courts: v })}
              >
                {v}
              </button>
            ))}
          </span>
        </div>
      </div>
      <p className="hint">
        {n < 4
          ? 'Potrzeba minimum 4 osób.'
          : `Każda runda: ${courts * 4} gra${
              sit
                ? `, ${sit} ${sit === 1 ? 'pauzuje' : 'pauzują'} (pauzy rozkładają się po równo)`
                : ''
            }. Pary zmieniają się tak, żeby każdy zagrał z każdym.`}
      </p>

      {n >= 4 && (
        <>
          <h2>Ile gramy?</h2>
          <div className="modes">
            <button
              className={`mode ${st.mode === 'plan' ? 'on' : ''}`}
              onClick={() => update({ mode: 'plan' })}
            >
              <div className="mt">🎯 Plan rund</div>
              <div className="md">Ustalamy z góry liczbę rund — każdy zagra tyle samo meczów.</div>
            </button>
            <button
              className={`mode ${st.mode === 'open' ? 'on' : ''}`}
              onClick={() => update({ mode: 'open' })}
            >
              <div className="mt">♾️ Bez limitu</div>
              <div className="md">
                Gramy, ile się da. Na końcu wyniki przycinamy do równej liczby meczów.
              </div>
            </button>
          </div>
          {st.mode === 'plan' && (
            <div className="card" style={{ marginTop: 10 }}>
              <div className="muted small" style={{ marginBottom: 10 }}>
                Przy {n} {plural(n, 'osobie', 'osobach', 'osobach')} i {courts}{' '}
                {plural(courts, 'korcie', 'kortach', 'kortach')} równo wychodzi co{' '}
                <b style={{ color: 'var(--tx)' }}>
                  {step} {plural(step, 'rundę', 'rundy', 'rund')}
                </b>
                . Wybierz:
              </div>
              <div className="ropts">
                {opts.map((o) => (
                  <button
                    key={o.rounds}
                    className={`ropt ${rounds === o.rounds ? 'on' : ''}`}
                    onClick={() => update({ rounds: o.rounds })}
                  >
                    <div className="rn">{o.rounds}</div>
                    <div className="rl">{plural(o.rounds, 'runda', 'rundy', 'rund')}</div>
                    <div className="rp">
                      po {o.perPlayer} {plural(o.perPlayer, 'mecz', 'mecze', 'meczów')}
                    </div>
                    <div className="rt">≈ {fmtDuration(o.rounds * minutesPerRound(st.target))}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <button className="btn primary block" disabled={!ready || busy} onClick={start}>
          {busy ? 'Losuję…' : startLabel}
        </button>
      </div>
    </>
  )
}
