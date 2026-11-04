import type { SessionData } from '../../shared/types'
import { cutKey, excluded } from '../../shared/stats'
import { usePlayerLookup } from '../queries'

/** Lista rund z wynikami. Przy przycięciu mecz nieliczony graczowi jest przekreślony przy jego imieniu. */
export function RoundsList({
  session,
  rounds,
}: {
  session: SessionData
  rounds: SessionData['rounds']
}) {
  const player = usePlayerLookup()
  const ex = excluded(session)

  return rounds.map((r) => {
    const name = (id: string, court: number) =>
      ex.has(cutKey(r.number, court, id)) ? (
        <s className="cut">{player(id).name}</s>
      ) : (
        player(id).name
      )
    return (
      <div key={r.number}>
        <div className="rlabel">
          Runda {r.number}
          {r.sitting.length > 0 && ` · pauza: ${r.sitting.map((p) => player(p).name).join(', ')}`}
        </div>
        {r.matches.map((m) => (
          <div className="pr" key={m.court}>
            <div className="t">
              {name(m.a[0], m.court)} / {name(m.a[1], m.court)}
            </div>
            <div className="s">
              {m.scoreA ?? '–'} : {m.scoreB ?? '–'}
            </div>
            <div className="t r">
              {name(m.b[0], m.court)} / {name(m.b[1], m.court)}
            </div>
          </div>
        ))}
      </div>
    )
  })
}
