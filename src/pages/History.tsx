import { sortRows, table } from '../../shared/stats'
import type { SessionDto } from '../../shared/dto'
import { RoundsList } from '../components/RoundsList'
import { SEASON, fmtDate, plural } from '../format'
import { useHistory, usePlayerLookup } from '../queries'

function SessionItem({ s }: { s: SessionDto }) {
  const player = usePlayerLookup()
  const rows = sortRows(table([s]))
  const top = rows[0]
  const matches = s.rounds.reduce((n, r) => n + r.matches.length, 0)

  return (
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
        </div>
        <span className="chev">›</span>
      </summary>
      <div className="body prev">
        <div className="rlabel">Wyniki wieczoru</div>
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
            <s className="cut">Przekreślony</s> = mecz nieliczony dla tego gracza (przycięcie do
            równej liczby).
          </div>
        )}
        <RoundsList session={s} rounds={s.rounds} />
      </div>
    </details>
  )
}

export function History() {
  const { data, isPending, isError } = useHistory(SEASON)

  return (
    <>
      <h2>Historia wieczorów</h2>
      {isPending ? (
        <div className="loading">Wczytuję…</div>
      ) : isError ? (
        <div className="empty">Nie udało się wczytać historii.</div>
      ) : data.length ? (
        data.map((s) => <SessionItem key={s.id} s={s} />)
      ) : (
        <div className="empty">Brak wieczorów w sezonie {SEASON}.</div>
      )}
    </>
  )
}
