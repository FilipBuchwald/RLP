import { EditCodeForm, ForgetCodeButton } from '../components/EditCodeForm'
import { useLive, useMe } from '../queries'
import { Live } from './game/Live'
import { Setup } from './game/Setup'

export function Game() {
  const { data: live, isPending, isError } = useLive()
  const { data: me } = useMe()
  const canWrite = me?.canWrite ?? false
  const codeMode = me?.mode === 'code'

  if (isPending) return <div className="loading">Wczytuję…</div>
  if (isError && !live)
    return <div className="empty">Brak połączenia z serwerem. Spróbuję ponownie za chwilę.</div>

  const forget = codeMode && canWrite && (
    <div style={{ marginTop: 18, textAlign: 'center' }}>
      <ForgetCodeButton />
    </div>
  )

  if (live)
    return (
      <>
        <Live
          key={live.id}
          session={live}
          readOnly={!canWrite}
          footer={
            !canWrite && codeMode ? <EditCodeForm title="Prowadzisz ten turniej?" /> : undefined
          }
        />
        {forget}
      </>
    )

  if (canWrite)
    return (
      <>
        <Setup />
        {forget}
      </>
    )

  return (
    <>
      <h2>Gra</h2>
      <div className="empty">Teraz nie trwa żaden turniej.</div>
      {codeMode ? (
        <EditCodeForm title="Zaczynacie grać?" />
      ) : (
        me && <div className="info">Zapisy są wyłączone — można tylko oglądać.</div>
      )}
    </>
  )
}
