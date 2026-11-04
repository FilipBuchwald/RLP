import type { UnequalDto } from '../../../shared/dto'
import { CloseButton, Sheet } from '../../components/Sheet'
import { plural } from '../../format'
import { usePlayerLookup } from '../../queries'

/** Okno „Nierówna liczba meczów”: przytnij do minimum albo grajcie dalej. */
export function FinishDialog({
  data,
  busy,
  onTrim,
  onClose,
}: {
  data: UnequalDto
  busy: boolean
  onTrim: () => void
  onClose: () => void
}) {
  const player = usePlayerLookup()
  const { counts, min, completeRounds, nextEqualRound } = data
  const more = nextEqualRound - completeRounds
  const rows = Object.entries(counts).sort((a, b) => a[1] - b[1])

  return (
    <Sheet onClose={onClose}>
      <div className="top">
        <div>
          <h3>Nierówna liczba meczów</h3>
          <div className="muted small">Rozegrane rundy: {completeRounds}</div>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <div className="card">
        {rows.map(([id, c]) => (
          <div className="kv" key={id}>
            <span>{player(id).name}</span>
            <b className="num" style={c > min ? { color: 'var(--red)' } : undefined}>
              {c} {plural(c, 'mecz', 'mecze', 'meczów')}
              {c > min && <span className="muted small"> (−{c - min})</span>}
            </b>
          </div>
        ))}
      </div>
      {min > 0 ? (
        <p className="hint" style={{ margin: '12px 2px 14px' }}>
          Przy przycięciu każdemu liczymy tylko jego{' '}
          <b style={{ color: 'var(--tx)' }}>
            pierwsze {min} {plural(min, 'mecz', 'mecze', 'meczów')}
          </b>
          . Nadmiarowe mecze zostają w historii, ale nie wchodzą do punktacji.
        </p>
      ) : (
        <p className="hint" style={{ margin: '12px 2px 14px' }}>
          Ktoś nie zagrał jeszcze ani jednego meczu — nie ma do czego przycinać. Zagrajcie dalej
          albo odrzućcie turniej.
        </p>
      )}
      <div className="actions">
        {min > 0 && (
          <button className="btn primary block" disabled={busy} onClick={onTrim}>
            ✂️ Przytnij do {min} {plural(min, 'meczu', 'meczów', 'meczów')} i zapisz
          </button>
        )}
        <button className="btn block" onClick={onClose}>
          Gramy dalej — równo po rundzie {nextEqualRound} (jeszcze {more})
        </button>
      </div>
    </Sheet>
  )
}
