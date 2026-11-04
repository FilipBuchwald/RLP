import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, editCode } from '../api'
import { useToast } from '../context'
import { keys } from '../queries'

/** „Wpisz kod grupy” — po poprawnym kodzie telefon może prowadzić turniej. */
export function EditCodeForm({ title }: { title: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const code = value.trim()
    if (!code || busy) return
    setBusy(true)
    editCode.set(code)
    try {
      const me = await api.me()
      if (!me.canWrite) {
        editCode.clear()
        toast(me.code === 'locked' ? 'Za dużo błędnych prób — spróbuj za kwadrans' : 'Zły kod')
      } else {
        setValue('')
      }
      qc.setQueryData(keys.me, me.canWrite ? me : { ...me, code: 'none' })
    } catch {
      editCode.clear()
      toast('Nie udało się sprawdzić kodu')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div className="muted small" style={{ marginBottom: 10 }}>
        Oglądać może każdy. Żeby zacząć turniej i wpisywać wyniki, wpisz kod Waszej grupy — telefon
        go zapamięta.
      </div>
      <form className="row" onSubmit={submit}>
        <input
          className="field"
          placeholder="Kod grupy"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn primary" type="submit" disabled={busy || !value.trim()}>
          {busy ? 'Sprawdzam…' : 'Zatwierdź'}
        </button>
      </form>
    </div>
  )
}

/** Mały link „zapomnij kod na tym telefonie” (tylko w trybie kodu). */
export function ForgetCodeButton() {
  const qc = useQueryClient()
  return (
    <button
      className="btn ghost small muted"
      onClick={() => {
        editCode.clear()
        void qc.invalidateQueries({ queryKey: keys.me })
      }}
    >
      Zapomnij kod na tym telefonie
    </button>
  )
}
