import type { StatsRow, SortBy } from '../../shared/stats'
import { useOpenPlayer } from '../context'
import { usePlayerLookup } from '../queries'
import { Dot } from './Dot'

type Props = {
  rows: StatsRow[]
  highlight?: SortBy
  /** Tabela turnieju: bez kolumny % wygranych i bez otwierania profilu. */
  compact?: boolean
}

const GRID_FULL = '30px 1fr 46px 46px 34px 44px'
const GRID_COMPACT = '30px 1fr 46px 46px 34px'

export function StatsTable({ rows, highlight = 'points', compact }: Props) {
  const player = usePlayerLookup()
  const openPlayer = useOpenPlayer()
  const grid = { gridTemplateColumns: compact ? GRID_COMPACT : GRID_FULL }

  return (
    <div className="tbl">
      <div className="tr th" style={grid}>
        <div>#</div>
        <div>Gracz</div>
        <div className="c">Pkt</div>
        <div className="c">Śr.</div>
        <div className="c">M</div>
        {!compact && <div className="c">Wyg.</div>}
      </div>
      {rows.map((r, i) => (
        <div
          key={r.id}
          className="tr"
          style={compact ? { ...grid, cursor: 'default' } : grid}
          onClick={compact ? undefined : () => openPlayer(r.id)}
        >
          <div className="pos">{i + 1}</div>
          <div className="who">
            <Dot id={r.id} />
            <span>
              {player(r.id).name}
              {player(r.id).variant && <span className="vtag"> · {player(r.id).variant}</span>}
            </span>
          </div>
          <div className={`c num ${highlight === 'points' ? 'hl' : ''}`}>{r.points}</div>
          <div className={`c num ${highlight === 'avg' ? 'hl' : ''}`}>{r.avg.toFixed(1)}</div>
          <div className="c num muted">{r.matches}</div>
          {!compact && <div className="c num muted">{Math.round(r.winRate * 100)}%</div>}
        </div>
      ))}
    </div>
  )
}
