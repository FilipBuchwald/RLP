import { useState } from 'react'
import { sortRows, type SortBy } from '../../shared/stats'
import { Podium } from '../components/Podium'
import { StatsTable } from '../components/StatsTable'
import { SEASON } from '../format'
import { useRanking } from '../queries'

export function Ranking() {
  const [sort, setSort] = useState<SortBy>('points')
  const { data, isPending, isError } = useRanking(SEASON)

  if (isPending) return <div className="loading">Wczytuję ranking…</div>
  if (isError) return <div className="empty">Nie udało się wczytać rankingu.</div>
  if (!data.regulars.length && !data.guests.length)
    return <div className="empty">Brak rozegranych turniejów w sezonie {SEASON}.</div>

  const regulars = sortRows(data.regulars, sort)
  const guests = sortRows(data.guests, sort)

  return (
    <>
      <div className="strip" style={{ marginTop: 12 }}>
        <div className="stat">
          <div className="v">{data.totals.nights}</div>
          <div className="k">turniejów</div>
        </div>
        <div className="stat">
          <div className="v">{data.totals.matches}</div>
          <div className="k">meczów</div>
        </div>
        <div className="stat">
          <div className="v">{data.totals.players}</div>
          <div className="k">graczy</div>
        </div>
      </div>

      <h2>
        <span>Klasyfikacja</span>
        <span className="seg">
          <button className={sort === 'points' ? 'on' : ''} onClick={() => setSort('points')}>
            Suma
          </button>
          <button className={sort === 'avg' ? 'on' : ''} onClick={() => setSort('avg')}>
            Średnia
          </button>
        </span>
      </h2>
      <Podium rows={regulars} sort={sort} />
      <div style={{ marginTop: 12 }}>
        <StatsTable rows={regulars} highlight={sort} />
      </div>

      {guests.length > 0 && (
        <>
          <h2>Goście</h2>
          <StatsTable rows={guests} highlight={sort} />
        </>
      )}

      <p className="note">
        Americano: każdy gracz dostaje tyle punktów, ile zdobyła jego para w meczu.
        <br />
        Kliknij gracza, żeby zobaczyć jego statystyki.
      </p>
    </>
  )
}
