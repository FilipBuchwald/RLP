-- Kiedy ostatnio poprawiono wyniki zapisanego wieczoru (NULL = nigdy).
ALTER TABLE sessions ADD COLUMN edited_at TEXT;
