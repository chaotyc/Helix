-- The learner model and sessions (Steps 11–13), decisions K1–K8.

-- K1: knowledge per concept per depth. Derived from evidence and the map by @helix/core and
-- rebuildable. p_mastery counts right answers passed down the arrows (a right answer on B@2
-- also counts for A@1 when B@2 needs A@1); `answers` counts only answers to this pair itself.
-- Rewritten after every answer and every map change.
DROP TABLE concept_state;
CREATE TABLE concept_state (
  concept_id      TEXT NOT NULL,
  depth           INTEGER NOT NULL CHECK (depth BETWEEN 1 AND 5),
  p_mastery       REAL NOT NULL CHECK (p_mastery BETWEEN 0 AND 1),
  answers         INTEGER NOT NULL,
  last_answer_at  TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  PRIMARY KEY (concept_id, depth)
) STRICT;

-- K3: misconceptions, named by the grader in one plain sentence. Whether one is still active
-- is worked out from evidence (shown by an answer; cleared by right answers to questions
-- aimed at it, in 2 different later sessions).
CREATE TABLE misconception (
  id           TEXT PRIMARY KEY,
  concept_id   TEXT NOT NULL,
  description  TEXT NOT NULL,
  created_at   TEXT NOT NULL
) STRICT;

-- Step 13: a tutoring session's tasks, as the planner chose them, with the teaching method used.
CREATE TABLE task (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES session (id),
  position    INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('review', 'focus')),
  concept_id  TEXT NOT NULL,
  depth       INTEGER NOT NULL CHECK (depth BETWEEN 1 AND 5),
  aimed_at    TEXT REFERENCES misconception (id),
  reason      TEXT NOT NULL,          -- why the planner picked it
  method      TEXT,                   -- the teaching method the tutor chose
  started_at  TEXT,
  ended_at    TEXT,
  UNIQUE (session_id, position)
) STRICT;

-- A session's transcript in order: what the timeline shows and what the tutor rereads.
-- `item` is a TimelineItem as JSON. Append-only in practice: nothing edits it.
CREATE TABLE session_turn (
  seq         INTEGER PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES session (id),
  task_id     TEXT REFERENCES task (id),
  item        TEXT NOT NULL,
  created_at  TEXT NOT NULL
) STRICT;
CREATE INDEX session_turn_by_session ON session_turn (session_id, seq);

-- K6: a few lines written when the session ends, with what wrote them (rule 5).
ALTER TABLE session ADD COLUMN summary TEXT;
ALTER TABLE session ADD COLUMN summary_prompt_version TEXT;
ALTER TABLE session ADD COLUMN summary_model TEXT;

-- Questions: the misconception one is aimed at (K3), and the session and task it was asked in.
ALTER TABLE item ADD COLUMN aimed_at TEXT REFERENCES misconception (id);
ALTER TABLE item ADD COLUMN session_id TEXT REFERENCES session (id);
ALTER TABLE item ADD COLUMN task_id TEXT REFERENCES task (id);

-- Evidence:
--   predicted_p       the model's chance of a right answer, before grading (K8: calibration)
--   step, step_kind   which tutoring step the question tested (K2); NULL in a diagnostic
--   misconception_id  the misconception the grader saw in this answer (K3)
--   task_id           the tutoring task it was given in
ALTER TABLE evidence ADD COLUMN predicted_p REAL CHECK (predicted_p BETWEEN 0 AND 1);
ALTER TABLE evidence ADD COLUMN step TEXT;
ALTER TABLE evidence ADD COLUMN step_kind TEXT CHECK (step_kind IN ('reasoning', 'solution', 'choice'));
ALTER TABLE evidence ADD COLUMN misconception_id TEXT REFERENCES misconception (id);
ALTER TABLE evidence ADD COLUMN task_id TEXT REFERENCES task (id);
