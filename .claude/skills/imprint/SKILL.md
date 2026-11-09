---
name: imprint
description: After building any manpower system screen, extract the visual patterns that matter for consistency and save them to docs/ui-registry.md — including the status, money, personal-data and right-to-left rules an office system that pays 700 people cannot get wrong.
---

UI consistency does not happen by accident. It happens because every screen is built knowing what already exists.

The failure mode is well known: each screen built in isolation by someone who did not know what was already there. Spacing drifts, colours vary, radius is inconsistent, and eventually nobody can tell which of five card components is the real one.

Run this after building any screen. It reads what was built, extracts the patterns, and saves them so the next screen matches. The target system is set by `docs/spec/09-Design-Brief.md` (shadcn/ui on Tailwind v4, Radix primitives, tokens as CSS variables, a short approved Aceternity list); the registry records how screens actually apply it.

## Why this matters more here

A slightly inconsistent screen in most apps is untidy. Here, an office worker clearing 700 payslips, a renewal board or a 30-person daily sheet reads status, money and dates all day; a badge that means one thing on one screen and another elsewhere is where a blocked worker gets deployed or a salary is released wrong.

Three rules apply on top of ordinary consistency, and all three must be captured every time:

> **Colour is never the only signal.** Expired, due, blocked, incomplete, locked, released, paid — each carries a colour *and* an icon and a word (the Badge status system in the Design Brief). Roughly one man in twelve cannot tell red from green, and the workforce and the office are mostly men.

> **Money and dates are presented one way.** OMR with three decimals, right-aligned, tabular figures; calendar dates in one format; a confirm button that writes out the amount or count ("Release 684 salaries (OMR 214,350.500)").

> **Ready for Arabic.** Arabic is not in Version 1, but layouts must use logical properties (`ms-`, `pe-`, `start-`), and names are stored in Latin and Arabic script. Numbers, codes and IBANs stay left-to-right inside Arabic text. A screen built with left/right is a screen rebuilt later.

## How to invoke

```
/imprint                  after building a screen
/imprint [filepath]       target a specific file
/imprint audit            scan the whole frontend for drift
```

Run `audit` first on any codebase where `docs/ui-registry.md` has no component entries yet.

---

## Step 1 — Find what was just built

If a path was given, read it. Otherwise identify recently created or modified files under `apps/web/src/` and `packages/ui/`.

Read the code, then **look at the result**: with the web app running (`bun run dev:web`), use the **playwright** MCP server to open the screen, take a snapshot at desktop and phone widths, and check what the code cannot show (truncation, row height, focus rings, badge legibility). Use the **shadcn** MCP server to compare against the registry version of any component that was customised.

If it is unclear:

```
Which screen should I capture from?
```

## Step 2 — Extract what matters

**Capture:**

- Background — page, card, panel, sheet
- Border — token, width
- Border radius
- Text colours — primary, secondary, muted
- Text sizes and weights — heading, body, label, caption
- Spacing — padding inside the component, gap between elements
- Interactive states — hover, focus, active, disabled
- Shadow
- Accent and brand colour use
- Which shadcn component (and variant) it is built from

**Also capture, for this project specifically:**

| Property | Why |
|---|---|
| **Office density** | Row height (36 px compact / 44 px comfortable), rows visible at 1366×768, line height, touch target (44 px; 48 px in the Version 2 supervisor app) |
| **Status signals** | The Badge variant, colour token, icon and word for every status shown |
| **Money and numbers** | Alignment, tabular figures, three decimals, how a negative or flagged value is shown |
| **Personal data** | How passport, civil ID and bank numbers are masked, and what the reveal control looks like |
| **Blocks and reasons** | How a refused action shows why and links to the fix (never a grey button with no reason) |
| **Destructive and final actions** | How payroll release, override, absconding report, write-off, exit settlement and reversal are separated from ordinary actions (AlertDialog with amount or count) |
| **Logical properties** | Whether spacing and alignment use start/end, not left/right |
| **Print styles** | Payslips, daily attendance sheets, timesheet packs, ID cards, invoices, settlement statements carry their own rules (A4, solid, no motion) |
| **Motion** | Any Aceternity piece used, and whether it is on the approved list and respects `prefers-reduced-motion` |

**Do not capture:** width, height, flex and grid structure, positioning, animation timing, responsive variants. Context-dependent, not consistency rules.

## Step 3 — Write to `docs/ui-registry.md`

Append. Do not overwrite. If an entry for this component type exists, update it.

```markdown
### [Component name]

File: [path]
Module: [workforce / compliance / commercial / operations / time / payroll / billing / finance / insight / admin]
Built from: [shadcn component + variant]
Last updated: [date]

| Property         | Class / token |
| ---------------- | ------------- |
| Background       |               |
| Border           |               |
| Border radius    |               |
| Text — primary   |               |
| Text — secondary |               |
| Text — muted     |               |
| Spacing          |               |
| Hover            |               |
| Focus            |               |
| Disabled         |               |
| Shadow           |               |
| Accent           |               |

**Office properties**

| Property           | Value |
| ------------------ | ----- |
| Row density        |       |
| Line height        |       |
| Status signal      | [colour token + icon + word] |
| Money / numbers    |       |
| Personal data      |       |
| Logical properties | yes / no |
| Print              |       |

**Pattern notes:**
[Why a class was chosen, what this must always match, what variation is allowed,
 anything a future screen of this type must not do differently]
```

## Step 4 — Confirm

```
Imprinted [name] → docs/ui-registry.md

Captured:
- Built from: [shadcn component]
- Background: [class]
- Border / radius: [classes]
- Text: [classes]
- Spacing: [classes]
- Density: [value]
- Status signal: [colour + icon + word]

Any future [component type] should match these.
```

**Flag anything that looked wrong:**

```
Note: [what looked inconsistent, or what is missing]
```

**Always flag these four:**

- A status carried by colour alone → **flag as a defect, not a note**
- A hard-coded hex or raw colour class bypassing the tokens
- Money not right-aligned with tabular figures and three decimals
- Physical `left`/`right` spacing or alignment where a logical property belongs

---

## Audit mode — `/imprint audit`

Scan every file under `apps/web/src/` and `packages/ui/`. Build a picture of what is actually in use.

```
## UI consistency audit

### Conflicts
**Border radius** — [every variant found, and where]
Recommendation: [which to standardise on, why — the Design Brief value wins]
**Backgrounds** — [every background; flag hard-coded hex]
**Text colours** — [every variant; flag anything bypassing tokens]
**Spacing** — [padding and gap variants]
**Border colours**
**Interactive states**
**Typography** — [font families and sizes against the Design Brief]

### Office conflicts
**Density** — [row heights and line heights in use]
**Status signals** — [every colour-coded element, and whether it carries an icon and a word]
**Money** — [every money display and its alignment, figures and decimals]
**Right-to-left readiness** — [every physical left/right property]
**Status badges** — [every rendering of a worker, document, timesheet, payroll or invoice status]

### Hard-coded values
[Every hex, raw colour class or non-token value, with file and line]

### Colour-only signals ⚠
[Every place where meaning is carried by colour alone. These are defects, not style issues.]

### Recommended baseline
[The correct pattern per property — from the Design Brief]
```

**Present and stop.** Do not fix. Do not write the registry yet.

```
Audit complete. [X] conflicts across [Y] properties.
[Z] colour-only signals found.

Before I write the baseline:
1. Do the recommendations look right?
2. Any conflict you want resolved differently?
3. The colour-only signals — shall I list them as defects for the fix queue?

Confirm and I will write docs/ui-registry.md.
```

After confirmation, write the baseline, then the fix list:

```
## Screens to fix
- [file] — [what is wrong] → [what it should be]
```

---

## The rule

Build a screen. Run `/imprint`. Move on.

A registry with ten entries is useful. Thirty is powerful. One that is sometimes updated is unreliable, and unreliable is worse than absent, because it gets trusted.
