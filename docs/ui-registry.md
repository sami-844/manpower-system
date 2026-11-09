# UI registry

> How screens actually apply the design system, so the next screen matches. Written by `/imprint` after every screen; never edited by hand without updating the entry's date. The target system is `docs/spec/09-Design-Brief.md`. If an entry and the Design Brief disagree, the Design Brief wins and the entry is a defect to fix.

## Baseline (from the Design Brief — decided, not inferred)

| Property | Rule |
|---|---|
| Components | shadcn/ui copied into `packages/ui` (Radix primitives); Aceternity only from the approved list (D11 before first use) |
| Tokens | CSS variables in `packages/ui/styles/tokens.css`, mapped into Tailwind v4 with `@theme inline`, shadcn naming. No hex outside the token file |
| Radius | `--radius: 0.5rem` |
| Type | Inter, tabular figures for every number column; sizes 12/13/14/16/20/24/30; body 14 desktop, 16 mobile |
| Spacing | 4 px grid; table rows 36 px compact (desktop default) or 44 px comfortable (web default) |
| Primary | `--primary` deep blue, `oklch(0.45 0.12 250)` light / `oklch(0.70 0.12 250)` dark |
| Accent | `--accent` site amber, sparingly |
| Status | One `Badge` with a `status` variant: **ok** (`--success`, check), **due** (`--warning`, clock), **expired** (`--destructive`, alert), **blocked** (`--destructive` outline, ban), **incomplete** (`--muted-foreground`, dashed circle), **draft / locked / released** (neutral / primary / success; pencil / lock / send). Always icon + word; the word comes from the API |
| Money | Right-aligned, tabular figures, OMR with three decimals |
| Confirm | `AlertDialog`; the button names the action and the amount or count |
| Blocked action | Says why and links to the fix; never a grey button with no reason |
| Personal data | Passport, civil ID, bank numbers masked to the last 4; reveal needs `pii.view` and is audited |
| Direction | Logical properties only (`ms-`, `pe-`, `start-`); `rtl: true` in `components.json` |
| Motion | Only with meaning; off with `prefers-reduced-motion` and in desktop performance mode |
| Print | A4, solid, no motion: payslips, daily sheets, timesheet packs, ID cards, invoices, settlement statements |

## Components

Built 2026-11-09 for the Version 1 demo foundation (see DECISIONS A16–A18).

| Component | File | How it applies the brief |
|---|---|---|
| Tokens | `apps/web/src/styles.css` | Every brief value copied (light and dark), shadcn names, `@theme inline`; Inter variable; radius 0.5rem; reduced-motion and A4 print rules |
| App shell | `components/app-shell.tsx`, `app-sidebar.tsx`, `site-header.tsx`, `nav-user.tsx` | shadcn dashboard-01 block adapted: `Sidebar` (collapsible to icons) + `SidebarInset`, breadcrumb, Ctrl+K, notifications; sidebar groups filtered by role |
| Command palette (S-03) | `components/command-menu.tsx` | `Command` dialog: screens, live worker search, clients, sites, actions |
| Status badge | `components/status-badge.tsx` | One badge, tones ok / due / expired / blocked (outline) / incomplete (dashed) / draft / locked / released; always icon + word; keeps the `tag` class for the first-slice e2e |
| Data table | `components/data-table.tsx` | TanStack Table v9; sticky header, sort, paging, selection + bulk bar, skeleton rows, empty state, `/` filter, J/K/Enter |
| Money | `components/money.tsx` | `@mms/core` formatting (decimal.js), right-aligned, tabular, 3 decimals |
| Confirm | `components/confirm-dialog.tsx` | `AlertDialog`, button names the action and amount, optional type-to-confirm |
| Page header, KPI card | `components/page-header.tsx`, `kpi-card.tsx` | Title + actions top-right; "Sample data" badge for demo-layer screens (the same badge, labelled "Hosted demo", sits in the header of the Cloudflare build); number cards link to the names behind them |
| Aceternity | `components/aceternity/*` | Approved list only: background beams (S-01), multi-step loader (payroll calculate, WPS generate), number ticker (S-32, in-house on `motion`). Colours mapped to tokens; `MotionConfig reducedMotion="user"` app-wide. Timeline and Animated Tooltip were tried and removed: both hard-code palette colours and photo avatars, so worker history (S-06) and the site crew stack (S-13) use token-based equivalents |

**Deviation to confirm:** shadcn uses `--accent` for every hover/selected surface. Putting the brief's site amber there would turn every menu hover amber, against "one accent colour, sparingly". The amber lives in `--highlight` (same values as the brief's `--accent`), and `--accent` is a quiet blue-grey. Change the brief or this file, whichever the reviewer prefers.

## First audit — 2026-11-09 (`/imprint audit` on the first slice, `apps/web/src`)

The slice predates the Design Brief and uses its own CSS (`apps/web/src/styles.css`, 548 lines). Findings, for the S2 migration:

| Property | Found | Baseline |
|---|---|---|
| Radius | `--radius: 4px`; `50%` for the tag hole | `0.5rem` |
| Font | Atkinson Hyperlegible Next | Inter (tabular figures already used, line 44) |
| Tokens | Own names (`--paper`, `--ink`, `--action`, `--tag-*`) | shadcn names |
| Hard-coded colours outside the token block | 6: `styles.css` lines 131, 182, 208, 273, 315, 374 | none |
| Spacing | Ad hoc rem values (0.35, 0.45, 0.6, 0.85, 1.1 …) | 4 px grid |
| Physical left/right properties | 10 | 0 (logical properties) |
| Print styles | none | payslip and sheet print styles from S9 |
| Status | `Tag` with tones green / yellow / red / none, a word and a hole marker (`components/Tag.tsx`) | `Badge` status variants with icon + word |

**Colour-only signals: 0.** Every `Tag` carries a word ("Expired", "Renewal due", "Cannot be deployed"). One mismatch to fix: "Cannot be deployed" uses the red tone; the baseline gives *blocked* its own outline style and ban icon, distinct from *expired*.

**Screens to fix in S2** (confirmed against the Design Brief, which is authoritative):

- `apps/web/src/styles.css` — custom layout, tokens and 6 hard-coded colours → shadcn `Sidebar`/`SidebarInset`, Tailwind utilities, Design Brief tokens
- `apps/web/src/components/Tag.tsx` — tones → `Badge` status variants (ok, due, expired, blocked, incomplete) with icons
- `apps/web/src/pages/Workers.tsx`, `Renewals.tsx`, `Today.tsx` — hand-made tables → `Table` + TanStack Table
- `apps/web/src/pages/WorkerFile.tsx` — page → `Sheet` from the list with `Tabs`, full page on deep link; eligibility result as *ok* / *blocked* badge
- All screens — 10 physical left/right properties → logical properties
