import { useState } from 'react'
import { api } from '../api'
import { errorMessage, useToast } from '../context'
import { SEASON } from '../format'
import { useCanWrite, useInvalidateAll, usePlayerLookup, usePlayerStats } from '../queries'
import { Dot } from './Dot'
import { CloseButton, Sheet } from './Sheet'

/** Profil gracza w panelu od dołu. */
export function PlayerSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const player = usePlayerLookup()
  const { data, isPending, isError } = usePlayerStats(id, SEASON)
  const p = data?.profile
  const toast = useToast()
  const invalidateAll = useInvalidateAll()
  const [busy, setBusy] = useState(false)
  const canWrite = useCanWrite()
  const isGuest = data?.player.isGuest ?? player(id).isGuest

  async function toggleGuest() {
    setBusy(true)
    try {
      await api.updatePlayer(id, { isGuest: !isGuest })
      await invalidateAll()
    } catch (e) {
      toast(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <div className="top">
        <Dot id={id} big />
        <div>
          <h3>{player(id).name}</h3>
          <div className="muted small">
            {p
              ? p.guest
                ? `gość · ${p.position}. wśród gości`
                : `${p.position}. miejsce w sezonie`
              : isPending
                ? '…'
                : `brak meczów w sezonie ${SEASON}`}
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </div>

      {isError && <div className="info err">Nie udało się wczytać statystyk.</div>}

      {p && (
        <>
          <div className="strip">
            <div className="stat">
              <div className="v" style={{ color: 'var(--ac)' }}>
                {p.row.points}
              </div>
              <div className="k">punktów</div>
            </div>
            <div className="stat">
              <div className="v">{p.row.avg.toFixed(1)}</div>
              <div className="k">pkt / mecz</div>
            </div>
            <div className="stat">
              <div className="v">{Math.round(p.row.winRate * 100)}%</div>
              <div className="k">wygranych</div>
            </div>
          </div>

          <h2>Forma (ostatnie mecze)</h2>
          <div className="form">
            {p.form.map((x, i) => (
              <span key={i} className={x}>
                {x}
              </span>
            ))}
          </div>

          <h2>Szczegóły</h2>
          <div className="card">
            <div className="kv">
              <span className="muted">Turnieje</span>
              <b>{p.row.nights}</b>
            </div>
            <div className="kv">
              <span className="muted">Mecze</span>
              <b>{p.row.matches}</b>
            </div>
            <div className="kv">
              <span className="muted">Bilans W–R–P</span>
              <b>
                {p.row.wins}–{p.row.draws}–{p.row.losses}
              </b>
            </div>
            {p.bestPartner && (
              <div className="kv">
                <span className="muted">Najlepszy partner</span>
                <b>
                  {player(p.bestPartner.id).name} · {p.bestPartner.avg.toFixed(1)} pkt/mecz
                </b>
              </div>
            )}
            {p.worstPartner && (
              <div className="kv">
                <span className="muted">Najsłabiej z</span>
                <b>
                  {player(p.worstPartner.id).name} · {p.worstPartner.avg.toFixed(1)} pkt/mecz
                </b>
              </div>
            )}
          </div>
        </>
      )}

      {data && canWrite && (
        <div style={{ marginTop: 14, textAlign: 'center' }}>
          <button className="btn ghost small muted" disabled={busy} onClick={toggleGuest}>
            {isGuest ? 'Zmień na stałego gracza (wyniki wejdą do rankingu)' : 'Oznacz jako gościa'}
          </button>
        </div>
      )}
    </Sheet>
  )
}
