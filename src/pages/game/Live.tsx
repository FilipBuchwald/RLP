import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { nextEqualRound, stepFor } from '../../../shared/americano'
import type { MatchDto, SessionDto, UnequalDto } from '../../../shared/dto'
import { MatchCard } from '../../components/MatchCard'
import { VariantPicker } from '../../components/VariantPicker'
import { matchCounts, sortRows, table } from '../../../shared/stats'
import { ApiError, api, isCodeError, isUnequal } from '../../api'
import { errorMessage, useToast } from '../../context'
import { RoundsList } from '../../components/RoundsList'
import { StatsTable } from '../../components/StatsTable'
import { fmtDate, plural } from '../../format'
import { VariantScope, keys, useInvalidateAll, usePlayerLookup } from '../../queries'
import { FinishDialog } from './FinishDialog'
import { SETUP_KEY } from './Setup'

const omit = (o: Record<string, number>, k: string) => {
  const copy = { ...o }
  delete copy[k]
  return copy
}

/** Po ilu ms od ostatniego kliknięcia +/− wysyłamy wynik na serwer. */
const SAVE_DELAY_MS = 400

/**
 * Wyniki wpisywane lokalnie i wysyłane z opóźnieniem. Dopóki zapis trwa, ekran pokazuje
 * lokalną wartość, więc odpytywanie co 5 s nie „cofa” wyniku pod palcem.
 */
function usePendingScores(sessionId: string) {
  const qc = useQueryClient()
  const toast = useToast()
  const [pending, setPending] = useState<Record<string, number>>({})
  const pendingRef = useRef(pending)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const inflight = useRef(new Set<Promise<void>>())

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  const send = useCallback(
    (matchId: string, value: number) => {
      const p = (async () => {
        try {
          const session = await api.setScore(matchId, value)
          await qc.cancelQueries({ queryKey: keys.live })
          qc.setQueryData(keys.live, session)
          // Usuń lokalną wartość, chyba że w międzyczasie ktoś kliknął dalej.
          setPending((s) => (s[matchId] === value ? omit(s, matchId) : s))
        } catch (e) {
          toast(`Nie zapisano wyniku: ${errorMessage(e)}`)
          setPending((s) => omit(s, matchId))
          await qc.invalidateQueries({ queryKey: keys.live })
        }
      })()
      inflight.current.add(p)
      p.finally(() => inflight.current.delete(p))
    },
    [qc, toast],
  )

  const set = useCallback(
    (matchId: string, value: number) => {
      setPending((s) => ({ ...s, [matchId]: value }))
      clearTimeout(timers.current.get(matchId))
      timers.current.set(
        matchId,
        setTimeout(() => {
          timers.current.delete(matchId)
          send(matchId, value)
        }, SAVE_DELAY_MS),
      )
    },
    [send],
  )

  /** Wyślij od razu wszystko, co czeka, i poczekaj na zapis (przed „Następna runda”). */
  const flush = useCallback(async () => {
    for (const [matchId, t] of timers.current) {
      clearTimeout(t)
      send(matchId, pendingRef.current[matchId])
    }
    timers.current.clear()
    await Promise.all(inflight.current)
  }, [send])

  // Opuszczenie ekranu: niczego nie gubimy.
  useEffect(() => {
    const t = timers.current
    return () => {
      for (const [matchId, timer] of t) {
        clearTimeout(timer)
        void api.setScore(matchId, pendingRef.current[matchId]).catch(() => {})
      }
    }
  }, [sessionId])

  return { pending, set, flush }
}

export function Live({
  session: s,
  readOnly = false,
  footer,
}: {
  session: SessionDto
  /** Podgląd bez prawa zapisu (brak kodu grupy). */
  readOnly?: boolean
  footer?: ReactNode
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const invalidateAll = useInvalidateAll()
  const player = usePlayerLookup()
  const { pending, set, flush } = usePendingScores(s.id)
  const [busy, setBusy] = useState(false)
  const [unequal, setUnequal] = useState<UnequalDto | null>(null)
  const [cancelArmed, setCancelArmed] = useState(false)
  // Zakończenie bez żadnej rozegranej rundy usuwa turniej — wymaga drugiego kliknięcia.
  const [emptyFinishArmed, setEmptyFinishArmed] = useState(false)
  // Cofnięcie rundy usuwa jej losowanie i wyniki — też dwa kliknięcia.
  const [undoArmed, setUndoArmed] = useState(false)

  // Widok z lokalnymi (jeszcze niezapisanymi) wynikami.
  const view: SessionDto = {
    ...s,
    rounds: s.rounds.map((r) => ({
      ...r,
      matches: r.matches.map((m) => {
        const a = pending[m.id] ?? m.scoreA
        return { ...m, scoreA: a, scoreB: a == null ? null : s.target - a }
      }),
    })),
  }
  const cur = view.rounds.at(-1)!
  const allScored = cur.matches.every((m) => m.scoreA != null)
  const doneRounds = view.rounds.length - (allScored ? 0 : 1)
  const step = stepFor(s.players.length, s.courts)
  const counts = Object.values(matchCounts(s.players, view.rounds.slice(0, doneRounds)))
  const equalNow = doneRounds > 0 && Math.min(...counts) === Math.max(...counts)
  const plan = s.plannedRounds
  const isLast = plan != null && cur.number >= plan

  function score(m: MatchDto, side: 'a' | 'b', delta: number) {
    setCancelArmed(false)
    setEmptyFinishArmed(false)
    setUndoArmed(false)
    const base = pending[m.id] ?? m.scoreA ?? Math.floor(s.target / 2)
    const next = Math.max(0, Math.min(s.target, base + (side === 'a' ? delta : -delta)))
    set(m.id, next)
  }

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setCancelArmed(false)
    setUndoArmed(false)
    try {
      await action()
    } catch (e) {
      // Inny telefon mógł już wylosować rundę albo zakończyć turniej — pokaż stan z serwera.
      if (!(e instanceof ApiError && e.status === 409)) toast(errorMessage(e))
      if (isCodeError(e)) await qc.invalidateQueries({ queryKey: keys.me })
      await qc.invalidateQueries({ queryKey: keys.live })
    } finally {
      setBusy(false)
    }
  }

  const nextRound = () =>
    run(async () => {
      await flush()
      qc.setQueryData(keys.live, await api.nextRound(s.id))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })

  const canUndo = s.rounds.length >= 2
  const curHasScores = cur.matches.some((m) => m.scoreA != null)
  const undo = () => {
    if (!undoArmed) return setUndoArmed(true)
    void run(async () => {
      await flush()
      qc.setQueryData(keys.live, await api.undoRound(s.id, cur.number))
      toast(`Cofnięto rundę ${cur.number} — runda ${cur.number - 1} znów jest bieżąca`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const finish = (cap?: number) =>
    run(async () => {
      await flush()
      try {
        const done = await api.finish(s.id, cap)
        sessionStorage.removeItem(SETUP_KEY)
        setUnequal(null)
        qc.setQueryData(keys.live, null)
        await invalidateAll()
        if (done) window.location.hash = '#historia'
      } catch (e) {
        if (isUnequal(e)) setUnequal(e.data)
        else throw e
      }
    })

  const onFinishClick = () => {
    if (doneRounds === 0 && !emptyFinishArmed) return setEmptyFinishArmed(true)
    setEmptyFinishArmed(false)
    void finish()
  }

  const discard = () => {
    if (!cancelArmed) return setCancelArmed(true)
    void run(async () => {
      await api.discard(s.id)
      qc.setQueryData(keys.live, null)
      await invalidateAll()
    })
  }

  let info: ReactNode
  if (plan != null) {
    const per = (plan * 4 * s.courts) / s.players.length
    info = (
      <>
        🎯 Plan: <b>{plan} rund</b> · każdy zagra{' '}
        <b>
          {per} {plural(per, 'mecz', 'mecze', 'meczów')}
        </b>
        {isLast ? (
          <>
            {' '}
            · <b>ostatnia runda!</b>
          </>
        ) : (
          ` · zostało ${plan - cur.number + 1}`
        )}
      </>
    )
  } else {
    const nextEq = nextEqualRound(doneRounds, step)
    const left = nextEq - doneRounds
    info = equalNow ? (
      <>
        ✅ <b>Teraz wszyscy mają równo meczów</b> ({counts[0]}) — możecie kończyć. Kolejny raz równo
        po rundzie {nextEq}.
      </>
    ) : (
      <>
        ⚖️ Równo meczów będzie po <b>rundzie {nextEq}</b> · jeszcze {left}{' '}
        {plural(left, 'runda', 'rundy', 'rund')}
      </>
    )
  }

  const prev = view.rounds.slice(0, -1).reverse()

  return (
    <VariantScope.Provider value={s.variants}>
      <div className="livehead">
        <div>
          <div className="muted small">
            {fmtDate(s.date)} · do {s.target} pkt · {s.players.length} graczy ·{' '}
            {plan ? 'plan rund' : 'bez limitu'}
          </div>
          <div className="r">
            Runda <em>{cur.number}</em>
            {plan != null && <span className="of"> / {plan}</span>}
          </div>
        </div>
        <span className="pill">na żywo</span>
      </div>
      {plan != null && (
        <div className="prog">
          <i style={{ width: `${Math.round((doneRounds / plan) * 100)}%` }} />
        </div>
      )}
      <div className={`info ${equalNow && plan == null ? 'ok' : ''}`}>{info}</div>

      {cur.sitting.length > 0 && (
        <div className="sitting">
          ☕{' '}
          <span>
            Pauzuje: <b>{cur.sitting.map((p) => player(p).name).join(', ')}</b>
          </span>
        </div>
      )}

      {cur.matches.map((m) => (
        <MatchCard
          key={m.id}
          match={m}
          target={s.target}
          scoreA={m.scoreA}
          onScore={(side, d) => score(m, side, d)}
          readOnly={readOnly}
        />
      ))}

      {!readOnly && (
        <div className="actions">
          {isLast ? (
            <button
              className="btn primary block"
              disabled={!allScored || busy}
              onClick={() => finish()}
            >
              Zakończ turniej i zapisz ✓
            </button>
          ) : (
            <>
              <button
                className="btn primary block"
                disabled={!allScored || busy}
                onClick={nextRound}
              >
                {busy ? 'Chwila…' : 'Następna runda →'}
              </button>
              <button className="btn block" disabled={busy} onClick={onFinishClick}>
                {emptyFinishArmed
                  ? 'Nic nie rozegrano — kliknij ponownie, żeby odrzucić turniej'
                  : plan
                    ? 'Zakończ wcześniej'
                    : 'Zakończ turniej i zapisz'}
              </button>
            </>
          )}
          {canUndo && (
            <button className="btn ghost small muted" disabled={busy} onClick={undo}>
              {undoArmed
                ? `Na pewno? Losowanie${curHasScores ? ' i wyniki' : ''} rundy ${cur.number} znikną — kliknij ponownie`
                : `↩ Cofnij rundę ${cur.number} (wróć do rundy ${cur.number - 1})`}
            </button>
          )}
        </div>
      )}

      <h2>Tabela turnieju</h2>
      <StatsTable rows={sortRows(table([view]))} compact />

      {!readOnly && (
        <VariantPicker
          session={s}
          onSaved={(next) => {
            qc.setQueryData(keys.live, next)
          }}
        />
      )}

      {prev.length > 0 && (
        <>
          <h2>Poprzednie rundy</h2>
          <div className="card prev">
            <RoundsList session={view} rounds={prev} />
          </div>
        </>
      )}

      {footer && <div style={{ marginTop: 18 }}>{footer}</div>}

      {!readOnly && (
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button className="btn ghost small muted" disabled={busy} onClick={discard}>
            {cancelArmed
              ? 'Na pewno? Kliknij ponownie, żeby odrzucić turniej'
              : 'Odrzuć turniej bez zapisu'}
          </button>
        </div>
      )}

      {unequal && (
        <FinishDialog
          data={unequal}
          busy={busy}
          onTrim={() => finish(unequal.min)}
          onClose={() => setUnequal(null)}
        />
      )}
    </VariantScope.Provider>
  )
}
