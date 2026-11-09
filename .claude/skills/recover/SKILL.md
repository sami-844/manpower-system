---
name: recover
description: When something goes wrong during the manpower system build, diagnose what type of failure it is before deciding how to respond. Targeted fix, hard reset, rethink, or a defect in the specification itself — the right response depends on the right diagnosis.
---

Not every problem is a bug. Not every bug needs debugging.

The instinct when something breaks is to keep prompting: describe the problem, get a fix, get a new problem, describe that, get another fix. The session gets longer, the context gets polluted, the code gets worse. The problem is usually not the code. It is not knowing what kind of failure you are looking at.

Diagnose first. Then respond. Those are two steps and they cannot be swapped.

## Step 1 — Describe what went wrong

```
Describe what is wrong. Be specific:
- What did you expect to happen?
- What happened instead?
- How many times have you tried to fix it already?
- Which sprint and step of docs/PROGRESS.md were you on?
```

The number of fix attempts matters. It is the difference between a fresh bug and a session that has already gone wrong.

## Step 2 — Identify the failure mode

### Mode 1 — A specific thing is broken
**Signs:** isolated to one function, endpoint or screen. Everything else works. First or second attempt. The error is clear.
**Response:** targeted fix — Step 3A.

### Mode 2 — The session has gone wrong
**Signs:** several attempts have made it worse. Fixes are patching fixes. It is no longer clear what the original problem was. The context is full of failed attempts.
**Response:** hard reset — Step 3B.

### Mode 3 — The foundation is wrong
**Signs:** the code runs and does the wrong thing. The implementation misunderstands a requirement, an API or a pattern. Fixing pieces will not help because the approach is wrong.
**Response:** rethink — Step 3C.

### Mode 4 — The specification is wrong
**Signs:** the code matches `docs/spec/` exactly and the result is still wrong, unlawful or impossible. Two documents contradict each other. Or following the specification would create a security, data-protection, legal-pay or WPS problem.

**This mode exists because the specification is authoritative — so when it is wrong, everything built from it is wrong, and no amount of fixing the code will help.**
**Response:** escalate — Step 3D.

---

Say which mode this is before doing anything else:

```
This looks like Mode [1/2/3/4] — [name].

[One sentence on why.]

Here is how we handle it:
```

---

## Step 3A — Targeted fix

**Diagnose before touching code.** Ask for the exact error, the file, and what the code was supposed to do. Read only what is relevant.

Gather evidence with tools, not guesses: the **postgres** MCP server (read-only) for the actual rows, constraints, triggers and RLS policies; the **playwright** MCP server to reproduce a screen fault and read console and network errors; **context7** for the library's current behaviour; the **github** MCP server for the failing CI log once the repository exists. Reproduce the failure in a test before fixing it (Karpathy: "write a test that reproduces it, then make it pass").

**Find the root cause and state it:**

```
Root cause: [why this is actually happening]

This is different from the symptom because: [explanation]
```

**Check the usual suspects for this stack first:**

| Symptom | Look at |
|---|---|
| A `bun:test` hangs forever on a database error test | A postgres.js query passed straight to `expect().rejects`. Queries are lazy; wrap it: `expect((async () => sql\`...\`)()).rejects` |
| NestJS fails at startup on Bun ("cannot resolve dependencies") | `apps/api/tsconfig.json` was given an `extends`; Bun then ignores `experimentalDecorators`. Keep it self-contained |
| Playwright "browser not found" after an update | `@playwright/test` not pinned to the exact installed version |
| Duplicate worker code or invoice number under load | `MAX()+1` or count-then-insert instead of the sequence |
| Works alone, fails when two people do it | No database-level guard: row lock, conditional UPDATE, unique or exclusion constraint |
| An endpoint returns no rows for a user who should see them | Row scope, not permission: RLS session variables (`app.entity_id`, `app.site_ids`, `app.client_id`) not set for the request |
| Money off by a baisa | A JavaScript `number` somewhere instead of `decimal.js`, or rounding not from the rule table |
| Document "expires" a day early or late | A timestamp used where a calendar date (`YYYY-MM-DD`, Oman time) belongs, or "today" not taken from the injected clock |
| A migration will not apply, or the gate says a migration changed | An applied migration was edited. Never edit; add a new numbered file |
| The audit chain check reports broken | Something wrote to `audit_events` outside the service, or the trigger was disabled |
| A golden test "fixed" by changing the expected value | Stop. That is a sign-off violation, not a fix (see CLAUDE.md) |
| Compliance passes in one screen and fails in another | `checkEligibility()` re-implemented somewhere instead of called |
| Bulk print shows a dialog | The Tauri print path was bypassed for `window.print()`, or the printer driver changed (see the S1 print proof) |
| Approval goes through with one person | Maker ≠ checker not enforced on that path |

**Then propose one fix:**

```
Fix: [what changes and why]
This resolves the root cause because: [explanation]
Test that will prove it: [the failing test written first]
```

Wait for confirmation before changing anything.

**If the fix does not work — stop.** Do not immediately try another. If the fix failed, the diagnosis was probably wrong. Diagnose again from the beginning.

**If two diagnoses have both been wrong, this is Mode 2 or Mode 3.** Re-evaluate.

## Step 3B — Hard reset

```
This session has gone too far in the wrong direction to recover
by patching. A clean start is the correct response to a polluted
context, not a failure.
```

**Before ending, extract what is worth keeping:**

```
## Reset note — [sprint and step]

### What we were building
[From the specification]

### What went wrong
[Honest summary of how it went off track]

### What to avoid next time
[Specific approaches that did not work]

### Starting point for next session
[What to keep, what to discard (git stash / branch name), which file to open first]
```

**Write this into `docs/PROGRESS.md` under Notes**, not into a loose file. `PROGRESS.md` is the only state that survives between sessions; a reset note anywhere else will not be read.

Then:

```
Next steps:
1. The reset note is in docs/PROGRESS.md under Notes
2. End this session completely
3. Start fresh and run /remember restore
4. Re-approach [step] with the reset note as context

Do not continue in this session.
```

## Step 3C — Rethink

**Name the wrong assumption:**

```
This is not a bug. Something was assumed that should not have been.

Assumed: [what]
Actually true: [what]

The current implementation cannot be patched into correctness.
```

**Then:**

```
Correct approach: [description]
Key difference: [explanation]
What must be discarded: [what cannot be salvaged]
What can be kept: [what is still valid]
```

**Check whether the assumption came from the specification or from the implementation.** If `docs/spec/` says the thing that turned out to be wrong, this is Mode 4, not Mode 3.

Present and wait. No rebuilding until Sami confirms the diagnosis.

## Step 3D — Escalate a specification defect

The specification wins over judgement, **except** where following it would create a security, data-protection, legal-pay or WPS problem. This is that exception, and it is the only one.

**State it precisely:**

```
The specification appears to be wrong here, not the code.

Document: [docs/spec/..., section]
It says: [quote or close paraphrase]
The problem: [why this cannot be right — contradiction, impossibility,
              or a legal, pay or data-protection consequence]
Evidence: [a failing test, a conflicting section, a constraint that cannot hold,
           a law or bank specification]

I have not written code against this and I am not going to
until it is resolved.
```

**Then classify it:**

| Kind | Where it goes |
|---|---|
| Two sections contradict | Fix the specification (the live shared document first, then `docs/spec/`). Record the fix in `docs/PROGRESS.md` under Notes. |
| The specification assumes something untrue about the company | A decision, not a defect. Add it to `docs/DECISIONS.md` as UNANSWERED and mark the step BLOCKED. |
| Following it would be unlawful or unsafe for pay or data | **Stop the step. Say so directly.** This is the one case that overrides the specification, and it needs Sami's explicit sign-off on the alternative before anything is built. |
| It is silent, not wrong | Not Mode 4. That is a normal `/architect` question. |

**Do not quietly work around a specification defect.** A document that is wrong and has code built around it becomes wrong permanently, because the next person reads the document and trusts it.

## The principle

The worst thing to do when something is broken is to keep doing the same thing faster. Different failures need different responses, and knowing which one you have is more than half the fix.
