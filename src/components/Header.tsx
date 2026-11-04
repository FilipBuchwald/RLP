export function Header({ season }: { season: number }) {
  return (
    <header>
      <div className="logo">
        <div className="ball" />
        <div>
          <div className="brand">
            Padel <b>Liga</b>
          </div>
          <div className="season">Sezon {season} · granie ze znajomymi</div>
        </div>
      </div>
    </header>
  )
}
