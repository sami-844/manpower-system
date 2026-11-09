---
name: remember
description: Save manpower system session state at the end of a session so the next one picks up exactly where it left off, or restore it at the start. Writes to the project's own docs/PROGRESS.md, DECISIONS.md and DEFERRED.md rather than a separate memory file.
---

AI has no memory between sessions. This project solves that with `docs/PROGRESS.md`; this skill is the discipline that keeps it accurate.

Run at the end of a session to save. Run at the start of a new one to restore.

## Why this does not use `memory.md`

The project already has a state file, and `CLAUDE.md` tells every agent to read it first. A second memory file competing with it would mean two sources of truth about where the build is, and the one nobody updates becomes the one that misleads. **Everything goes into the files that already exist.**

| What | Where |
|---|---|
| Where the build is, what was done, what is next | `docs/PROGRESS.md` |
| Small decisions taken while implementing (thresholds tuned, names chosen) | `docs/PROGRESS.md` → Notes |
| Anything that answers an open question | `docs/DECISIONS.md` → move to ANSWERED with date and decider |
| A deliberate deferral, with what it would take to build later | `docs/DEFERRED.md` |
| A UI pattern | `docs/ui-registry.md` (that is `/imprint`'s job, not this one) |
| A change to what the product must do | The live shared specification first, then `docs/spec/` |

## Security boundary — non-negotiable

**Never write any of these into any file:**

- Credentials of any kind: passwords, API keys, tokens, connection strings, certificates, AWS keys, Cognito secrets, the WhatsApp or SMS gateway keys, the Bank Muscat channel credentials, the code-signing certificate.
- **Any real worker data.** No names, worker codes from production, passport, visa, labour-card or civil ID numbers, phone numbers, IBANs, salaries, medical results — not even as an example, not even from a test file that came from real records.
- Real client data: contacts, contract rates, invoice amounts.
- Real staff personal data.

If a detail is useful but sensitive, write a redacted placeholder: `[REDACTED]`, or `worker W-000123 [example]`. If unsure whether something is sensitive, it is. Omit it.

**This is strict for a reason.** `docs/PROGRESS.md` is in git, and Oman's Personal Data Protection Law applies to every worker's record. The anonymised seed generator (`apps/api/src/db/seed.ts`) is the only source of example data.

---

## Save mode — `/remember save`

### What to capture

Think of handing off to someone equally skilled who knows nothing about today. What do they need to continue without losing anything?

- **What was built**, precisely. Not "worked on payroll" but "added `packages/core/src/payroll/overtime.ts` with `overtimePay()`; migration `0004_rule_versions.sql`; 12 tests in `packages/core/test/overtime.test.ts`; golden cases G-OT-001…010 added with `expected: null`."
- **Decisions made**: choices later work depends on. If one answers something in `DECISIONS.md`, it does not belong in Notes; move the entry to ANSWERED with the date and the decider.
- **Problems solved**: anything that took time, so the next session does not spend it again.
- **Current state**: what works, what is half-done, what is known broken. Actual gate results from this session.
- **What comes next**: specific enough to start immediately.
- **Open questions**: if one blocks a step, it goes into `DECISIONS.md` as UNANSWERED and the step is marked BLOCKED, not left in a note.

### What not to capture

- Anything readable from the code or git log
- Anything already in `docs/spec/`
- The narrative of how something was built; only what was built and what was decided
- Any secret or any real personal data

### Where it goes

Update `docs/PROGRESS.md` in place: the header block, Completed, In progress, Blocked, Notes, and a new entry at the top of the Session log:

```markdown
**Current phase:** [n] — [name]
**Current sprint:** S[n] ([dates]) — [goal]
**Current step:** [step]
**Last session:** [date]

## Completed
- [x] [sprint · step] [what], [date], commit [hash]

## In progress
- [ ] [sprint · step] [what]
  - [x] [sub-item done]
  - [ ] [sub-item remaining]

## Blocked
- [sprint · step] — blocked on D[n]: [the question]. Asked [who], [date].

## Notes
- [date] [small implementation decision and its reason]
```

**Before writing, show the diff and ask:**

```
docs/PROGRESS.md currently says: [one line]
Proposed update: [one line]

Anything else from this session that should be recorded?
```

Write only after Sami answers. Commit the update with the work it describes.

### Confirm

```
docs/PROGRESS.md updated.
[If applicable] docs/DECISIONS.md — D[n] moved to ANSWERED.
[If applicable] docs/DEFERRED.md — [what] recorded with what it would take.

Next session: /remember restore.
```

---

## Restore mode — `/remember restore`

### Step 1 — Read

In this order, and only these:

1. `docs/PROGRESS.md`
2. `docs/DECISIONS.md`: has anything blocking been answered since?
3. `CLAUDE.md`
4. The sprint and phase for the current step in `docs/spec/08-Implementation-Plan.md` and `03-Delivery-Phases.md`, and the parts of `docs/spec/` it names
5. `docs/ui-registry.md`, if the step involves UI
6. `docs/DEFERRED.md`, if the step touches something previously deferred

Do not scan the codebase. The state file exists so that is unnecessary.

### Step 2 — Confirm before doing anything

```
Restored. Here is where we are:

**Phase:** [n] — [name]
**Sprint:** S[n] ([dates]) — [goal]
**Current step:** [step]
**Last session:** [date] — [what was built]
**Blocked:** [any step and its decision, or "nothing"]
**Newly answered since last session:** [any D-number now ANSWERED, or "none"]
**Next up:** [the first thing to do]

Correct? Say yes to continue, or fix anything that looks wrong.
```

**Do not start building.** Do not assume the intent is to continue immediately. Confirm first.

### Step 3 — Check for a blocked start

If the current step is blocked and the decision is still `UNANSWERED`, say so before anything else:

```
[Step] is still blocked on D[n]: [question].
docs/DECISIONS.md says to ask [who].

Nothing can be built on this step until that is answered.
Do you want to take a different step, or chase the decision?
```

### If the state is unclear

```
docs/PROGRESS.md exists but [what is missing or ambiguous].

Continue with what we have, or fill the gap first?
```

Do not guess. Surface the gap and let Sami decide.

---

## The rule

Every session ends with `/remember save`. Every session starts with `/remember restore`.

`docs/PROGRESS.md` is the only state that survives. A state file that is sometimes accurate is worse than none, because it is trusted.
