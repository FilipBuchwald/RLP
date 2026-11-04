import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { sortRows, table } from '../../shared/stats'
import type { SessionDto } from '../../shared/dto'
import { EXPORT_URL, api, isCodeError } from '../api'
import { MatchCard } from '../components/MatchCard'
import { RoundsList } from '../components/RoundsList'
import { VariantPicker } from '../components/VariantPicker'
import { errorMessage, useToast } from '../context'
import { SEASON, fmtDate, plural } from '../format'
import {
  VariantScope,
  keys,
  useCanWrite,
  useHistory,
  useInvalidateAll,
  usePlayerLookup,
} from '../queries'

const fmtEdited = (iso: string) =>
  new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })

/** Poprawianie wyników zapisanego turnieju: zmiany lokalnie, zapis jednym przyciskiem. */
function ScoreEditor({ s, onClose }: { s: SessionDto; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const invalidateAll = useInvalidateAll()
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)

  const original = new Map(s.rounds.flatMap((r) => r.matches).map((m) => [m.id, m.scoreA ?? 0]))
  const changed = Object.entries(draft).filter(([id, v]) => original.get(id) !== v)

  function score(matchId: string, side: 'a' | 'b', delta: number) {
    const base = draft[matchId] ?? original.get(matchId)!
    const next = Math.max(0, Math.min(s.target, base + (side === 'a' ? delta : -delta)))
    setDraft((d) => ({ ...d, [matchId]: next }))
  }

  async function save() {
    setBusy(true)
    try {
      await api.editScores(
        s.id,
        changed.map(([matchId, scoreA]) => ({ matchId, scoreA })),
      )
      await invalidateAll()
      toast('Poprawki zapisane — ranking przeliczony')
      onClose()
    } catch (e) {
      toast(`Nie zapisano: ${errorMessage(e)}`)
      if (isCodeError(e)) await qc.invalidateQueries({ queryKey: keys.me })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="info">
        ✏️ Poprawiasz wyniki. Zmiany wejdą do rankingu dopiero po zapisaniu.
      </div>
      {s.rounds.map((r) => (
        <div key={r.number}>
          <div className="rlabel">Runda {r.number}</div>
          {r.matches.map((m) => {
            const a = draft[m.id] ?? original.get(m.id)!
            const was = original.get(m.id)!
            return (
              <MatchCard
                key={m.id}
                match={m}
                target={s.target}
                scoreA={a}
                onScore={(side, d) => score(m.id, side, d)}
                note={a !== was ? `było ${was}:${s.target - was}` : undefined}
              />
            )
          })}
        </div>
      ))}
      <VariantPicker
        session={s}
        title="Wersje graczy (zapis od razu)"
        onSaved={async () => {
          await invalidateAll()
        }}
      />
      <div className="actions">
        <button
          className="btn primary block"
          disabled={busy || changed.length === 0}
          onClick={save}
        >
          {busy
            ? 'Zapisuję…'
            : changed.length
              ? `Zapisz poprawki (${changed.length})`
              : 'Brak zmian'}
        </button>
        <button className="btn block" disabled={busy} onClick={onClose}>
          Anuluj
        </button>
      </div>
    </>
  )
}

function SessionItem({ s }: { s: SessionDto }) {
  const player = usePlayerLookup()
  const canWrite = useCanWrite()
  const [editing, setEditing] = useState(false)
  const rows = sortRows(table([s]))
  const top = rows[0]
  const matches = s.rounds.reduce((n, r) => n + r.matches.length, 0)

  return (
    <VariantScope.Provider value={s.variants}>
      <details className="ses">
        <summary>
          <div>
            <div className="sd">{fmtDate(s.date)}</div>
            <div className="winner">
              {top && (
                <>
                  Wygrał(a) <b>{player(top.id).name}</b> · {top.points} pkt ·{' '}
                </>
              )}
              {s.players.length} graczy · {matches} {plural(matches, 'mecz', 'mecze', 'meczów')}
            </div>
            {s.cap ? (
              <div className="tag">
                ✂️ przycięte do {s.cap} {plural(s.cap, 'meczu', 'meczów', 'meczów')} na osobę
              </div>
            ) : s.plannedRounds ? (
              <div className="tag ok">🎯 plan {s.plannedRounds} rund</div>
            ) : null}
            {s.editedAt && <div className="tag">✏️ poprawiony {fmtEdited(s.editedAt)}</div>}
          </div>
          <span className="chev">›</span>
        </summary>
        <div className="body prev">
          {editing ? (
            <ScoreEditor s={s} onClose={() => setEditing(false)} />
          ) : (
            <>
              <div className="rlabel">Wyniki turnieju</div>
              <div className="small" style={{ margin: '4px 0 8px', lineHeight: 1.7 }}>
                {rows.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && '  ·  '}
                    {i + 1}. {player(r.id).name} <b className="num">{r.points}</b>
                  </span>
                ))}
              </div>
              {s.cap != null && (
                <div className="small muted" style={{ marginBottom: 6 }}>
                  <s className="cut">Przekreślony</s> = mecz nieliczony dla tego gracza (przycięcie
                  do równej liczby).
                </div>
              )}
              <RoundsList session={s} rounds={s.rounds} />
              {canWrite && (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <button className="btn ghost small muted" onClick={() => setEditing(true)}>
                    ✏️ Popraw wynik
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </details>
    </VariantScope.Provider>
  )
}

export function History() {
  const { data, isPending, isError } = useHistory(SEASON)

  return (
    <>
      <h2>Historia turniejów</h2>
      {isPending ? (
        <div className="loading">Wczytuję…</div>
      ) : isError ? (
        <div className="empty">Nie udało się wczytać historii.</div>
      ) : data.length ? (
        data.map((s) => <SessionItem key={s.id} s={s} />)
      ) : (
        <div className="empty">Brak turniejów w sezonie {SEASON}.</div>
      )}
      <div style={{ marginTop: 18, textAlign: 'center' }}>
        <a className="btn ghost small muted" href={EXPORT_URL} download>
          ⬇ Pobierz kopię danych (JSON)
        </a>
      </div>
    </>
  )
}
