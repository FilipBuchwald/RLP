-- Blokada zgadywania kodu do prowadzenia wieczoru: nieudane próby per adres IP.
CREATE TABLE code_attempts (
  ip            TEXT PRIMARY KEY,
  failures      INTEGER NOT NULL,
  window_start  INTEGER NOT NULL   -- ms od epoki; okno liczenia prób
);
