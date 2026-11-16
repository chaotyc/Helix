-- The user's settings, one row per key, the value as JSON checked with Zod when read.
-- First key: "models", which model does each job (generation, teaching, evaluation).

CREATE TABLE setting (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
) STRICT;
