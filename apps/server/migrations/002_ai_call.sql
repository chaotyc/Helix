-- Every call to Claude, whatever came of it (E7). Only valid results reach map_event or
-- evidence, so this log is where broken outputs, refusals, cost, and speed are measured,
-- per agent and per prompt version.

CREATE TABLE ai_call (
  id               INTEGER PRIMARY KEY,
  agent            TEXT NOT NULL,          -- "extract-map", later "item-writer", "grader", "tutor"
  goal_id          TEXT REFERENCES goal (id),
  prompt_version   TEXT NOT NULL,          -- e.g. "extract-map@3f9a1c2e"
  model_requested  TEXT NOT NULL,
  model            TEXT,                   -- the model that answered (a refusal fallback can differ)
  effort           TEXT,
  attempt          INTEGER NOT NULL,       -- 1, or 2 for a retry with the problems listed (E6)
  status           TEXT NOT NULL CHECK (status IN ('ok', 'invalid', 'refused', 'truncated', 'error')),
  problems         TEXT,                   -- JSON list of what failed the checks, or the error message
  output           TEXT,                   -- the model's answer as returned
  input_tokens     INTEGER,
  output_tokens    INTEGER,                -- includes thinking
  cost_usd         REAL,
  duration_ms      INTEGER NOT NULL,
  started_at       TEXT NOT NULL
) STRICT;
CREATE INDEX ai_call_by_agent ON ai_call (agent, prompt_version);
