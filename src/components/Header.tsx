export function Header({ season }: { season: number }) {
  return (
    <header>
      <div className="logo">
        <div className="ball" />
        <div>
          <div className="brand">
            Rybnicka Liga <b>Padologiczna</b>
          </div>
          <div className="season">Sezon {season}</div>
        </div>
      </div>
    </header>
  )
}
