# Implementation Plan

The build runs in 20 two-week sprints from Sunday 1 November 2026 to the Version 1 go-live on Sunday 8 August 2027. Every sprint ends with working software on staging, demonstrated to the module owner on its second Thursday. Version 2 (the supervisor app, client portal and worker app) follows in sprints S21 to S33 and ends at G7 on Thursday 27 January 2028.

Delivery Phases is the business view: phases, gates and who signs. This plan is the engineering view of the same dates: which sprint builds what, how code reaches production, and how data moves across. If the kickoff date moves, both documents shift together.

The team works test-first with Claude Code as the main coding assistant, following the rules in CLAUDE.md (see TR-DEV-01 to 10 in the TRD).

## Codebase today and at go-live

| Package | Today (commit f8115c6) | At go-live |
|---|---|---|
| `packages/core` | Compliance check, renewal tiers, money, dates, summary; 94 tests | Plus pay engine (gratuity, overtime, deductions, savings system, SPF), billing calculator, rule versions; every rule with signed golden cases |
| `apps/api` | NestJS on Bun: workers, documents, sites, overrides, leave, audit chain; 29 tests | All modules in the API surface, Cognito auth, RLS, jobs, outbox, OpenAPI 3.1 |
| `apps/web` | React slice with custom CSS; 17 unit tests and Playwright e2e | shadcn/ui app shell, every office screen including daily sheets and attendance entry, owner views on desktop and phone; client portal in Version 2 |
| `apps/desktop` | Tauri shell and print-spooler crate; 10 Rust tests | Signed Windows installer, silent bulk printing, auto-update, offline read cache |
| `apps/mobile` | Not started | Not in Version 1. Version 2: Capacitor app (supervisor, worker and owner modes; Android first, iOS ready) with offline attendance |
| `packages/ui` | Not started | Shared shadcn components, tokens, Aceternity pieces from the approved list |
| `infra/` | Not started | Terraform for every AWS environment |

## Sprint plan

Sprints run Sunday to Thursday over two weeks. Demo is the second Thursday; planning is the following Sunday morning.

| Sprint | Dates | Goal | Demo |
|---|---|---|---|
| S1 | 1–12 Nov 2026 | Proofs: silent printing on office printers, Bank Muscat WPS sample file, AWS landing zone | Desktop prints 50 payslips with no dialog |
| S2 | 15–26 Nov | Foundation: `packages/ui` with shadcn and tokens; first slice migrated; Cognito sign-in | Worker list in the new shell, signed in |
| S3 | 29 Nov–10 Dec | Roles, RLS, rules engine, audit on every write; G0 sign-off | Permission matrix enforced end to end |
| S4 | 13–24 Dec | Worker file complete: contracts, bank accounts, document capture | HR creates a full worker file in under 5 minutes |
| S5 | 27 Dec 2026–7 Jan 2027 | Renewals board, government transactions, CI/CD to staging; G1 | Renewal tasks auto-created and tracked |
| S6 | 10–21 Jan | Clients, sites, contracts, rate cards | Rate card with OT and Friday rates |
| S7 | 24 Jan–4 Feb | Absconding process, overrides with approval, workforce reports | Blocked worker cannot be assigned |
| S8 | 7–18 Feb | Requests and matching | Request for 20 masons matched with blockers shown |
| S9 | 21 Feb–4 Mar | Assignments, roster, bench; daily sheet generation and printing | Roster by site for a month |
| S10 | 7–18 Mar | Attendance entry grid and QR scan filing; pay engine core | 30-person sheet entered in under 2 minutes, photo filed by its QR code |
| S11 | 21 Mar–1 Apr | Timesheets, operations review, client timesheet packs, disputes; overtime and deductions | Locked timesheet feeds payroll draft |
| S12 | 4–15 Apr | Leave, sick leave with SPF, savings system 9% | Golden payroll cases pass |
| S13 | 18–29 Apr | Payroll runs, approvals, payslips bulk print; G2 | 700 payslips printed silently |
| S14 | 2–13 May | WPS file, rejection loop, settlements and gratuity; G3 | Bank Muscat test portal accepts file |
| S15 | 16–27 May | Invoices, credit notes, ledger, VAT | Month invoiced from locked timesheets |
| S16 | 30 May–10 Jun | Receipts, bank reconciliation, period close; owner dashboard | Owner sees cash, margin, compliance on phone |
| S17 | 13–24 Jun | Owner phone web app and approvals by link, migration dress rehearsal 1; G4 | Owner approves a payroll from a WhatsApp link on a phone |
| S18 | 27 Jun–8 Jul | Parallel run month 1, performance and security tests | New and old payroll differ by 0.000 OMR |
| S19 | 11–22 Jul | Parallel run month 2, savings system live by 19 Jul, pen-test fixes | Savings contribution file accepted |
| S20 | 25 Jul–5 Aug | Rehearsal 2, training, cut-over prep | Go/no-go pack for G5 on 8 Aug |

**Version 2 sprints.** Version 2 runs on the live system, with the same rhythm and gates, and never releases within two days of a payroll release.

| Sprint | Dates | Goal | Demo |
|---|---|---|---|
| S21 | 8–19 Aug 2027 | Hypercare only; no Version 2 work | First live week stable |
| S22 | 22 Aug–2 Sep | Supervisor app prototype tested with supervisors; Capacitor shell; phone sign-in with one-time code, PIN and device binding | A supervisor signs in on a low-cost Android phone |
| S23 | 5–16 Sep | Offline store and sync; Crew today (M-01) | A crew marked in flight mode, synced once, nothing lost |
| S24 | 19–30 Sep | Requests and incidents with photos (M-02); push notifications; sync conflict queue | An incident with a photo reaches the office |
| S25 | 3–14 Oct | Supervisor timesheet approval; pilot readiness; G6 on 7 Oct | 72-hour offline test passed |
| S26 | 17–28 Oct | Pilot at two sites with the sheet in parallel; client portal sign-in, timesheet approval, workers on site | A client approves a week in the portal |
| S27 | 31 Oct–11 Nov | Client portal: invoices, statements, requests, ratings, complaints, certificates; pilot ends | Pilot results against the sheet, every difference explained |
| S28 | 14–25 Nov | Worker app: shared-phone sign-in, payslips, documents, leave balance | A worker reads a payslip in Bengali |
| S29 | 28 Nov–9 Dec | Worker app: requests, advances, announcements, check-in where allowed; owner mobile app with push | The owner approves from a push notification |
| S30 | 12–23 Dec | Supervisor app rolled out site by site; client portal invitations; mobile security test | Half the sites on the app |
| S31 | 26 Dec 2027–6 Jan 2028 | Worker app pilot at one camp; translations signed | Pilot camp feedback reviewed |
| S32 | 9–20 Jan 2028 | Rollout complete; store releases; daily sheets retired | Every site on the app |
| S33 | 23 Jan–3 Feb | G7 on 27 Jan; hand-over to the run team | G7 pack signed |

## First six sprints in detail

**S1 Proofs (now running).** Tauri silent print to the office's actual printers from a queue of PDFs; record printer models and driver versions. Generate a WPS SIF file from fake data and validate it with Bank Muscat. Terraform the AWS accounts (prod, staging, dev, audit), SSO and guardrails in the chosen PDPL-approved region. Exit: three written proof reports.

**S2 Foundation UI.** Create `packages/ui`; run `shadcn init` with Tailwind v4 and `rtl: true`; add tokens from the Design Brief; build the app shell (sidebar, top bar, command palette). Replace the slice's custom CSS with shadcn components (see the next section). Cognito user pool with MFA for office roles. Exit: all 17 web tests and e2e pass on the new UI.

**S3 Access and rules.** Role and permission tables, RLS policies, session variables per request, rule versions with effective dates, audit interceptor on every write. Exit: a test proves each role sees only its rows.

**S4 Worker file.** Contracts, bank accounts with IBAN check, document upload with S3 presigned URLs and virus scan, masked numbers with reveal logging. Exit: worker file under 5 minutes in a timed usability test.

**S5 Renewals and pipeline.** Renewal board with 90/60/30/7-day tiers, government transaction tracker, GitHub Actions deploying to staging on merge with migrations and smoke tests. Exit: G1 signed.

**S6 Commercial.** Clients, contacts, sites with required documents, contracts and rate cards with versions. Exit: rate card change creates a new version, not an edit.

## Moving the first slice to shadcn and Aceternity (S2)

| Current slice element | Replacement |
|---|---|
| Custom CSS layout | shadcn `Sidebar` block and `SidebarInset`, Tailwind utilities |
| Hand-made tables | `Table` with TanStack Table: sorting, column visibility, sticky header, virtual rows past 200 |
| Scaffold status tags | `Badge` with `status` variants (ok, due, expired, incomplete, blocked) |
| Forms | `Form` with react-hook-form and the same Zod schemas the API uses |
| Worker detail page | `Sheet` on the list, `Tabs` inside, full page on deep link |
| Alerts and confirms | `Sonner` toasts, `AlertDialog` for destructive actions |
| Search | `Command` palette (Ctrl+K) for workers, sites, actions |
| Dashboard numbers | `Card` tiles; Aceternity `Number Ticker` only on the owner dashboard |

Rules: keep all `data-testid` values so e2e tests stay valid; migrate one screen per pull request; visual snapshots in Playwright at 1366×768 and 1920×1080 before and after.

## Engineering practice

- **Trunk-based.** Short branches, pull requests under 400 lines, merged within two days. Feature flags hide unfinished work.
- **Test first.** Each change starts with a failing test. Golden cases for pay, gratuity, billing and compliance are written by the business, signed, and stored read-only; Claude Code may run them but never edit expected values.
- **AI-assisted.** Claude Code works from CLAUDE.md and the TRD IDs. Every AI-written pull request gets a human review against a checklist: tests first, no real personal data, money uses decimal, migrations reversible.
- **Definition of done.** Tests pass, mutation score held, accessibility check clean, OpenAPI updated, audit events added, demoed on staging.
- **Branch protection.** Two approvals for `packages/core` and migrations; CODEOWNERS for payroll and security.
- **Releases.** Web and API deploy on merge to staging, to production weekly after G5. Desktop releases every two weeks through a signed channel; the mobile apps join in Version 2.

## Test strategy

| Layer | Tool | What it proves | Bar |
|---|---|---|---|
| Core rules | `bun test`, fast-check | Calculations and rules are exact, including edge dates | 100% branches; mutation ≥ 95% |
| Golden cases | `bun test` with signed fixtures | Results match what HR and finance signed | Every case passes; no unsigned changes |
| API | `bun test` + real PostgreSQL | Endpoints, validation, RLS, audit, idempotency | Every endpoint and role |
| Database | SQL tests in CI | Constraints, triggers, append-only audit, migrations up and down | Every migration |
| Web components | Vitest + Testing Library | Screens behave and are accessible | axe clean |
| End to end | Playwright | Main journeys across web and API | Top 25 journeys |
| Desktop | Rust tests + Windows CI | Print queue, retries, installer | Every release |
| Mobile | Appium flows on a device farm (Version 2) | Offline capture and sync | Every release |
| Performance | k6 | p95 under 300 ms at 3× expected load; payroll for 700 under 60 s | Before G4 and G5 |
| Security | ZAP, dependency scan, external pen-test | No high or critical findings open | Before G5 |

## Data migration

1. **Inventory (S1–S3).** List every current source: spreadsheets, the payroll file, bank records, passports and visas on paper.
2. **Map (S4–S7).** Field-by-field mapping to the Backend Schema, with an owner for every field and rules for blanks and conflicts.
3. **Load scripts (S8–S14).** Idempotent Bun scripts that stage, validate and load; each rejected row goes to a report, never silently dropped.
4. **Rehearsal 1 (S17).** Full load into staging; HR checks 50 random worker files; finance checks opening balances, loans and leave.
5. **Parallel run (S18–S19).** Two payroll months run in both systems; every difference explained and signed.
6. **Rehearsal 2 (S20).** Timed full load to prove it fits the cut-over window.

All migration work uses anonymised copies until the production load; real files stay inside the AWS account.

## Cut-over runbook (Thursday 5 Aug to Sunday 8 Aug 2027)

| When | Step | Owner |
|---|---|---|
| Thu 5 Aug, 18:00 | Freeze the old system; last export | Finance lead |
| Thu 21:00 | Production load from the final export | Tech lead |
| Fri 6 Aug, 09:00 | Reconcile counts and totals; HR and finance spot checks | Module owners |
| Fri 15:00 | Install desktop app on all office PCs; test printers | IT support |
| Sat 7 Aug, 10:00 | Print Sunday's daily sheets for every site; brief supervisors by WhatsApp | Ops manager |
| Sat 16:00 | Go/no-go call | Owner |
| Sun 8 Aug, 07:00 | Live; hypercare room open | Whole team |

**Rollback:** if go/no-go fails or a blocker appears before Tuesday, return to the old system from the frozen export; nothing in it was changed.

## Technical risks

| Risk | Effect | Early signal | Response |
|---|---|---|---|
| Silent printing fails on some printer drivers | Bulk payslips need manual printing | S1 proof | Standardise printer models; PDF fallback batch |
| Bank Muscat WPS format changes | Rejected salary file | S1 sample, S14 test | Format kept in rule versions; bank contact named |
| Savings system details published late | Rework in payroll | Ministry notices | Configurable rate and fund fields; golden cases updated when published |
| Attendance keyed wrongly from paper sheets | Wrong pay and invoices | S10 timed tests; G2 pilot | Pre-filled grid, roster flags, second-person review, a scan on every site-day; offline sync rules proven before the Version 2 pilot |
| AI-generated code with hidden errors | Wrong pay or data leaks | Mutation score drops | Golden cases, mutation bar, human review checklist |
| Bun incompatibility in a dependency | Build or runtime failure | CI on every merge | Node fallback image kept building weekly |
| shadcn moves to Base UI by default | Component drift | CLI changelog | Pin Radix primitives; review each quarter |
| Key person leaves | Delay | Single reviewer on a module | Pairing and CODEOWNERS with two names |
