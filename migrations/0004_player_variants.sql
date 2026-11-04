-- Wersje gracza (np. koszulki „T-Mobile” / „Orange”): wybierane na cały turniej,
-- do statystyki „która wersja gra lepiej”. Ranking się nie zmienia — punkty idą na gracza.
CREATE TABLE player_variants (
  id         TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES players (id),
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX player_variants_player ON player_variants (player_id);

-- Która wersja grała w danym turnieju (NULL = bez wersji).
ALTER TABLE session_players ADD COLUMN variant_id TEXT REFERENCES player_variants (id);
