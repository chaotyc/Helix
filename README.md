<p align="center">
  <img src="apps/web/public/brand/helix-mark-on-dark.svg" alt="" width="72" height="72">
</p>

# Helix

Helix is a personal AI tutor that runs on your own computer. Give it a goal (a course, an exam,
a project) and its source material (a syllabus, notes, a textbook chapter). It builds a
**concept map** of what there is to learn, finds out what you already know with a short
diagnostic, and runs tutoring sessions that keep a lasting record of what you've mastered.

> **Early release.** Helix works end to end, but it's young. Expect rough edges, and please
> report problems in [Issues](https://github.com/chaotyc/Helix/issues).

## What it does

- **Builds a concept map from your material.** Helix asks a few questions to pin down scope,
  then maps the concepts, how deep you need each one, and which ones depend on which. You can
  fix the map by hand: add, rename, remove, connect, drag, and undo.
- **Measures what you know.** A diagnostic asks one question at a time and colors the map as it
  learns where you stand, from just knowing what a concept is up to using it in new situations.
- **Tutors you on what's next.** Each session reviews earlier material, then teaches the next
  concept you're ready for: it asks you to predict before it explains, gives hints before
  solutions, and checks your understanding with a question at the end.
- **Remembers.** Every graded answer and every change to the map is kept in a log on your
  computer, and what Helix believes you know is worked out from that log.

## Install

Download the file for your computer from the
[latest release](https://github.com/chaotyc/Helix/releases/latest):

| Computer | File |
| --- | --- |
| Mac with Apple silicon (M1 or later) | `Helix-<version>-arm64.dmg` |
| Mac with Intel | `Helix-<version>-x64.dmg` |
| Windows (64-bit) | `Helix-Setup-<version>-x64.exe` |
| Linux (64-bit) | `Helix-<version>-x86_64.AppImage` or `Helix-<version>-amd64.deb` |

The builds aren't signed with a paid developer certificate yet, so your system warns you the
first time you open Helix:

- **macOS:** the first open is blocked. Open **System Settings → Privacy & Security**, scroll
  down, click **Open Anyway** next to the message about Helix, and confirm.
- **Windows:** SmartScreen says "Windows protected your PC". Click **More info → Run anyway**.
- **Linux:** make the AppImage executable (`chmod +x Helix-*.AppImage`), or install the deb with
  `sudo apt install ./Helix-*-amd64.deb`. Saving API keys needs a keyring (GNOME Keyring or
  KWallet, which most desktops already run).

More detail, including Ubuntu 24.04 notes, is in [apps/desktop/README.md](apps/desktop/README.md#first-launch-of-an-unsigned-build).
When a new version is out, Helix tells you on launch and links to the download.

## Connect a model

Helix doesn't come with a model. In **Settings**, connect at least one of:

- **A subscription you already have**, through its command-line tool, signed in once in a
  terminal: Claude Code (Claude Pro or Max), Codex (ChatGPT plans), or Antigravity (Google AI
  plans). Use counts against your plan's limits; there's no per-call bill.
- **An API key** from Anthropic, OpenAI, Google (Gemini), xAI, or Meta. You pay the provider per
  use. Settings shows each model's price per million tokens.

Then choose a model for each job (building maps, teaching, evaluating).

Connections marked **Beta** haven't yet been tested with real calls: all API keys, the Grok CLI,
Muse Code, and the in-app **Sign in** buttons (signing in from a terminal is the tested path).
They should work; please report it if one doesn't.

## Your data and privacy

- Your goals, maps, answers, and learner record are stored in a SQLite database on your computer
  (`~/Library/Application Support/Helix` on macOS, `%APPDATA%\Helix` on Windows,
  `~/.config/Helix` on Linux).
- **What leaves your computer:** the source material you add, your answers, and your tutoring
  chats are sent to the model provider you choose, to do the work, under that provider's terms.
  Helix also asks GitHub whether a newer version exists. Nothing else is sent anywhere; there
  are no accounts, analytics, or telemetry.
- API keys are encrypted with your system's keychain (macOS Keychain, Windows DPAPI, or the Linux
  keyring) and are handed only to the local Helix server. Subscription tools keep their own
  logins; Helix never sees them.
- The Helix server listens only on `127.0.0.1` and accepts connections only from local pages.

## Develop

Helix is a TypeScript monorepo: Node 26 (running TypeScript directly), pnpm workspaces, a
WebSocket server with `node:sqlite`, a React + Vite + Tailwind UI, and an Electron shell.

```bash
pnpm install                          # install all dependencies
pnpm --filter @helix/server dev       # the server (put API keys in apps/server/.env, see .env.example)
pnpm --filter @helix/web dev          # the UI, at http://localhost:5173
pnpm typecheck                        # type-check everything
pnpm --filter @helix/core test        # learner model and planner tests (also: @helix/server, @helix/evals)
pnpm --filter @helix/desktop start    # build and run the desktop app without packaging
```

| Folder | What's in it |
| --- | --- |
| `apps/server` | WebSocket API, database, model calls, versioned agent prompts (`src/ai/prompts/`) |
| `apps/web` | the React UI |
| `apps/desktop` | the Electron app, packaging, and release notes ([README](apps/desktop/README.md)) |
| `packages/contracts` | Zod schemas for every message between the UI and the server |
| `packages/core` | the learner model, frontier, planner, and map logic: pure functions with tests |
| `packages/evals` | evaluations for the map builder, the grader, and the tutor |

[CLAUDE.md](CLAUDE.md) lists the rules the codebase follows.

## License

[MIT](LICENSE)
