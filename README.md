# Workforce — manpower management system

The system of record for a ~700-worker construction manpower company in Oman: every
worker's papers, every client site, every hour, every payslip. This repository is the
first working slice: worker files, document compliance, renewals, the office web app and
the Windows desktop shell with silent printing.

The full product requirements and technical spec are in the shared doc
"Manpower Management System — PRD & Technical Spec". Rules for AI agents and developers
are in [CLAUDE.md](CLAUDE.md).

## What works today

| Area | What you can do |
| --- | --- |
| Workers | Add workers, search by name or code, filter by paper status |
| Documents | Record passport, visa, labour card, medical and others; HR verifies each one |
| Compliance | Ask "can this worker be deployed at this site on these dates?" and get every reason in plain words |
| Renewals | HR/PRO's morning list: expired and expiring documents, most urgent first (90/60/30/7-day tiers) |
| Overrides | Exceptions need a named approver, a reason and an end date; inactive workers can never be overridden |
| Audit | Every change is recorded with who, when, before and after, in a hash-chained log the database refuses to edit |
| Desktop | Windows app wrapping the same screens; prints batches to a chosen printer with no dialog |

Not built yet (next slices of Version 1, in PRD order): sign-in with Amazon Cognito,
clients and rate cards, rostering, daily attendance sheets and timesheets, payroll and
WPS, billing, ledger, owner dashboard. Version 2 (after go-live) adds the supervisor app,
client portal and worker app; see "Release scope" in CLAUDE.md.

**Version 1 demo (2026-11-09).** Every Version 1 screen (S-01 to S-41) now exists in the
shadcn/ui shell, so the whole product can be shown to clients. The rows above run on the
real API; screens for the modules not built yet read a fictional demo layer
(`apps/web/src/demo/`) and carry a **Sample data** badge (DECISIONS A17). To run the demo:

```bash
docker compose up -d && bun run db:migrate
SEED_WORKERS=680 bun run db:seed        # once, on an empty database
bun run dev:api                         # API on :3000 (PORT=3100 if 3000 is taken)
bun run dev:web                         # web on :5173 (VITE_API_URL=http://localhost:3100 to match)
```

Open http://localhost:5173, choose a role on the sign-in screen, and switch roles from the
user menu. Ctrl+K searches workers, clients, sites and screens.

### Hosted demo on Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sami-844/manpower-management-system)

The button copies this repository into your GitHub account and deploys the demo to Cloudflare
Workers on a free account. No database or settings are needed. Keep the suggested commands:
the deploy command runs the root `deploy` script, which builds the demo and uploads it. You get a `*.workers.dev` link to send to clients, and
every push to your copy redeploys it.

The hosted build (`bun run build:demo`) is static. It answers its own API calls in the
browser from the same rule engines (`@mms/core`) and fictional workers
(`apps/web/src/demo/server.ts`). Each visitor's changes stay in their own tab and reset on
reload, and the header shows a **Hosted demo** badge. It is for demos only: production
runs on AWS (DECISIONS A10, A20).

To deploy from this machine instead: `bunx wrangler login`, then `bun run deploy`.

## How we build (agentic engineering loop)

Every step follows the JavaScript Mastery skills loop, adapted to this system:
`/remember restore` → `/architect` → build (tests first) → `/review` → `/imprint` (UI) → `/remember save`, with `/recover` when something breaks.
The skills live in `.claude/skills/`; the build state lives in `docs/PROGRESS.md` (read first, update last), `docs/DECISIONS.md`, `docs/DEFERRED.md` and `docs/ui-registry.md`; the database rulebook is `docs/SCHEMA_GOVERNANCE.md`; the full specification is mirrored in `docs/spec/`.
`bun run gates` enforces the rules a script can check (migrations lock, money types, dates, sequences, lockfile, golden sign-off, personal data, colours) and runs first in CI and after every agent edit.
Working principles come from the Karpathy guidelines (`/karpathy-guidelines`). MCP servers (`.mcp.json`), hooks and permissions (`.claude/settings.json`) and subagents (`.claude/agents/`) are part of the setup; run `bun run agent:doctor` after cloning. **`CLAUDE.md` is the map of every file and rule.** Upstream originals (JSM and Karpathy, with licences) are in `third_party/`.

## Layout

```
packages/core        Domain engines (compliance, renewals, money) — pure TypeScript, no I/O
apps/api             NestJS API on Bun and PostgreSQL 16 (Drizzle, numbered SQL migrations)
apps/web             The shared interface: React + Vite, used by web, desktop and mobile
apps/desktop
  print-spooler      Rust library: silent batch printing (Windows spooler / CUPS)
  src-tauri          Tauri 2 desktop shell
```

## Run it locally

Needs Bun 1.4, PostgreSQL 16 (or Docker), and Node 22 for the web test and mutation
tools.

```bash
bun install
docker compose up -d            # or use a local PostgreSQL with user/password mms
bun run db:migrate
bun run db:seed                 # 120 fictional workers and 3 sites
bun run dev:api                 # http://localhost:3000 (runs on Bun)
bun run dev:web                 # http://localhost:5173
```

Production API image (Bun): `docker build -f apps/api/Dockerfile -t workforce-api .`

Desktop app (needs Rust; on Windows also the WebView2 runtime, which ships with Windows 10/11):

```bash
bun run --filter @mms/desktop dev     # opens the desktop window on the dev web app
bun run --filter @mms/desktop build   # builds the MSI and EXE installers
```

Every push to GitHub also builds the Windows installer in CI (Actions → latest run →
`workforce-windows-installer`).

## Tests

Everything is written test-first (see CLAUDE.md).

```bash
bun run test                          # core + API (bun test, real database) + web components (Vitest)
bun run test:mutation                 # proves the core tests catch broken code (gate: 80%)
bun run --filter @mms/web test:e2e    # Playwright, desktop and phone sizes, against the running API
bun run --filter @mms/desktop test:rust
```

| Suite | Tests |
| --- | --- |
| Core engines | 94, including property-based; mutation score 95% |
| API (PostgreSQL) | 29 |
| Web components | 45 |
| End-to-end | 3 journeys × 2 screen sizes |
| Print module (Rust) | 10 |

## Before real data goes in

- Replace the `x-user` header with Amazon Cognito sign-in and role checks.
- Run the Discovery print test on the company's own printers: 700 payslips and 200 ID
  cards with no dialog (Printers screen → Print test page is the first step).
- Buy a Windows code-signing certificate and add Tauri's signed auto-updater.
- Complete the PDPL transfer assessment for the chosen AWS region.
