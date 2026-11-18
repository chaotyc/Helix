<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/helix-mark-on-dark.svg">
    <img src="apps/web/public/brand/helix-mark.svg" alt="" width="64" height="64">
  </picture>
</p>

<h1 align="center">Helix</h1>

<p align="center">
  <b>Learn anything, to the depth you need.</b><br>
  A personal AI tutor that maps what there is to learn, finds what you already know,
  and teaches you the rest, one step at a time. A desktop app for Mac, Windows, and Linux
  that works with the AI plan or API key you already have.
</p>

<p align="center">
  <a href="https://github.com/chaotyc/Helix/releases/latest/download/Helix-arm64.dmg"><img alt="Download for Mac with Apple silicon (M1 or later)" src="https://img.shields.io/badge/Download-Mac%20M1%2B-5b5bd6?style=for-the-badge"></a>
  <a href="https://github.com/chaotyc/Helix/releases/latest/download/Helix-x64.dmg"><img alt="Download for Mac with Intel" src="https://img.shields.io/badge/Download-Mac%20Intel-5b5bd6?style=for-the-badge"></a>
  <a href="https://github.com/chaotyc/Helix/releases/latest/download/Helix-Setup-x64.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/Download-Windows-5b5bd6?style=for-the-badge"></a>
  <a href="https://github.com/chaotyc/Helix/releases/latest/download/Helix-amd64.deb"><img alt="Download for Linux (Debian or Ubuntu)" src="https://img.shields.io/badge/Download-Linux%20.deb-5b5bd6?style=for-the-badge"></a>
</p>

<p align="center">
  <img src=".github/assets/concept-map.png" alt="A Helix concept map for Bayes' theorem and medical tests: concepts linked by prerequisite arrows, each with a meter for how deep the learner knows it" width="900">
</p>

## How it works

### 1. Tell it what you want to learn

Describe your goal in a sentence: a course you're taking, an exam, a job, a project. Attach a
syllabus, notes, or a textbook chapter if you have them. Helix asks a few quick questions to pin
down the scope, then builds a **concept map**: every idea you need, how deep you need it, and
which ideas build on which.

<p align="center">
  <img src=".github/assets/new-goal.png" alt="Helix asking a clarifying question about a new goal, with suggested answers to pick from" width="800">
</p>

The map is yours to edit: add, rename, connect, or remove concepts, and undo your own edits.

### 2. Find out where you stand

A diagnostic asks one question at a time, grades each answer with an explanation, and fills in
the map as it goes. Say "I don't know" whenever you don't; that's useful too. Stop whenever
you like, or keep going until the map is settled.

<p align="center">
  <img src=".github/assets/diagnostic.png" alt="A diagnostic question about false positive and false negative rates, the learner's answer, and the grade: Right, with an explanation" width="640">
</p>

### 3. Learn the next thing

A tutoring session usually starts with a quick review of something you learned earlier, then
teaches the next concept you're ready for. Helix asks you to predict before it explains, gives
hints before answers, and checks your understanding at the end. Everything you answer updates
your map, so the next session picks up where this one left off.

## Five depths of knowing

Knowing what something is differs from being able to use it. Helix tracks each concept on a
five-step scale:

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/depths-dark.svg">
    <img src=".github/assets/depths-light.svg" alt="The five depths. 1 Orient: recognize it and say what it is for. 2 Explain: explain why it works, in your own words. 3 Apply: carry it out on a standard problem. 4 Analyze: handle unfamiliar problems and spot errors. 5 Expert: design with it, extend it, or teach it." width="880">
  </picture>
</p>

Each concept on your map gets a target depth for your goal. Helix measures where you stand and
teaches toward it. On the map, an arrow labeled `3 → 4` means you need the concept it starts from
at depth 3 before the one it points to at depth 4.

## Get started

1. **Download and install** Helix for your computer:
   [Mac, Apple silicon (M1 or later)](https://github.com/chaotyc/Helix/releases/latest/download/Helix-arm64.dmg) ·
   [Mac, Intel](https://github.com/chaotyc/Helix/releases/latest/download/Helix-x64.dmg) ·
   [Windows](https://github.com/chaotyc/Helix/releases/latest/download/Helix-Setup-x64.exe) ·
   [Linux AppImage](https://github.com/chaotyc/Helix/releases/latest/download/Helix-x86_64.AppImage) ·
   [Linux .deb (Debian, Ubuntu)](https://github.com/chaotyc/Helix/releases/latest/download/Helix-amd64.deb).
   On Linux, the AppImage needs FUSE 2 and `chmod +x`; on Debian or Ubuntu, the .deb is simpler.
2. **Connect a model.** Use a plan you already pay for, such as Claude, ChatGPT, or Google AI,
   through its command-line tool (Claude Code, Codex, Antigravity, and others), installed and
   signed in once. Or add an API key from Anthropic, OpenAI, Google, xAI, or Meta in **Settings**.
   On first launch, Helix finds what's set up on your computer and uses it for every job in one
   click.
3. **Create a goal** and start learning.

Helix checks for new versions when it opens and links you to the download.

---

<p align="center">
  <a href="https://github.com/chaotyc/Helix/issues">Report a problem</a> ·
  <a href="LICENSE">MIT License</a>
</p>
