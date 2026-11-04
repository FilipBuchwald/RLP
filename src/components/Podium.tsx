import type { SortBy, StatsRow } from '../../shared/stats'
import { useOpenPlayer } from '../context'
import { usePlayerLookup } from '../queries'
import { Dot } from './Dot'

/** Podium 2 · 1 · 3. */
export function Podium({ rows, sort }: { rows: StatsRow[]; sort: SortBy }) {
  const player = usePlayerLookup()
  const openPlayer = useOpenPlayer()
  const places = [2, 1, 3]

  return (
    <div className="podium">
      {places.map((place) => {
        const r = rows[place - 1]
        if (!r) return <div key={place} />
        return (
          <div key={place} className={`pod p${place}`} onClick={() => openPlayer(r.id)}>
            <div className="place">{place}. MIEJSCE</div>
            <Dot id={r.id} big />
            <div className="nm">{player(r.id).name}</div>
            <div className="val">{sort === 'avg' ? r.avg.toFixed(1) : r.points}</div>
            <div className="lbl">{sort === 'avg' ? 'pkt / mecz' : 'punktów'}</div>
          </div>
        )
      })}
    </div>
  )
}
