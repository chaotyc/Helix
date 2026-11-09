-- Helix data model, version 1.
--
-- Two append-only logs are the source of truth:
--   map_event  every change to a concept map (extractor, LLM editor, or human)
--   evidence   every graded answer
-- `concept`, `edge`, and `concept_state` are derived from them and can always be rebuilt.
--
-- Conventions: ids are UUID text, except the logs, whose integer `seq` gives their order.
-- Times are ISO-8601 UTC text. JSON columns hold text checked with Zod when read.
-- STRICT makes SQLite enforce each column's type.

CREATE TABLE goal (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('course')),
  capstone    TEXT NOT NULL,          -- "what would prove you've got it?"
  exam_date   TEXT,                   -- "2026-12-14", or NULL
  created_at  TEXT NOT NULL
) STRICT;

-- Source material given to the extractor (D3), so prompt versions can be compared on the same input.
CREATE TABLE source (
  id          TEXT PRIMARY KEY,
  goal_id     TEXT NOT NULL REFERENCES goal (id),
  text        TEXT NOT NULL,
  sha256      TEXT NOT NULL,          -- fingerprint of `text`: same hash, same input
  created_at  TEXT NOT NULL
) STRICT;

-- The map diary. `payload` is what was asked; `before`/`after` are the affected
-- thing's full state, NULL when it didn't exist (D1).
CREATE TABLE map_event (
  seq             INTEGER PRIMARY KEY,
  goal_id         TEXT NOT NULL REFERENCES goal (id),
  op              TEXT NOT NULL CHECK (op IN ('extract', 'add_concept', 'update_concept',
                                              'delete_concept', 'add_edge', 'delete_edge')),
  payload         TEXT NOT NULL,      -- JSON
  before          TEXT,               -- JSON
  after           TEXT,               -- JSON
  actor           TEXT NOT NULL CHECK (actor IN ('extractor', 'editor', 'human')),
  request_id      TEXT,               -- groups the changes from one editor instruction
  instruction     TEXT,               -- the learner's words, for editor changes
  source_id       TEXT REFERENCES source (id),  -- what an extraction was given
  prompt_version  TEXT,               -- e.g. "extract-map@3f9a1c2e" (D4)
  model           TEXT,
  ts              TEXT NOT NULL
) STRICT;
CREATE INDEX map_event_by_goal ON map_event (goal_id, seq);

-- The current map, derived from map_event. `position` is course order.
CREATE TABLE concept (
  goal_id       TEXT NOT NULL REFERENCES goal (id),
  id            TEXT NOT NULL,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('concept', 'skill', 'decision')),
  source_ref    TEXT,
  position      INTEGER NOT NULL,
  target_depth  INTEGER NOT NULL CHECK (target_depth BETWEEN 1 AND 5),  -- set by the extractor (D5)
  PRIMARY KEY (goal_id, id)
) STRICT;

CREATE TABLE edge (
  goal_id  TEXT NOT NULL,
  src      TEXT NOT NULL,
  dst      TEXT NOT NULL,
  type     TEXT NOT NULL CHECK (type IN ('prereq', 'part_of')),
  PRIMARY KEY (goal_id, src, dst, type),
  FOREIGN KEY (goal_id, src) REFERENCES concept (goal_id, id),
  FOREIGN KEY (goal_id, dst) REFERENCES concept (goal_id, id)
) STRICT;

-- Questions asked. concept_id has no foreign key: a concept can be deleted from the
-- map while its questions and evidence stay in the record.
CREATE TABLE item (
  id               TEXT PRIMARY KEY,
  goal_id          TEXT NOT NULL REFERENCES goal (id),
  concept_id       TEXT NOT NULL,
  depth            INTEGER NOT NULL CHECK (depth BETWEEN 1 AND 5),
  prompt           TEXT NOT NULL,
  rubric           TEXT NOT NULL,
  expected_answer  TEXT NOT NULL,
  prompt_version   TEXT NOT NULL,
  model            TEXT NOT NULL,
  created_at       TEXT NOT NULL
) STRICT;

CREATE TABLE session (
  id          TEXT PRIMARY KEY,
  goal_id     TEXT NOT NULL REFERENCES goal (id),
  kind        TEXT NOT NULL CHECK (kind IN ('diagnostic', 'tutoring')),
  started_at  TEXT NOT NULL,
  ended_at    TEXT
) STRICT;

-- The answer diary (D6): the full answer is kept so it can be re-graded later;
-- `notes` is the grader's condensed note on misconceptions and errors.
CREATE TABLE evidence (
  seq             INTEGER PRIMARY KEY,
  goal_id         TEXT NOT NULL REFERENCES goal (id),
  concept_id      TEXT NOT NULL,
  depth           INTEGER NOT NULL CHECK (depth BETWEEN 1 AND 5),
  item_id         TEXT REFERENCES item (id),
  session_id      TEXT REFERENCES session (id),
  answer          TEXT NOT NULL,
  correct         INTEGER NOT NULL CHECK (correct IN (0, 1)),
  confidence      INTEGER CHECK (confidence BETWEEN 1 AND 5),
  grader          TEXT NOT NULL CHECK (grader IN ('auto', 'llm')),
  error_tag       TEXT,
  explanation     TEXT,               -- the grader's feedback to the learner
  notes           TEXT,               -- the grader's note: misconceptions, errors, what to retain
  prompt_version  TEXT,
  model           TEXT,
  ts              TEXT NOT NULL
) STRICT;
CREATE INDEX evidence_by_goal ON evidence (goal_id, seq);

-- Derived from evidence by @helix/core (Step 11).
CREATE TABLE concept_state (
  goal_id     TEXT NOT NULL REFERENCES goal (id),
  concept_id  TEXT NOT NULL,
  depth_held  INTEGER NOT NULL CHECK (depth_held BETWEEN 0 AND 5),
  p_mastery   REAL NOT NULL CHECK (p_mastery BETWEEN 0 AND 1),
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (goal_id, concept_id)
) STRICT;

-- Append-only means append-only: the database itself refuses edits and deletes on the logs.
CREATE TRIGGER map_event_no_update BEFORE UPDATE ON map_event
  BEGIN SELECT RAISE(ABORT, 'map_event is append-only'); END;
CREATE TRIGGER map_event_no_delete BEFORE DELETE ON map_event
  BEGIN SELECT RAISE(ABORT, 'map_event is append-only'); END;
CREATE TRIGGER evidence_no_update BEFORE UPDATE ON evidence
  BEGIN SELECT RAISE(ABORT, 'evidence is append-only'); END;
CREATE TRIGGER evidence_no_delete BEFORE DELETE ON evidence
  BEGIN SELECT RAISE(ABORT, 'evidence is append-only'); END;
