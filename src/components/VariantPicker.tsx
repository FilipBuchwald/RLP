import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { SessionDto, VariantDto } from '../../shared/dto'
import { api, isCodeError } from '../api'
import { errorMessage, useToast } from '../context'
import { keys, usePlayers } from '../queries'

/** Przełącznik „która wersja dziś gra”: wersje gracza + „bez wersji”. */
export function VariantSeg({
  variants,
  value,
  onChange,
  disabled,
}: {
  variants: VariantDto[]
  value: string | null
  onChange: (variantId: string | null) => void
  disabled?: boolean
}) {
  return (
    <span className="seg vseg">
      {variants.map((v) => (
        <button
          key={v.id}
          type="button"
          disabled={disabled}
          className={value === v.id ? 'on' : ''}
          onClick={() => onChange(v.id)}
        >
          <i className="vdot" style={{ background: v.color }} />
          {v.name}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        className={value == null ? 'on' : ''}
        onClick={() => onChange(null)}
      >
        bez
      </button>
    </span>
  )
}

/** Wersje graczy w trwającym / zapisanym turnieju — każda zmiana zapisuje się od razu. */
export function VariantPicker({
  session,
  onSaved,
  title = 'Wersje graczy',
}: {
  session: SessionDto
  onSaved: (s: SessionDto) => void | Promise<void>
  title?: string
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data: players = [] } = usePlayers()
  const [busy, setBusy] = useState(false)
  const withVariants = players.filter(
    (p) => p.variants.length > 0 && session.players.includes(p.id),
  )
  if (!withVariants.length) return null

  async function choose(playerId: string, variantId: string | null) {
    if (busy || (session.variants[playerId] ?? null) === variantId) return
    setBusy(true)
    try {
      await onSaved(await api.setVariant(session.id, playerId, variantId))
    } catch (e) {
      toast(`Nie zapisano wersji: ${errorMessage(e)}`)
      if (isCodeError(e)) await qc.invalidateQueries({ queryKey: keys.me })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2>{title}</h2>
      <div className="card">
        {withVariants.map((p) => (
          <div className="opt" key={p.id}>
            <b>{p.name}</b>
            <VariantSeg
              variants={p.variants}
              value={session.variants[p.id] ?? null}
              onChange={(v) => choose(p.id, v)}
              disabled={busy}
            />
          </div>
        ))}
      </div>
    </>
  )
}
