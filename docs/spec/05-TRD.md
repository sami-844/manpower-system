# TRD — Technical Requirements

Every technical requirement the system must meet is listed here once, with an ID, one testable statement and the test that proves it. Engineers build to it, CI enforces most of it automatically, and acceptance at G4 checks the rest.

**How requirements are written**

- **ID:** a stable code such as TR-SEC-04. IDs are never reused or renumbered; a dropped requirement is marked withdrawn.
- **MUST** blocks release if it fails. **SHOULD** is a target that is tracked and reported but doesn't block.
- **Verified by** names the check: a CI gate, an automated test suite, a load or penetration test, or a review at acceptance.
- Every requirement traces to a PRD goal (see Traceability at the end). A requirement with no PRD goal behind it is questioned before it is built.

The Technical Spec explains how and why the system is built the way it is. This document states only what must be true, so a reviewer can mark each line pass or fail.

**Release scope.** Every requirement applies to Version 1 (go-live 8 Aug 2027: the office, the owner and the system admin) unless it is marked Version 2 (the supervisor app, client portal and worker app, by 27 Jan 2028). Version 2 requirements shape the design now, so the API, data model and roles need no change for them, but they are verified at G7, not at G5.

## 1. Platform and architecture

| ID | Requirement | Level | Verified by |
|---|---|---|---|
| TR-PLT-01 | The server is one modular monolith (NestJS on Bun 1.4 or later). Its modules match the PRD modules and call each other only through published service interfaces or domain events. | MUST | Dependency rule in CI fails any import across module internals |
| TR-PLT-02 | All business rules run on the server. The web, desktop and mobile shells may use shared code for display and early validation only, and the server re-checks every input. | MUST | API contract tests send invalid input directly to every endpoint |
| TR-PLT-03 | Pure engines (compliance, payroll, billing, ledger, money) live in `packages/core` with no database, network or clock access. | MUST | Lint rule bans I/O imports in `packages/core` |
| TR-PLT-04 | One PostgreSQL 16 database. Schema changes happen only through numbered, forward-only SQL migrations that stay compatible with the previous release. | MUST | CI applies every migration to a copy of the production schema and runs the previous release's tests against it |
| TR-PLT-05 | A REST API described by an OpenAPI 3.1 file generated from the code, with a typed client generated for the web app. | MUST | CI fails if the generated OpenAPI file differs from the committed one |
| TR-PLT-06 | Hosted on AWS in the region approved by the PDPL transfer assessment: ECS Fargate, RDS for PostgreSQL (Multi-AZ), S3, KMS, Secrets Manager, WAF and ElastiCache. Every resource is defined in Terraform. | MUST | `terraform plan` shows no drift; an AWS Config rule flags resources created by hand |
| TR-PLT-07 | Every business table carries `entity_id`, so a second legal entity is configuration, not code. | MUST | Test creates a second entity and proves its data is invisible to the first |
| TR-PLT-08 | Background jobs (payroll runs, files, alerts, sync) run on BullMQ with retries, idempotency keys and a dead-letter queue visible to admins. | MUST | Job tests that kill a worker mid-job and confirm one result only |
| TR-PLT-09 | Timestamps are stored in UTC. Calendar dates (documents, rosters, leave) are stored as DATE in Oman time. "Today" always comes from an injected clock. | MUST | Tests run with a frozen clock across midnight and month-end |
| TR-PLT-10 | Legal values (hours, rates, caps, percentages) live only in dated rule tables that admins can edit, never in code. | MUST | Review checklist; golden tests switch rule versions mid-period |

## 2. Security and access

| ID | Requirement | Level | Verified by |
|---|---|---|---|
| TR-SEC-01 | Office staff and the owner (and client users from Version 2) sign in through Amazon Cognito with mandatory two-factor authentication (authenticator app). | MUST | End-to-end sign-in tests; Cognito settings in Terraform |
| TR-SEC-02 | Version 2: supervisors and workers sign in with phone number and one-time code the first time, then a PIN or device biometrics. Each account is bound to its device, and every reset is logged with a reason. | MUST | Mobile end-to-end tests |
| TR-SEC-03 | Access tokens last at most 15 minutes; office sessions end after 30 minutes idle. The desktop app keeps its refresh token in the Windows credential store, never in browser storage. | MUST | Security tests; desktop code review |
| TR-SEC-04 | Every endpoint declares the permission it needs, and anything not declared is denied. Permissions come from the nine PRD roles, scoped by entity, site and client. | MUST | A generated test calls every endpoint as every role and compares the result with the permission matrix |
| TR-SEC-05 | PostgreSQL row-level security enforces entity, site and client scope even if application code has a bug. | MUST | Database tests attempt cross-scope reads and must get zero rows |
| TR-SEC-06 | Bank account changes, wage changes, payroll release, rate card changes and write-offs need two different people: one to make the change, another to approve it. | MUST | API tests prove the maker cannot approve |
| TR-SEC-07 | Passport, civil ID and bank account numbers show only the last 4 characters unless the user holds the `pii.view` permission. Every unmasking is audited. | MUST | API and component tests |
| TR-SEC-08 | Traffic is encrypted with TLS 1.2 or later (1.3 preferred). Data at rest is encrypted with KMS, and bank and ID numbers are additionally encrypted per column. | MUST | Configuration scan; database inspection test |
| TR-SEC-09 | Secrets live only in AWS Secrets Manager. The repository is scanned for secrets on every pull request. | MUST | Secret scanner in CI |
| TR-SEC-10 | The application meets OWASP ASVS level 2. Dependencies and container images are scanned on every pull request, and no high or critical finding is open at release. | MUST | CI scans; release checklist |
| TR-SEC-11 | Sign-in and one-time codes are limited to 5 attempts per 15 minutes per user and IP address; the API is limited to 600 requests per minute per user; AWS WAF managed rules are on. | MUST | Automated abuse tests |
| TR-SEC-12 | Uploads accept only PDF, JPG, PNG and HEIC up to 15 MB, and each file is virus-scanned before anyone can open it. | MUST | Upload tests with blocked types and a test virus file |
| TR-SEC-13 | The desktop app exposes only its own print and device commands, restricts network calls to the API by content security policy, and ships signed installers and signed updates. | MUST | Tauri capability review; signature check in CI |
| TR-SEC-14 | An external penetration test runs before go-live and every year after; high and critical findings are fixed before release. | MUST | Test report at G4 and yearly |

## 3. Data, privacy and audit

| ID | Requirement | Level | Verified by |
|---|---|---|---|
| TR-DAT-01 | Every create, change, approval, export and sign-in writes an audit event with who, when, device and before/after values. The log is append-only, enforced by the database, and SHA-256 hash-chained, so any edit is detectable. It is kept for 10 years. | MUST | Built and tested in the first slice: append-only trigger, tamper detection and chain verification tests |
| TR-DAT-02 | Anything that changes over time (wages, rates, assignments, rule versions, status) is stored with valid-from and valid-to dates and is never overwritten. | MUST | Schema review; history tests |
| TR-DAT-03 | Locked timesheets, released payroll runs, issued invoices and closed accounting periods cannot be changed, enforced by database triggers. Corrections are new adjusting records. | MUST | Database tests attempt edits and must fail |
| TR-DAT-04 | Business records are never hard-deleted; they are archived with a reason. A lawful erasure request anonymises personal fields but keeps financial totals intact. | MUST | Erasure test confirms payroll and ledger totals are unchanged |
| TR-DAT-05 | Each worker's consent is recorded with notice version, language and date. Data-subject requests run through a workflow with a 45-day clock, and the record of processing is kept current. | MUST | Workflow tests; DPO review at G0 and G4 |
| TR-DAT-06 | A personal-data breach can be detected, contained and reported within 72 hours, following a tested runbook with named owners. | MUST | Yearly breach drill |
| TR-DAT-07 | Retention periods are set per data type. Purge jobs run on schedule and log what they removed. | MUST | Job tests |
| TR-DAT-08 | Point-in-time recovery covers at least 30 days. Daily backups are copied to a separate, locked backup account and kept for 1 year. A full restore is tested every month. | MUST | Monthly restore record |
| TR-DAT-09 | Data loss is at most 5 minutes (RPO) and recovery takes at most 4 hours (RTO). | MUST | Disaster drill twice a year |
| TR-DAT-10 | The owner can export all data and documents on demand in open formats. | MUST | Export test at G4 |
| TR-DAT-11 | Real personal data exists only in production. Staging uses an anonymised copy made by a documented tool. AI coding tools never receive production data. | MUST | Anonymiser tests; CLAUDE.md rule |
| TR-DAT-12 | Documents are stored in S3 with versioning. Signed records (settlement statements, payslips) use object lock so they cannot be altered. | MUST | Storage configuration test |

## 4. Performance, scale and reliability

| ID | Requirement | Level | Verified by |
|---|---|---|---|
| TR-PER-01 | The system handles 5,000 workers, 100 office users, 2,000 concurrent app users and 30,000 attendance events a day, which is about 7 times today's workforce. | MUST | Load test (k6) on staging before G4 |
| TR-PER-02 | At that load, 95% of API reads finish in under 300 ms, writes in under 500 ms, and searches in under 300 ms. | MUST | Load test |
| TR-PER-03 | 95% of office screens are usable within 1.5 s on an office PC. The web app scores at least 90 for performance in Lighthouse on desktop. | MUST | Lighthouse in CI; Playwright timing |
| TR-PER-04 | A 700-worker payroll calculates in under 2 minutes; a 5,000-worker payroll in under 10 minutes. | MUST | Timed payroll test on staging |
| TR-PER-05 | All client invoices for a month generate in under 5 minutes. | MUST | Timed billing test |
| TR-PER-06 | The web app and API are available 99.9% of each month, excluding announced maintenance outside working hours. | MUST | Uptime monitoring report |
| TR-PER-07 | Version 2: the supervisor app works offline for 72 hours, and a day's crew data syncs in under 30 seconds on 3G. | MUST | Field test before the Version 2 pilot; offline end-to-end tests |
| TR-PER-08 | If WhatsApp, SMS or email providers fail, messages queue and retry; payroll and billing are never blocked by them. | MUST | Fault-injection tests |
| TR-PER-09 | Every request is traced (OpenTelemetry). Alerts fire on error rate above 1%, slow responses, a job queue older than 5 minutes, mobile sync lag (Version 2), WPS file failures and backup failures. | MUST | Alert tests on staging |
| TR-PER-10 | Size budgets: web app initial JavaScript at most 300 KB compressed (Aceternity components load only when needed); mobile app at most 30 MB (Version 2); desktop installer at most 15 MB. | SHOULD | Size check in CI |

## 5. Integrations

| ID | Requirement | Level | Verified by |
|---|---|---|---|
| TR-INT-01 | Generate the Bank Muscat WPS salary file from its published specification, using a versioned template. Before export, validate account formats, employer IDs and totals. Store a hash of every file sent. | MUST | Golden file tests against bank-provided samples; bank test-channel acceptance at G3 |
| TR-INT-02 | Import the bank's acknowledgement and rejection files, match each line to its payslip, and open a task for every rejection. | MUST | Tests with sample rejection files |
| TR-INT-03 | Calculate Social Protection Fund contributions, including the sick-leave insurance branch and the expatriate savings system (9% of basic wage), from dated rules, and export the Fund's files. | MUST | Golden cases signed by payroll officer and lawyer |
| TR-INT-04 | Government portals (Ministry of Labour, ROP) have no assumed API. The system prepares the data and documents, tracks reference numbers and status, and keeps an adapter interface ready for future APIs. | MUST | Workflow tests |
| TR-INT-05 | Send WhatsApp Business template messages (payslip link, expiry reminder, roster change); store delivery and read status; honour opt-outs; fall back to SMS when a message is undelivered after 24 hours. | MUST | Provider sandbox tests |
| TR-INT-06 | One-time codes and fallback messages go through a local SMS gateway. | MUST | Provider sandbox tests |
| TR-INT-07 | Email goes out through Amazon SES with SPF, DKIM and DMARC. Timesheet approval links are signed, single-use and expire after 7 days. | MUST | Link tests: reuse, expiry, tampering |
| TR-INT-08 | Version 2: push notifications use FCM on Android and APNs on iOS through Capacitor. In Version 1, owner alerts go by WhatsApp and email with links, plus web push where the phone supports it. | MUST | Device tests |
| TR-INT-09 | The desktop app prints PDF batches of 700 or more silently to a saved printer per job type, with progress, cancel and a per-document result. | MUST | Print module tests (built: 10 passing); Phase 0 office print proof |
| TR-INT-10 | Biometric terminals (Phase 12) push events into the same attendance records, with duplicates removed. | MUST | Vendor sandbox tests in Phase 12 |
| TR-INT-11 | Bank statements import from CSV and MT940 for reconciliation. | MUST | Tests with sample statements |
| TR-INT-12 | Every adapter retries with backoff, uses idempotency keys, logs requests with personal data masked, has a manual fallback, and shows its health on an admin page. | MUST | Adapter contract tests |

## 6. Clients and interface

| ID | Requirement | Level | Verified by |
|---|---|---|---|
| TR-CLI-01 | One React 19 and TypeScript codebase (`apps/web`) serves the web app and the desktop app, and in Version 2 the mobile app and client portal. It uses Vite, React Router, TanStack Query and TanStack Table. | MUST | Build produces one artifact used by all three shells |
| TR-CLI-02 | The interface is built with shadcn/ui on Tailwind CSS v4 using Radix primitives. Components are copied into `apps/web/src/components/ui`, owned and reviewed by the team, and `components.json` has `rtl: true` so every component uses logical (left/right-neutral) classes. | MUST | Lint rule bans physical left/right classes; code review |
| TR-CLI-03 | Aceternity UI components are used only from the approved list in the Design Brief. Each is installed through the shadcn registry into `components/aceternity`, wrapped, loaded only when needed, and has a reduced-motion fallback. Animation uses the `motion` package. | MUST | Lint rule allows imports from `components/aceternity` only in approved screens; tests with reduced motion on |
| TR-CLI-04 | The interface meets WCAG 2.2 AA: operable by keyboard, visible focus, correct contrast, and labels on every control. | MUST | axe checks in component tests and Playwright; manual check at G4 |
| TR-CLI-05 | English at launch. Every string lives in translation files (ICU format), with no hard-coded text, ready for Arabic and workers' languages. | MUST | Lint rule for hard-coded strings |
| TR-CLI-06 | The desktop app runs on Windows 10 and 11 (64-bit), installs from signed MSI or NSIS files with the WebView2 installer included, updates itself with staged rollout, and is refused by the API below a minimum version. | MUST | CI installer build; update test on a test PC |
| TR-CLI-07 | Desktop-only features are limited to silent printing, printer listing, scanner and file import, native notifications, and credential storage. | MUST | Tauri capability file review |
| TR-CLI-08 | Version 2: the mobile app (Capacitor) runs on Android 9 or later with 2 GB of memory (iOS 16 or later ready). It has an offline store, background sync, camera, GPS and push notifications, and stays under 30 MB. | MUST | Device tests on a low-cost Android phone |
| TR-CLI-09 | The web app supports the last two versions of Chrome, Edge, Safari and Firefox, and works down to 360 px wide. | MUST | Playwright at desktop and phone sizes |
| TR-CLI-10 | Shell features are detected at runtime, so screens show desktop or mobile actions only where they work. | MUST | Component tests for each shell |
| TR-CLI-11 | Only the Version 2 supervisor app works offline. The office app needs a connection, and shows a clear banner and keeps unsaved input when the connection drops. | MUST | Network-off end-to-end tests |
| TR-CLI-12 | Version 1 attendance comes from daily sheets: the system generates one sheet per site per day from the roster, with a QR code holding the site, date and sheet number, printable silently from the desktop app and sendable as a PDF. | MUST | Sheet generation tests; print test in Phase 0 |
| TR-CLI-13 | The attendance entry grid opens pre-filled with the site's rostered crew, needs only exceptions to be typed, works entirely from the keyboard, and lets a timekeeper enter a 30-person sheet in under 2 minutes. | MUST | Timed usability test at G2 |
| TR-CLI-14 | Uploaded sheet photos are filed to their site-day by reading the QR code; unreadable images go to a review queue; a rostered site-day without a filed scan is flagged the next morning. | MUST | QR filing tests with skewed and low-light photos |
| TR-CLI-15 | Client timesheet packs (summary and daily lines per site and period) are generated as PDFs and emailed from the system. Recording a client approval requires the signed file, and the person who entered a site's sheets cannot submit that site's week. | MUST | API tests for the evidence and four-eyes rules |

## 7. Engine correctness

| ID | Requirement | Level | Verified by |
|---|---|---|---|
| TR-ENG-01 | Money is stored as NUMERIC(14,3) and calculated with decimal.js; JavaScript numbers are never used for money. Rounding follows the rule table (banker's rounding by default). | MUST | Lint rule; money tests (built) |
| TR-ENG-02 | `checkEligibility()` is the only answer to "may this worker work here on these dates?". Roster, clock-in, payroll and matching all call it. | MUST | Built and mutation-tested; a review rule blocks re-implementing it |
| TR-ENG-03 | Payroll is deterministic and repeatable: the same inputs and rule versions always give the same result. Released runs cannot change; corrections become adjustment lines in the next run. | MUST | Repeat-run test; immutability trigger test |
| TR-ENG-04 | Every payslip line records how it was derived: its inputs, rule version and formula. | MUST | Snapshot tests on derivation traces |
| TR-ENG-05 | Deduction caps and priority order are enforced by the engine. No override, role or setting can bypass them. | MUST | Property tests |
| TR-ENG-06 | A pay period that spans a rule change is calculated in parts, split at the effective date. | MUST | Golden cases across a rule change |
| TR-ENG-07 | Each invoice line equals a locked timesheet line times its matching rate line. An unmatched line blocks the invoice. Invoice total equals the sum of lines plus VAT, exactly. | MUST | Golden billing suite; property tests |
| TR-ENG-08 | Every ledger journal balances (enforced by the database at commit), and closed periods cannot be posted to. | MUST | Database constraint tests |
| TR-ENG-09 | Golden suites (300+ payroll cases, billing per contract type, final settlements) pass at 100%, exact to the baisa. Expected values come only from files signed by the payroll officer, accountant or labour lawyer; code owners block any change to them without senior review and a signed reference. | MUST | CI golden-suite gate |
| TR-ENG-10 | Property tests prove the invariants: net pay is never negative; deductions never exceed the cap; hours paid never exceed hours locked; invoices and journals always add up. | MUST | Property tests in CI |
| TR-ENG-11 | Mutation score on `packages/core` stays at 80% or above (95% today). | MUST | Mutation gate in CI |

## 8. Development, testing and release

| ID | Requirement | Level | Verified by |
|---|---|---|---|
| TR-DEV-01 | One repository on Bun 1.4 (package manager, API runtime and test runner) with a single `bun.lock`. Packages tied to downloaded binaries are pinned to exact versions. | MUST | CI uses `bun install --frozen-lockfile` |
| TR-DEV-02 | Tests come first: an acceptance test exists before the code that passes it. A pull request adding behaviour without tests fails review. | MUST | Review checklist |
| TR-DEV-03 | Every pull request must pass all CI gates before merging: type checks, lint, unit and database tests, mutation testing, end-to-end tests (desktop and phone), accessibility checks, golden suites, OpenAPI and migration checks, secret and dependency scans, the API image build and the Windows installer build. | MUST | Branch protection on `main` |
| TR-DEV-04 | A second engineer reviews every change. Payroll, compliance, security and migration changes need a senior reviewer, enforced by code owners. | MUST | Branch protection |
| TR-DEV-05 | AI-assisted work (Claude Code) follows CLAUDE.md. Production data never goes into prompts, and AI never writes or edits golden expected values. | MUST | CLAUDE.md rules; code owners on golden files |
| TR-DEV-06 | Four environments: local, staging (anonymised data), production, plus optional preview per pull request. All are built from Terraform, and production deploys need approval. | MUST | Pipeline configuration |
| TR-DEV-07 | Releases go out every two weeks, never from 2 days before to 2 days after a payroll release. Unfinished or law-dated features hide behind feature flags. | MUST | Release calendar check in the deploy pipeline |
| TR-DEV-08 | Any release can be rolled back to the previous version in under 10 minutes, because migrations stay compatible with the previous release. | MUST | Rollback rehearsal before G5 |
| TR-DEV-09 | Versions follow semantic versioning with a changelog. The API refuses desktop and mobile versions below the minimum supported. | MUST | Version header tests |
| TR-DEV-10 | Decisions are recorded as short architecture decision records. Runbooks and the admin guide are updated in the same pull request as the change. | MUST | Review checklist |

## 9. Traceability

Each PRD non-negotiable and goal is covered by the requirements below, so a failing requirement shows which business promise is at risk.

| PRD goal | Technical requirements |
|---|---|
| Zero lapsed documents | TR-ENG-02, TR-PLT-09, TR-SEC-04, TR-DAT-01, TR-INT-05 |
| Pay right, on time, every month | TR-ENG-01, TR-ENG-03 to 06, TR-ENG-09 to 11, TR-INT-01 to 03, TR-PER-04, TR-SEC-06 |
| Bill every hour | TR-ENG-07, TR-ENG-08, TR-CLI-14, TR-CLI-15, TR-INT-07, TR-PER-05, TR-DAT-03 |
| Workers kept informed | TR-INT-05, TR-INT-06, TR-PER-08 |
| Owner sees the business in one screen | TR-CLI-01, TR-CLI-09, TR-PER-03 |
| Convenient to operate (task time budgets) | TR-CLI-02 to 04, TR-CLI-11 to 13, TR-PER-02, TR-PER-03, TR-INT-09 |
| Oman compliance and data protection | TR-PLT-06, TR-PLT-10, TR-DAT-01 to 12, TR-SEC-01 to 14 |
| Never depend on one person or vendor | TR-PLT-04, TR-PLT-05, TR-DEV-01, TR-DEV-10, TR-DAT-10 |
