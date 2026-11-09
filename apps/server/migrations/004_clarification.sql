-- Clarifying questions, kept with the goal (C3). Before each extraction the clarifier asks
-- up to 3 questions; one round is one set of questions, plus the source they were asked about.
-- The extraction that follows uses that round's source and every answered question for the goal.

CREATE TABLE clarify_round (
  id          TEXT PRIMARY KEY,
  goal_id     TEXT NOT NULL REFERENCES goal (id),
  source_id   TEXT REFERENCES source (id),     -- NULL: no source material
  ai_call_id  INTEGER REFERENCES ai_call (id), -- the clarifier call whose questions were kept
  created_at  TEXT NOT NULL
) STRICT;

CREATE TABLE clarification (
  id           TEXT PRIMARY KEY,
  round_id     TEXT NOT NULL REFERENCES clarify_round (id),
  position     INTEGER NOT NULL,               -- 1, 2, 3: the order they were asked
  about        TEXT NOT NULL CHECK (about IN ('goal', 'scope', 'background', 'other')),
  question     TEXT NOT NULL,
  why          TEXT NOT NULL,                  -- how the answer would change the map
  answer_type  TEXT NOT NULL CHECK (answer_type IN ('free_text', 'choice')),
  choices      TEXT NOT NULL,                  -- JSON list; empty for free_text
  answer       TEXT,                           -- NULL until answered
  answered_at  TEXT,
  UNIQUE (round_id, position)
) STRICT;
