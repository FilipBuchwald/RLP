// Konteksty aplikacji: otwieranie profilu gracza i komunikaty o błędach.
import { createContext, useContext } from 'react'

export const PlayerSheetContext = createContext<(id: string) => void>(() => {})
/** Otwiera panel z profilem gracza. */
export const useOpenPlayer = () => useContext(PlayerSheetContext)

export const ToastContext = createContext<(message: string) => void>(() => {})
/** Pokazuje krótki komunikat (np. błąd zapisu). */
export const useToast = () => useContext(ToastContext)

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Coś poszło nie tak')
