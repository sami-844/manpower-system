# third_party — upstream sources, kept verbatim

These are the original files the project's agent workflow is built from. **They are reference copies, not active configuration.** Claude Code does not load anything from here; the active versions live in `.claude/skills/` and `.claude/agents/` and are adapted to this system. Never edit files in this folder. To take an upstream update, replace the folder from the same source and record the new commit below.

| Folder | What it is | Source | Commit (fetched 2026-11-09) | Licence |
|---|---|---|---|---|
| `jsm-agent-skill/` | **The five skills from the JavaScript Mastery AI engineering video**: `/architect`, `/remember`, `/review`, `/recover`, `/imprint`, and the engineering loop | [github.com/jsmastery-pro/jsm-agent-skill](https://github.com/jsmastery-pro/jsm-agent-skill) — install upstream with `npx skills@latest add JavaScript-Mastery-Pro/jsm-agent-skill` | `fd85d6ad52a1e73f75a593f1fffd1d18780350e2` | MIT (`LICENSE`) |
| `jsm-skills-v2/` | JavaScript Mastery's later, phase-based workflow (v2.0.0): `/scope`, `/architect`, `/develop`, `/test`, `/check`, `/audit`, `/debug`, `/document`, `/sync`, plus `docs/workflow-guide.md` and `docs/conventions.md` | [github.com/JavaScript-Mastery-Pro/skills](https://github.com/JavaScript-Mastery-Pro/skills) | `43b69e44c9ca905fe3a3418ccdf4102255e20d40` | MIT (`LICENSE`) |
| `andrej-karpathy-skills/` | The Karpathy guidelines: four principles (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) as a `CLAUDE.md`, a skill, a Claude plugin manifest, Cursor rules, and worked `EXAMPLES.md` | [github.com/forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills), derived from [Andrej Karpathy's post](https://x.com/karpathy/status/2015883857489522876) | `2c606141936f1eeef17fa3043a72095b4765b9c2` | MIT (stated in `README.md`, `plugin.json` and the skill's front matter; upstream ships no separate `LICENSE` file) |

## Changes made when copying (so nothing upstream loads by accident)

- Each upstream `CLAUDE.md` is renamed `CLAUDE.upstream.md`. Claude Code reads `CLAUDE.md` files in subfolders when it works there, and those files would contradict this project (for example, they say `npm run check`).
- `jsm-skills-v2/.claude/` is renamed `dot-claude/` so its `researcher` and `scout` agents are not discovered.
- `README.zh.md` (a Chinese translation of the Karpathy README) and upstream `.gitignore` files are left out. Nothing else is changed.

## How each source maps to the active project files

| Upstream | Active in this repository | How it was adapted |
|---|---|---|
| `jsm-agent-skill/skills/architect` | `.claude/skills/architect` | Reads `docs/PROGRESS.md`, the sprint, the spec (TR-IDs, screens, tables) and existing code; stops on an UNANSWERED decision or Version 2 scope; uses the `spec-scout` agent |
| `jsm-agent-skill/skills/remember` | `.claude/skills/remember` | Writes `docs/PROGRESS.md`, `DECISIONS.md` and `DEFERRED.md` instead of `memory.md`; strict personal-data boundary (PDPL) |
| `jsm-agent-skill/skills/review` | `.claude/skills/review` | Adds `bun run gates`, a fourth layer for pay, legal and personal-data safety, and the `independent-reviewer` agent |
| `jsm-agent-skill/skills/recover` | `.claude/skills/recover` | Lists this stack's known failures (Bun, postgres.js, NestJS decorators, RLS, money, dates) and adds escalation for specification defects |
| `jsm-agent-skill/skills/imprint` | `.claude/skills/imprint` | Measures against the Design Brief (shadcn tokens, status badges, OMR money, Arabic/RTL readiness) |
| `andrej-karpathy-skills/skills/karpathy-guidelines` | `.claude/skills/karpathy-guidelines` (verbatim) and the "How to work" section of `CLAUDE.md` | Principles mapped onto this project's rules |
| `jsm-skills-v2/*` | Not active | Reference only. `/debug`, `/audit` and `/document` overlap the active loop; enabling one means copying it into `.claude/skills/` under a name that doesn't clash, then adapting it the same way |
