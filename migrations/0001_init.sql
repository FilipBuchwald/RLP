-- Schemat początkowy (PLAN.md, sekcja 4).

CREATE TABLE players (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,
  is_guest    INTEGER NOT NULL DEFAULT 0 CHECK (is_guest IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,
  date           TEXT NOT NULL,            -- YYYY-MM-DD
  season         INTEGER NOT NULL,         -- np. 2026
  target_points  INTEGER NOT NULL CHECK (target_points IN (16, 21, 24, 32)),
  courts         INTEGER NOT NULL CHECK (courts IN (1, 2)),
  mode           TEXT NOT NULL CHECK (mode IN ('plan', 'open')),
  planned_rounds INTEGER,                  -- tylko dla 'plan'
  cap            INTEGER,                  -- przycięcie, NULL = brak
  status         TEXT NOT NULL CHECK (status IN ('live', 'done')),
  created_by     TEXT,                     -- e-mail z nagłówka Cloudflare Access
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((mode = 'plan') = (planned_rounds IS NOT NULL))
);

-- Maksymalnie jeden wieczór na żywo naraz.
CREATE UNIQUE INDEX sessions_one_live ON sessions (status) WHERE status = 'live';
CREATE INDEX sessions_season_date ON sessions (season, date);

CREATE TABLE session_players (
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  player_id  TEXT NOT NULL REFERENCES players (id),
  PRIMARY KEY (session_id, player_id)
);

CREATE TABLE rounds (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  sitting     TEXT NOT NULL DEFAULT '[]',  -- JSON: lista player_id
  UNIQUE (session_id, number)
);

CREATE TABLE matches (
  id        TEXT PRIMARY KEY,
  round_id  TEXT NOT NULL REFERENCES rounds (id) ON DELETE CASCADE,
  court     INTEGER NOT NULL,
  a1 TEXT NOT NULL REFERENCES players (id),
  a2 TEXT NOT NULL REFERENCES players (id),
  b1 TEXT NOT NULL REFERENCES players (id),
  b2 TEXT NOT NULL REFERENCES players (id),
  score_a   INTEGER,                       -- NULL = brak wyniku
  score_b   INTEGER,
  UNIQUE (round_id, court),
  CHECK ((score_a IS NULL) = (score_b IS NULL))
);
