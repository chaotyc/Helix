# Helix

Helix is a personal AI tutor that runs locally on a Mac. It turns a goal (a course, a job, a project) and its source material (a syllabus, a textbook, a posting) into a concept map, measures what the learner knows at each concept's depth, and runs tutoring sessions that update a persistent learner model.

## Working on the code

- Keep changes reviewable: one concern per file, clear names.
- Ask before changing contracts, the database schema, prompts, or the learner model.
- When something breaks, explain the error before fixing it.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node 26, running TypeScript directly (type stripping) |
| Package manager | pnpm workspaces |
| Contracts | Zod schemas in `packages/contracts`, shared by server and UI |
| Core logic | Pure TypeScript functions in `packages/core`, tested with Vitest |
| Evaluations | `packages/evals`: scripts that score extraction (rule checks + a judge prompt), the grader (simulated answers + a judge prompt), and the tutor (scripted learners + rule checks + a judge prompt) |
| Server | Node + `ws` (WebSocket) in `apps/server`, listening on `127.0.0.1` only |
| Storage | SQLite through the built-in `node:sqlite` |
| UI | React + Vite + Tailwind in `apps/web` |
| Mac app | Electron in `apps/desktop` |
| AI | Called only from the server, through `apps/server/src/ai/call-model.ts`: API keys (Anthropic SDK; OpenAI, xAI, Meta Responses API; Gemini API) or subscription CLIs run headless (Claude Code, Codex, Antigravity, Grok, Muse) |

## Layout

```
apps/server         WebSocket API, database, model calls (any provider), session runner
apps/server/src/ai/prompts/   versioned prompt files, one per agent
apps/web            React UI
apps/desktop        Electron shell
packages/contracts  Zod schemas for every message between UI and server
packages/core       learner model, frontier, planner: pure functions + tests
packages/evals      evaluation harnesses, eval cases, results
```

## Rules of the codebase

1. **Contracts first.** Every message between UI and server is a Zod schema in `packages/contracts`.
2. **Check data at the door.** Anything from outside (the UI, Claude, a file) goes through `safeParse` before use.
3. **Logs are the source of truth.** Two append-only logs: `evidence` (every graded answer) and `map_event` (every change to a concept map, from extraction or from a human edit). Current state is derived from them and can always be rebuilt.
4. **Human map edits are training data.** Every edit records what was there before and after. Never skip logging one.
5. **Prompts are versioned files.** Each agent's prompt lives in `apps/server/src/ai/prompts/`, and every evidence row and map event records which prompt version and model produced it.
6. **Code decides, agents talk.** Claude writes questions, lessons, maps, and grades. Deterministic code in `packages/core` decides what happens next.
7. **Agents ship with evals.** No agent prompt changes without rerunning its evaluation in `packages/evals`.
8. **Local only.** The server listens on `127.0.0.1`. Secrets live in `.env` (gitignored).
9. **TypeScript settings matter.** Only syntax Node can strip (no `enum`, no `namespace`). Import local files with their `.ts` extension. Import types with `type`.

## Commands

```bash
pnpm install                          # install all dependencies
pnpm typecheck                        # type-check the whole repo
pnpm --filter @helix/server dev       # run the server, restart on save
pnpm --filter @helix/web dev          # run the UI dev server
pnpm --filter @helix/core test        # run core tests
pnpm --filter @helix/desktop start    # build and run the Mac app without packaging
pnpm --filter @helix/desktop dist     # package the Mac app: apps/desktop/release/Helix-<version>-arm64.dmg
pnpm --filter @helix/evals maps       # build maps for every eval case, judge them, compare runs
pnpm --filter @helix/evals grader     # grade simulated answers to generated questions, have a judge check each grade
pnpm --filter @helix/evals tutor      # replay scripted learners, check the tutor's rules
```

## Commits

Conventional commits in plain language: `feat(server): ...`, `fix(web): ...`, `test(core): ...`, `eval(grader): ...`, `chore: ...`, `docs: ...`.
