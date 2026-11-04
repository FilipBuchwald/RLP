import { useEffect, type ReactNode } from 'react'

/** Panel wysuwany od dołu. Zamyka się kliknięciem w tło albo klawiszem Esc. */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="modal open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button className="x" onClick={onClose} aria-label="Zamknij">
      ✕
    </button>
  )
}
