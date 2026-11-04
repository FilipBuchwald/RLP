import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { PLAYER_COLORS } from '../../shared/colors'
import type { PlayerDto, UpdatePlayerBody, VariantDto } from '../../shared/dto'
import { api, isCodeError } from '../api'
import { Dot } from '../components/Dot'
import { EditCodeForm } from '../components/EditCodeForm'
import { CloseButton, Sheet } from '../components/Sheet'
import { errorMessage, useOpenPlayer, useToast } from '../context'
import { initial, plural } from '../format'
import { keys, useInvalidateAll, useMe, usePlayers } from '../queries'

const byName = (a: PlayerDto, b: PlayerDto) => a.name.localeCompare(b.name, 'pl')

/** Zapis z obsługą błędów: toast, a przy złym / brakującym kodzie odśwież stan kodu. */
function useSave() {
  const qc = useQueryClient()
  const toast = useToast()
  const invalidateAll = useInvalidateAll()
  const [busy, setBusy] = useState(false)
  async function save(action: () => Promise<unknown>, done: string): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    try {
      await action()
      await invalidateAll()
      toast(done)
      return true
    } catch (e) {
      toast(errorMessage(e))
      if (isCodeError(e)) await qc.invalidateQueries({ queryKey: keys.me })
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, save }
}

function AddPlayer() {
  const [name, setName] = useState('')
  const [guest, setGuest] = useState(false)
  const { busy, save } = useSave()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    if (await save(() => api.createPlayer({ name: n, isGuest: guest }), `Dodano: ${n}`)) {
      setName('')
      setGuest(false)
    }
  }

  return (
    <form className="row card" onSubmit={submit}>
      <input
        className="field"
        placeholder="Imię nowego gracza"
        maxLength={20}
        autoComplete="off"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="guestchk">
        <input type="checkbox" checked={guest} onChange={(e) => setGuest(e.target.checked)} />
        gość
      </label>
      <button className="btn" type="submit" disabled={busy || !name.trim()}>
        Dodaj
      </button>
    </form>
  )
}

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {PLAYER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={`swatch ${c === value.toLowerCase() ? 'on' : ''}`}
          style={{ background: c }}
          aria-label={`kolor ${c}`}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

/** Dodawanie / zmiana jednej wersji (zapis od razu, osobno od głównego formularza). */
function VariantForm({ p, v, onDone }: { p: PlayerDto; v?: VariantDto; onDone: () => void }) {
  const used = new Set(p.variants.map((x) => x.color))
  const [name, setName] = useState(v?.name ?? '')
  const [color, setColor] = useState(
    v?.color ?? PLAYER_COLORS.find((c) => !used.has(c) && c !== p.color) ?? PLAYER_COLORS[0],
  )
  const [deleteArmed, setDeleteArmed] = useState(false)
  const { busy, save } = useSave()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const ok = v
      ? await save(() => api.updateVariant(p.id, v.id, { name: n, color }), 'Zapisano wersję')
      : await save(() => api.createVariant(p.id, { name: n, color }), `Dodano wersję: ${n}`)
    if (ok) onDone()
  }

  async function remove() {
    if (!v) return
    if (!deleteArmed) return setDeleteArmed(true)
    if (await save(() => api.deleteVariant(p.id, v.id), `Usunięto wersję: ${v.name}`)) onDone()
  }

  return (
    <form className="vform" onSubmit={submit}>
      <div className="row">
        <input
          className="field"
          placeholder="Nazwa, np. Orange"
          maxLength={20}
          autoComplete="off"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Swatches value={color} onChange={setColor} />
      <div className="row">
        <button className="btn primary" type="submit" disabled={busy || !name.trim()}>
          {v ? 'Zapisz' : 'Dodaj wersję'}
        </button>
        <button className="btn" type="button" disabled={busy} onClick={onDone}>
          Anuluj
        </button>
        {v &&
          (v.tournaments === 0 ? (
            <button className="btn ghost danger" type="button" disabled={busy} onClick={remove}>
              {deleteArmed ? 'Na pewno?' : 'Usuń'}
            </button>
          ) : (
            <span className="muted small">
              grała w {v.tournaments}{' '}
              {plural(v.tournaments, 'turnieju', 'turniejach', 'turniejach')} — zostaje w
              statystykach
            </span>
          ))}
      </div>
    </form>
  )
}

function VariantsEditor({ p }: { p: PlayerDto }) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <>
      <h2>Wersje</h2>
      <div className="muted small" style={{ marginBottom: 8 }}>
        Przy turnieju wybierzecie, która wersja dziś gra, a w profilu zobaczycie, która gra lepiej.
        Ranking się nie zmienia.
      </div>
      <div className="card plist">
        {p.variants.map((v) =>
          editing === v.id ? (
            <VariantForm key={v.id} p={p} v={v} onDone={() => setEditing(null)} />
          ) : (
            <div className="prow" key={v.id}>
              <span className="pmain">
                <i className="dot" style={{ background: v.color }} />
                <span className="pn">
                  <b>{v.name}</b>
                  <span className="muted small">
                    {v.tournaments
                      ? `${v.tournaments} ${plural(v.tournaments, 'turniej', 'turnieje', 'turniejów')}`
                      : 'jeszcze nie grała'}
                  </span>
                </span>
              </span>
              <button type="button" className="btn small" onClick={() => setEditing(v.id)}>
                Zmień
              </button>
            </div>
          ),
        )}
        {editing === 'new' ? (
          <VariantForm p={p} onDone={() => setEditing(null)} />
        ) : (
          <div className="prow">
            <button type="button" className="btn small" onClick={() => setEditing('new')}>
              + Dodaj wersję
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function EditPlayer({ player: p, onClose }: { player: PlayerDto; onClose: () => void }) {
  const [name, setName] = useState(p.name)
  const [color, setColor] = useState(p.color)
  const [isGuest, setIsGuest] = useState(p.isGuest)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const { busy, save } = useSave()

  const body: UpdatePlayerBody = {}
  if (name.trim() !== p.name) body.name = name.trim()
  if (color !== p.color) body.color = color
  if (isGuest !== p.isGuest) body.isGuest = isGuest
  const changed = Object.keys(body).length > 0

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!changed || !name.trim()) return
    if (await save(() => api.updatePlayer(p.id, body), 'Zapisano zmiany')) onClose()
  }

  async function remove() {
    if (!deleteArmed) return setDeleteArmed(true)
    if (await save(() => api.deletePlayer(p.id), `Usunięto: ${p.name}`)) onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <form onSubmit={submit}>
        <div className="top">
          <div className="avatar" style={{ background: color, margin: 0 }}>
            {initial(name.trim() || p.name)}
          </div>
          <div>
            <h3>Edytuj gracza</h3>
            <div className="muted small">
              {p.tournaments
                ? `${p.tournaments} ${plural(p.tournaments, 'turniej', 'turnieje', 'turniejów')}`
                : 'jeszcze nie grał(a)'}
            </div>
          </div>
          <CloseButton onClose={onClose} />
        </div>

        <h2>Imię</h2>
        <input
          className="field"
          style={{ width: '100%' }}
          maxLength={20}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <h2>Kolor</h2>
        <Swatches value={color} onChange={setColor} />

        <h2>Ranking</h2>
        <div className="opt">
          <div className="muted small">
            {isGuest
              ? 'Gość — wyniki w osobnej tabeli pod rankingiem.'
              : 'Stały gracz — wyniki liczą się do rankingu sezonu.'}
          </div>
          <span className="seg">
            <button
              type="button"
              className={!isGuest ? 'on' : ''}
              onClick={() => setIsGuest(false)}
            >
              Stały
            </button>
            <button type="button" className={isGuest ? 'on' : ''} onClick={() => setIsGuest(true)}>
              Gość
            </button>
          </span>
        </div>

        <div className="actions" style={{ marginTop: 16 }}>
          <button
            className="btn primary block"
            type="submit"
            disabled={busy || !changed || !name.trim()}
          >
            {busy ? 'Zapisuję…' : 'Zapisz'}
          </button>
        </div>
      </form>

      <VariantsEditor p={p} />

      <div style={{ marginTop: 14, textAlign: 'center' }}>
        {p.tournaments === 0 ? (
          <button className="btn ghost small danger" disabled={busy} onClick={remove}>
            {deleteArmed ? 'Na pewno? Kliknij ponownie, żeby usunąć' : 'Usuń gracza'}
          </button>
        ) : (
          <div className="muted small">
            Gracza z rozegranymi turniejami nie da się usunąć — jego mecze zostają w historii.
            Możesz go oznaczyć jako gościa.
          </div>
        )}
      </div>
    </Sheet>
  )
}

function PlayerRow({ p, onEdit }: { p: PlayerDto; onEdit?: () => void }) {
  const openPlayer = useOpenPlayer()
  return (
    <div className="prow">
      <button type="button" className="pmain" onClick={() => openPlayer(p.id)}>
        <Dot id={p.id} />
        <span className="pn">
          <b>{p.name}</b>
          <span className="muted small">
            {p.tournaments
              ? `${p.tournaments} ${plural(p.tournaments, 'turniej', 'turnieje', 'turniejów')}`
              : 'jeszcze nie grał(a)'}
          </span>
        </span>
      </button>
      {onEdit && (
        <button type="button" className="btn small" onClick={onEdit}>
          Edytuj
        </button>
      )}
    </div>
  )
}

export function Players() {
  const { data: players, isPending, isError } = usePlayers()
  const { data: me } = useMe()
  const canWrite = me?.canWrite ?? false
  const [editId, setEditId] = useState<string | null>(null)

  if (isPending) return <div className="loading">Wczytuję…</div>
  if (isError) return <div className="empty">Nie udało się wczytać graczy.</div>

  const regulars = players.filter((p) => !p.isGuest).sort(byName)
  const guests = players.filter((p) => p.isGuest).sort(byName)
  const editing = players.find((p) => p.id === editId)
  const row = (p: PlayerDto) => (
    <PlayerRow key={p.id} p={p} onEdit={canWrite ? () => setEditId(p.id) : undefined} />
  )

  return (
    <>
      <h2>Gracze</h2>
      {canWrite && <AddPlayer />}
      {regulars.length ? (
        <div className="card plist">{regulars.map(row)}</div>
      ) : (
        <div className="empty">Nie ma jeszcze graczy.</div>
      )}

      {guests.length > 0 && (
        <>
          <h2>Goście</h2>
          <div className="card plist">{guests.map(row)}</div>
        </>
      )}

      {!canWrite && me?.mode === 'code' && (
        <div style={{ marginTop: 18 }}>
          <EditCodeForm title="Chcesz edytować graczy?" />
        </div>
      )}

      {editing && <EditPlayer key={editing.id} player={editing} onClose={() => setEditId(null)} />}
    </>
  )
}
