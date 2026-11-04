import type { MatchDto } from '../../shared/dto'
import { usePlayerLookup } from '../queries'

/** Mecz z wynikiem i przyciskami +/− (na żywo i przy poprawianiu zapisanego turnieju). */
export function MatchCard({
  match,
  target,
  scoreA,
  onScore,
  readOnly,
  note,
}: {
  match: MatchDto
  target: number
  scoreA: number | null
  onScore: (side: 'a' | 'b', delta: number) => void
  readOnly?: boolean
  /** Podpis w prawym górnym rogu zamiast domyślnego. */
  note?: string
}) {
  const player = usePlayerLookup()
  const scoreB = scoreA == null ? null : target - scoreA

  const side = (s: 'a' | 'b') => {
    const team = s === 'a' ? match.a : match.b
    const sc = s === 'a' ? scoreA : scoreB
    const other = s === 'a' ? scoreB : scoreA
    return (
      <div className={`side ${sc != null && other != null && sc > other ? 'win' : ''}`}>
        <div className="names">
          <div>{player(team[0]).name}</div>
          <div>{player(team[1]).name}</div>
        </div>
        <div className="ctrl">
          {!readOnly && (
            <button onClick={() => onScore(s, -1)} aria-label="minus">
              −
            </button>
          )}
          <div className="sc">{sc ?? '–'}</div>
          {!readOnly && (
            <button onClick={() => onScore(s, 1)} aria-label="plus">
              +
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`match ${scoreA != null ? 'done' : ''}`}>
      <div className="court">
        <span>Kort {match.court}</span>
        <span>
          {note ??
            (scoreA != null ? `suma ${target}/${target}` : readOnly ? 'gra trwa' : 'wpisz wynik')}
        </span>
      </div>
      {side('a')}
      {side('b')}
    </div>
  )
}
