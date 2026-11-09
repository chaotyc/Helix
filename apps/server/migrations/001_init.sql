-- Helix data model, version 1.
--
-- Two append-only logs are the source of truth:
--   map_event  every change to the global concept graph (extractor, LLM editor, or human)
--   evidence   every graded answer
-- Everything else about maps and knowledge is derived from them and can always be rebuilt:
--   concept, edge, goal_concept   the current graph, from map_event
--   concept_state                 what the learner knows, from evidence (Step 11)
--
-- The graph is global: one set of concepts across every course (G1). A goal (course) is a
-- view onto it: which concepts it covers, at what target depth (goal_concept).
-- Knowledge is global too: concept_state has one row per concept, whatever course it came from (G3).
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

-- The map diary. `payload` is what was asked; `before`/`after` are the affected things'
-- full state, NULL when they didn't exist (D1).
CREATE TABLE map_event (
  seq             INTEGER PRIMARY KEY,
  goal_id         TEXT REFERENCES goal (id),   -- the course the change was made for, if any
  op              TEXT NOT NULL CHECK (op IN ('extract', 'add_concept', 'update_concept',
                                              'delete_concept', 'add_edge', 'delete_edge',
                                              'set_view_entry', 'remove_view_entry')),
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

-- ---- The current graph, derived from map_event ----

CREATE TABLE concept (
  id           TEXT PRIMARY KEY,      -- unique across all courses
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,         -- one sentence; how a concept is recognized across courses
  kind         TEXT NOT NULL CHECK (kind IN ('concept', 'skill', 'decision'))
) STRICT;

-- prereq: `dst` at `dst_depth` needs `src` at `src_depth` (E10). part_of: `src` is part of `dst`.
CREATE TABLE edge (
  id         INTEGER PRIMARY KEY,
  type       TEXT NOT NULL CHECK (type IN ('prereq', 'part_of')),
  src        TEXT NOT NULL REFERENCES concept (id),
  src_depth  INTEGER CHECK (src_depth BETWEEN 1 AND 5),
  dst        TEXT NOT NULL REFERENCES concept (id),
  dst_depth  INTEGER CHECK (dst_depth BETWEEN 1 AND 5),
  CHECK ((type = 'prereq'  AND src_depth IS NOT NULL AND dst_depth IS NOT NULL) OR
         (type = 'part_of' AND src_depth IS NULL     AND dst_depth IS NULL))
) STRICT;

-- Each goal's view of the graph. Target depth is per goal, set by the extractor (D5).
CREATE TABLE goal_concept (
  goal_id       TEXT NOT NULL REFERENCES goal (id),
  concept_id    TEXT NOT NULL REFERENCES concept (id),
  target_depth  INTEGER NOT NULL CHECK (target_depth BETWEEN 1 AND 5),
  role          TEXT NOT NULL CHECK (role IN ('taught', 'background')),  -- background: assumed, not taught (E3)
  PRIMARY KEY (goal_id, concept_id)
) STRICT;

-- ---- Questions, sessions, answers ----

-- Questions asked. concept_id has no foreign key: a concept can be deleted from the
-- graph while its questions and evidence stay in the record.
CREATE TABLE item (
  id               TEXT PRIMARY KEY,
  goal_id          TEXT REFERENCES goal (id),  -- the course it was written for, if any
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
-- goal_id and session_id record where an answer was given; what it says about the
-- learner counts everywhere (G3).
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
CREATE INDEX evidence_by_concept ON evidence (concept_id, seq);

-- What the learner knows, one row per concept across all courses (G3).
-- Derived from evidence by @helix/core (Step 11).
CREATE TABLE concept_state (
  concept_id  TEXT PRIMARY KEY,
  depth_held  INTEGER NOT NULL CHECK (depth_held BETWEEN 0 AND 5),
  p_mastery   REAL NOT NULL CHECK (p_mastery BETWEEN 0 AND 1),
  updated_at  TEXT NOT NULL
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
