---
name: review
description: After building a step of the manpower system, verify it matches the specification and the architect plan, respects the CLAUDE.md rules and the gates, and is safe for workers' pay, legal documents and personal data. Reports issues by severity so the developer decides what to fix.
---

Building is not done when the code runs. For a company that pays 700 people through the Wage Protection System and answers to the Ministry of Labour, it is not done until it is correct, and the difference between those two states is measured in salaries, fines and blocked visas.

Run this after every step, before `docs/PROGRESS.md` is updated.

## What this skill does not do

It does not fix anything. It reports and lets Sami decide. Fixing without understanding is how problems get buried instead of solved.

## Step 1 — Establish the benchmark

Read, in this order:

- The implementation plan from `/architect`, if one exists
- The sprint and phase for this step (`docs/spec/08-Implementation-Plan.md`, `03-Delivery-Phases.md`)
- Every TR-ID the step should satisfy (`docs/spec/05-TRD.md`) and the relevant parts of `01-PRD.md`, `06-App-Flow.md`, `07-Backend-Schema.md`, `09-Design-Brief.md`
- `CLAUDE.md`: the rules and the Never table
- `docs/SCHEMA_GOVERNANCE.md`
- The diff: `git diff main...HEAD` (or the commits of this step)

Without a benchmark there is no review, only opinion. If no plan exists, ask what the step was supposed to do before reviewing anything.

## Step 2 — Run the gates

```bash
bun run gates        # repository gates (scripts/gates.ts)
bun run typecheck
bun run test
bun run test:mutation    # when packages/core changed
```

Record the actual result of each. A gate that was not run is reported as **not run**, never as passed.

**Independent eyes for high-stakes work.** If the change touches payroll, WPS, end of service, eligibility, permissions or row-level security, four-eyes approvals, migrations, audit or personal data, also run the **`independent-reviewer`** agent ("Use the independent-reviewer agent on this diff"). It has not seen the build, so it cannot grade the work by the builder's intentions. Merge its findings into the report; where it and you disagree, report both.

**UI changes:** use the **playwright** MCP server to open the changed screen on the local web app and look at it (empty, loading, error and full states) before signing off Layer 4.

## Step 3 — Review in four layers

### Layer 1 — Does it match the specification?

- Every part of the sprint step: is it there?
- Every TR-ID named in the plan: is there a test that proves it?
- Decisions from `/architect`: reflected in the code?
- Scope: did anything get built that was not asked for? **Version 2 work during Version 1 is out of scope.**
- Reuse: was an existing engine or component re-implemented instead of used?

Flag what was planned and is missing. Flag what was built and was not planned.

### Layer 2 — Does it respect the system?

**Architecture**
- Business rules live in `packages/core` and the API services, never in controllers and never only in the web app.
- Shells (desktop, mobile) hold no business rules.
- Modules match PRD modules; one dependency direction, no cycles.
- Shared UI lives in `packages/ui` (shadcn) and is imported, not copied.

**The gates — check each explicitly**

| Gate | What to look for |
|---|---|
| Permission | Every new endpoint declares its permission; default deny |
| Scope | Rows filtered by entity, site and client through RLS and the service layer, never by trusting a parameter |
| Money | `NUMERIC(14,3)` in the database, `decimal.js` via `packages/core/src/money.ts` in code. No `number`, `float` or `real` for money, anywhere |
| Legal values | From `rule_versions` only; never a literal in logic |
| Status | Every status change goes through its service method and an allowed transition |
| Migrations | A new numbered SQL file; no applied migration edited (`bun run gates` checks the lock) |
| Sequences | Codes and numbers from a database sequence or locked counter. No `MAX()+1`, no count-then-insert |
| Dates | Calendar dates as `DATE` / `YYYY-MM-DD` in Oman time; moments as `timestamptz`, `<verb>_at` |
| Status values | A `CHECK` list of allowed values, not free strings |
| Golden files | No expected value created or changed by an AI; new cases carry `expected: null` |
| Audit | Every write records actor, before and after in `audit_events` |

**If the desktop shell is touched**
- Rust stays small and only in `apps/desktop`; nothing native is called outside the platform adapter.
- `capabilities/` not widened without a reason recorded.
- The web build still compiles and works without the desktop.

**Naming:** tables plural snake_case, foreign keys `<singular>_id`, booleans `is_` / `has_`, money `_amount`, dates `_on`, moments `_at`, permissions `domain.resource.action`, endpoints plural kebab-case under `/api/v1`.

### Layer 3 — Is it safe?

The layer that protects pay, legal standing and personal data.

- **Concurrency.** Anything allocating a code or number, releasing a payroll run, generating a WPS file, locking a timesheet, issuing an invoice or posting a journal: is there a database-level guard (row lock, conditional UPDATE, unique or exclusion constraint), and a test that runs two at once **on PostgreSQL**? Two clicks in sequence is not a concurrency test.
- **Idempotence.** Any job that can be re-run (payroll calculation, accruals, imports, WPS generation, bank-response import): does running it twice give the same result? Money POSTs require an `Idempotency-Key`.
- **Four eyes.** Bank-account change, wage change, payroll release, rate-card change, write-off, override, client-approval recording from a timesheet pack: is maker ≠ checker enforced on the server, with a test where the maker tries to approve? A declared check that is not enforced is worse than none, because the record looks trustworthy.
- **Nothing final is overwritten.** Locked timesheets, released payroll runs, issued invoices, closed periods, signed settlement statements: corrections are new records (adjustment lines, credit notes, reversing journals). Check that no code path updates them in place.
- **Compliance is never bypassed.** Assignment, roster, attendance entry and payroll all call `checkEligibility()`. An override is a record with approver, reason and end date.
- **Personal data.** Passport, civil ID and bank numbers masked by default; unmasking needs `pii.view` and is audited. No salary visible beyond payroll, finance and owner.
- **Evidence.** Version 1 attendance lines link to a filed daily-sheet scan; a client approval from a pack requires the signed file.
- **No real data.** Nothing from a real worker, client or bank in code, tests, fixtures, prompts or screenshots.

### Layer 4 — Is it production ready?

- Fails loudly: no swallowed errors, no silent fallbacks on startup or imports.
- Errors returned as RFC 9457 problem details with field-level messages.
- Empty, loading and error states on every new screen; the task time budget measured if the screen has one.
- Keyboard use and visible focus; colour never the only signal; numbers in tabular figures, money with three decimals.
- Layout uses logical properties (ready for Arabic).
- Nothing in a response leaks a field the role should not see.
- Console clean; no secret, no real personal data and nothing generated committed.

## Step 4 — Report

```
## Review — [Sprint and step]

### Gates run
[bun run gates / typecheck / test / test:mutation — actual result, or "not run"]

### Layer 1 — Specification alignment
[PASS / ISSUES]

### Layer 2 — System integrity
[PASS / ISSUES]

### Layer 3 — Pay, legal and data safety
[PASS / ISSUES]

### Layer 4 — Production readiness
[PASS / ISSUES]

### Summary
[X] issues — [n] critical, [n] important, [n] minor.
```

Label each issue by severity, with file and line:

**Critical — fix before `docs/PROGRESS.md` is updated**
- Missing permission or row scope on any endpoint
- Money as anything other than `NUMERIC` / decimal
- A legal value hard-coded instead of read from a rule version
- A concurrency path with no database-level guard
- Four-eyes bypass reachable on any approval
- Any code path that overwrites a locked, released, issued or closed record
- A golden expected value created or changed without sign-off
- `checkEligibility()` bypassed or re-implemented
- Real personal data committed

**Important — fix before the phase gate**
- Missing audit on a write
- Missing exception path (rejection, dispute, reversal, bank rejection)
- A TR-ID with no test
- Naming or structural drift that will compound

**Minor — fix when convenient**
- Formatting, comment gaps, missing optimisations

## Step 5 — Stop

Present the report and stop. Do not fix. Do not suggest fixes unless asked.

Sami owns the quality decision. This skill informs it.

## The standard

Not "does it work". **"Is it correct, and is it safe?"** A feature can work today and pay 700 people the wrong amount next month. Review exists to catch the difference before it reaches the bank.
