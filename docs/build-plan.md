# Helix build plan

The path to the MVP: a Mac app where you create a goal for a real course, paste its syllabus, fix the concept map, take a diagnostic, and run tutoring sessions that update a persistent learner model, with every intelligent part measured.

Steps 1–3 are done. Each step is tagged:
- **[delegate]**: plumbing. Claude Code builds it; you review and verify.
- **[own]**: the intelligent parts. You make the design calls; Claude Code explains and assists.

## How to run a step

**[delegate] steps (fast)**
1. `cd ~/code/helix && claude`
2. Prompt: `Do Step N from docs/build-plan.md. It's a [delegate] step.`
3. When it finishes, run the **Check** commands yourself.
4. Skim the changes: `git diff --stat` lists the files touched; open anything that surprises you and ask why it's there.
5. Commit and push. Type `/clear` before the next step.

**[own] steps (deliberate)**
1. `cd ~/code/helix && claude`, then `Shift+Tab` until the status bar shows plan mode.
2. Prompt: `Plan Step N from docs/build-plan.md. It's an [own] step: explain the design choices and let me decide them before you change anything.`
3. Decide the open questions it raises. Approve the plan.
4. Read the new code with it, section by section.
5. Run the checks, answer its check question, commit, `/clear`.

---

## Phase 1: Skeleton

### Step 4 [delegate]: Local WebSocket server
- `packages/contracts`: `ClientMsg` (discriminated union on `type`: `ping` with `text`) and `ServerMsg` (`pong` with `text`, `receivedAt`; `error` with `message`), plus inferred types.
- `apps/server`: package `@helix/server`, `"type": "module"`, script `"dev": "node --watch src/main.ts"`, deps `ws` and `@helix/contracts` (`workspace:*`); root dev dep `@types/ws`.
- `src/main.ts`: `WebSocketServer` on `127.0.0.1:8765`; parse JSON (reply `error` on failure), `safeParse` against `ClientMsg` (reply `error` on failure), reply `pong` to `ping`; typed `send(socket, msg: ServerMsg)`.
- I started this by hand: check what exists and only fill the gaps.

**Check:** `pnpm typecheck`; run the server; send a ping and an invalid message with a one-line `node -e` WebSocket client. Ping gets pong, invalid gets `error`, nothing crashes.

### Step 5 [delegate]: UI shell
- `apps/web`: Vite React + TypeScript template (keep `README.md`), package `@helix/web`, Tailwind via its Vite plugin.
- Layout modeled on T3 Code: left sidebar (goals → sessions), center session timeline, bottom composer (`Cmd+Enter` sends), right map panel toggled with `Cmd+\`, command palette on `Cmd+K`.
- Fake data in `src/fixtures.ts`, typed with `@helix/contracts`. One component per file in `src/components/`.
- Brand assets in `apps/web/public/brand/` (`helix-mark.svg`, `helix-mark-on-dark.svg`, `helix-app-icon.svg`); use the mark in the sidebar header.

**Check:** `pnpm --filter @helix/web dev`; click and keyboard through goals, sessions, composer, palette, map panel.

### Step 6 [delegate]: Connect UI to server
- Connection module in `apps/web`: validates every incoming message with `ServerMsg.safeParse`, reconnects with increasing delays.
- Vite dev server proxies `/ws` to `127.0.0.1:8765`; the UI never hard-codes a server address.
- Zustand store for connection status, goals, sessions. Connection indicator in the sidebar; temporary "Ping" palette command.

**Check:** ping round-trip from the UI; stop the server and the indicator shows reconnecting; restart it and it recovers.

### Step 7 [own]: Data model
You design the schema; Claude Code writes the migration code.
- `node:sqlite` in `apps/server`; dev database at `./.helix-data/helix.sqlite` (gitignored). Numbered SQL migrations in `apps/server/migrations/`, a `schema_version` table.
- Tables to decide together:
  - `goal`: id, title, kind, capstone, exam_date, created_at
  - `concept`, `edge`: the current map (derived state)
  - `map_event` (append-only): id, goal_id, op (`add_concept`, `rename_concept`, `delete_concept`, `add_edge`, `delete_edge`, `extract`), payload, before, after, actor (`extractor` or `human`), prompt_version, model, ts
  - `evidence` (append-only): id, goal_id, concept_id, depth, item_id, correct, confidence, grader (`auto` or `llm`), error_tag, prompt_version, model, ts
  - `concept_state`: goal_id, concept_id, depth_held, p_mastery, updated_at (derived from `evidence`)
  - `item`, `session`: questions asked, sessions run
- A function that rebuilds `concept` and `edge` from `map_event`, and a test proving it.
- Contract messages `goal.create`, `goal.list`; the UI shows real goals.

**Decide:** what each log must record so you can later answer "which prompt version produced worse maps?" and "what do my corrections look like?"

**Check:** create a goal, restart the server, the goal is still there; delete `concept` rows and rebuild them from `map_event`.

---

## Phase 2: Maps you can measure

### Step 8 [own]: Syllabus to map
- API key in `apps/server/.env` (`ANTHROPIC_API_KEY`, gitignored), loaded with Node's `--env-file`.
- Extraction prompt as a versioned file in `apps/server/src/ai/prompts/extract-map.md`. You write and iterate on it.
- One Claude call with a forced tool whose input schema comes from Zod (`z.toJSONSchema`): concepts in the course's order and notation, prerequisite edges, where each concept appears in the source.
- Validate with Zod, then check the graph: edges reference real concepts, unique ids, no cycles. Save the result as `map_event` rows with `actor: "extractor"`.
- Contract messages: `map.extract`, `map.progress`, `map.updated`.

**Check:** a real syllabus produces a valid, acyclic map in the database.

### Step 9 [own]: Map evaluation harness
- `packages/evals` (`@helix/evals`). No gold maps: maps are checked by **rule checks** in code and a **judge prompt** (`judge-map.md`) that lists specific problems.
- Cases in `packages/evals/cases/<name>.json`: a goal, an optional source file and its kind, and fixed answers to the clarifying questions, so every run sees the same input. Each run gets its own empty database.
- Judge: sees the goal, source, answers, and the bare map (no `why` lines). Returns problems by type (wrong, reversed, or missing arrow; missing, off-topic, or duplicate concept; wrong grain, target depth, role, or arrow depth), each major or minor with the concept ids involved. This is also the hallucination check.
- Rule checks (warnings, sized to any goal from one problem to a textbook): concepts with no arrows, background nothing needs, one shared target depth on a map of 5+ concepts, near-duplicate names.
- Headline: major problems per 10 concepts. Script `maps` saves results to `packages/evals/results/` and prints a table comparing runs, grouped by judge version.
- Model per job (generation, teaching, evaluation) chosen in a settings tab, saved in the database; default Opus 5.5.

**Decided:** judge instead of gold maps; problem types and severities; per-10 headline; rule checks without a concept-count limit. Deferred (`docs/later.md`): testing the judge with planted errors, side-by-side judging of two prompt versions.

**Check:** `pnpm --filter @helix/evals maps` prints problems and scores for every case; changing the prompt version and rerunning shows the comparison.

### Step 10 [delegate]: Map editor
- Draw the map in the right panel with React Flow (`@xyflow/react`) and a dagre top-to-bottom layout.
- Rename, delete, add concepts; add and remove edges. Every edit is a contract message the server validates (including the cycle check) and records as a `map_event` with `actor: "human"`, before and after.
- Simple goal form: title, kind, capstone, optional exam date. Pasting source text on the goal page runs Step 8.
- Answer the clarifying questions (`map.questions`) in the UI before a map is built.
- Editing by typed instruction to an LLM editor, with code still enforcing the rules (see `docs/later.md`): decide here whether it replaces click editing or sits beside it.

**Check:** edit a real course's map; every edit appears in `map_event`; add the course as an eval case and rerun the eval.

**Milestone 1:** for one real course, a map you trust, with its extraction score known.

---

## Phase 3: The learner model and agents

### Step 11 [own]: Learner model
- `packages/core` (`@helix/core`) with Vitest.
- `updateMastery(p, correct, params)`: Bayesian knowledge tracing (guess, slip, learn).
- `deriveState(evidence[])`: rebuild each concept's depth held and mastery from evidence alone; a depth counts as held above a threshold.
- `frontier(map, states, targets)`: concepts below their target depth whose prerequisites are all held.
- Tests first, then the functions.

**Decide:** the parameters and threshold, how much weaker LLM-graded evidence counts than auto-graded, how confidence ratings enter (if at all).

**Decided:** memory design K1–K8 as recommended (mastery per concept per depth; misconceptions cleared after 2 right answers aimed at them in different later sessions; confidence flags reviews and misconceptions but stays out of the math; no forgetting yet; session summaries; a tutor briefing computed each turn; `predicted_p` on every answer). Held at 0.95. LLM grades count as certain. Right answers pass down the arrows as right answers on everything they imply, so several add up and log order is kept; wrong answers pass nothing. Default parameters: prior 0.2, learn 0.1, guess 0.15, slip 0.1 (`packages/core/src/mastery.ts`).

**Check:** `pnpm --filter @helix/core test` passes, and you can explain each test.

### Step 12 [own]: Diagnostic agents and their evals
- Prompts as versioned files: `item-writer.md` (one question for a concept at a depth, with rubric and expected answer) and `grader.md` (correct or not, error tag, short explanation).
- Selection: frontier concepts first, most uncertain mastery first.
- Flow: answer + confidence (1–5) before feedback → grader → `evidence` row → recompute state with `@helix/core` → `evidence.recorded` → the map recolors live.
- **Grader eval** in `packages/evals`: `gold/grader.json` holds labeled cases (question, rubric, answer, correct grade, error tag), written by you, including tricky ones (right answer with wrong reasoning, partial credit, notation differences). Script `grader` reports accuracy, false-positive and false-negative rates, and error-tag agreement per prompt version.

**Decide:** the depth rubrics (Orient through Expert), the error-tag vocabulary, the grader accuracy you require before trusting it.

**Built with defaults to revisit:** depth rubrics in `prompts/depth-levels.md`, shared by the item writer, grader, and tutor; error tags `misconception`, `wrong_method`, `slip`, `incomplete`, `misread`, `no_answer` (`packages/contracts/src/learner.ts`); grader bar ≥ 90% accuracy and ≤ 5% false passes (`packages/evals/src/grader-score.ts`). The diagnostic picks by uncertainty × coverage (most of the map settled per question), not frontier-first, because right answers pass down.

**Check:** grader eval meets your bar; after about 15 diagnostic questions, the colored map matches your own sense of what you know.

**Milestone 2.**

### Step 13 [own]: Tutoring sessions
- Planner in `@helix/core` (pure, tested): 2 review items from earlier concepts (interleaving confusable ones), then the next depth pass on the frontier concept that matters most for the goal.
- Tutor prompt `tutor.md`: prediction before explanation, one question at a time, at least two hints before a solution, ask why a step works, end each task with a retrieval question. Streams its replies.
- The grader from Step 12 turns answers into evidence; the tutor never grades.
- Record each session and the teaching method used per task.
- **Tutor eval**: replay a set of scripted learner turns and check each transcript against the tutor's rules (rule checks in code where possible, an LLM judge with a rubric otherwise).

**Decide:** the teaching rules, how the method is chosen, what the tutor eval checks.

**Built with defaults to revisit:** the teaching rules are in `prompts/tutor.md`; the tutor picks a method per task from `worked_example`, `socratic`, `analogy`, `contrast`, `practice`, recorded on the task; code refuses to end a task without a graded retrieval answer. Tutor eval: scripted cases in `packages/evals/tutor/`, two rules checked in code and all six by `prompts/judge-tutor.md`; `pnpm --filter @helix/evals tutor`.

**Milestone 3:** a complete session on a real course that leaves the learner model updated.

---

## Phase 4: A real app

### Step 14 [delegate]: Mac app
- `apps/desktop` with Electron: start the server, wait until it's listening, open a window on it. The server serves the built UI.
- Bundle the server to JavaScript for packaging. Database in `~/Library/Application Support/Helix`. API key entered in Settings, stored with Electron's `safeStorage`.
- App icon from `helix-app-icon.svg` (convert to `.icns`). Package to `.dmg`; first launch with right-click → Open.

**Check:** Helix runs from Applications with no terminal open.

### Step 15 [own]: Use it for real
- Two weeks on one real course. Export `evidence` and `map_event` to CSV.
- Delayed test on topics studied with Helix versus matched topics studied your usual way.
- Review the correction log: what kinds of map errors repeat? That's the case for, or against, training a model.

---

## After the MVP

1. **Train a map model** from the correction log and gold maps: fine-tune a small model, or train an edge predictor. Compare against prompting with the Step 9 harness.
2. Intake interview agent, replacing the goal form
3. Job and project goals
4. Teaching-method selection learned from the method log
5. Exploration view; hosting as a website; timed review
