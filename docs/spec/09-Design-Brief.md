# Design Brief

This brief sets how the system looks and behaves on every screen: in Version 1 the desktop app, the web app and the owner's phone view; in Version 2 the supervisor app, client portal and worker app. The interface is built from **shadcn/ui** components on Tailwind v4, with a small, approved set of **Aceternity UI** pieces for a few moments that deserve polish.

Version 1 serves office staff who spend all day in it, an owner who checks it between meetings, and the system admin. Version 2 adds supervisors on dusty sites with one hand free, client site managers who open it a few times a month, and workers on shared phones. The design serves them in that order: speed and clarity first, polish where it does not slow anyone down.

## Principles

1. **Dense but calm.** Office screens show a lot (a 700-row worker list) without feeling crowded: tight rows, quiet borders, one accent colour.
2. **Status at a glance.** Every worker, document, timesheet, payroll run and invoice shows its state as the same badge everywhere.
3. **Keyboard first on desktop.** Every common action has a shortcut; Ctrl+K reaches any worker, site or command.
4. **Explain every block.** When the system refuses something (a worker cannot be assigned), it says why and what fixes it.
5. **Nothing irreversible by accident.** Money and legal actions need a confirm with the amount or count written out.
6. **Motion only with meaning.** Animation shows a change of state or draws the eye once; it never decorates a working screen.
7. **Ready for Arabic.** Layouts use logical properties so right-to-left works when Arabic is turned on later.

## shadcn/ui component map

Components are copied into `packages/ui` with the shadcn CLI, so the team owns the code. Radix primitives are used (not the newer Base UI default) for maturity; this is reviewed each quarter.

| Need | shadcn component | Notes |
|---|---|---|
| App frame | `Sidebar`, `SidebarInset`, `Breadcrumb` | Collapsible to icons at 1366 px |
| Lists of records | `Table` + TanStack Table, `DataTable` pattern | Sticky header, column chooser, saved views, virtual rows |
| Record detail | `Sheet` (quick view), `Tabs`, full page | Sheet keeps the list in place |
| Forms | `Form`, `Input`, `Select`, `Combobox`, `DatePicker`, `Textarea` | Zod schemas shared with the API |
| Status | `Badge` with status variants | See the status system |
| Search and commands | `Command` | Ctrl+K |
| Confirm money or legal actions | `AlertDialog` | Shows amount or count |
| Feedback | `Sonner` toasts, `Alert` | Errors from problem+json |
| Progress of jobs | `Progress`, `Skeleton` | Payroll calculation, bulk print |
| Numbers | `Card`, `Chart` (Recharts) | Owner and module dashboards |
| Filters | `Popover`, `Checkbox`, `ToggleGroup` | Chips above tables |
| Help | `Tooltip`, `HoverCard` | Never hide required information in a tooltip |
| Calendar views | `Calendar` | Roster and leave |

## Aceternity UI: where it is allowed

Aceternity components are installed from its shadcn registry (`@aceternity`) and need `motion`. They are built for marketing pages, so they are used sparingly and only from this list. Check the licence for each component before adding it; Pro components need a paid licence.

| Allowed | Where | Why |
|---|---|---|
| Number Ticker / animated counter | Owner dashboard headline numbers | Draws the eye to change once on load |
| Background Beams or Grid background | Sign-in screen only | First impression, no working content |
| Spotlight / Card hover effect | Client portal home tiles (Version 2) | Few visits, small number of tiles |
| Animated Tooltip (avatars) | Assignment team stack on site page | Shows who is on site compactly |
| Timeline | Worker history tab | Clear sequence of events |
| Multi-step loader | Payroll calculate and WPS generate | Shows real job steps from the job API |

**Never use Aceternity** on data tables, forms, payroll or invoice screens, the supervisor attendance flow, or anything that animates continuously. All motion respects `prefers-reduced-motion` and is off in the desktop app's "performance mode".

## Design tokens

Tokens are CSS variables in `packages/ui/styles/tokens.css`, mapped into Tailwind v4 with `@theme inline`, following shadcn's naming so every component picks them up.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `oklch(0.99 0.003 250)` | `oklch(0.17 0.01 250)` | Page |
| `--foreground` | `oklch(0.22 0.02 255)` | `oklch(0.95 0.005 250)` | Text |
| `--card` | `oklch(1 0 0)` | `oklch(0.21 0.012 250)` | Panels |
| `--muted` | `oklch(0.96 0.005 250)` | `oklch(0.26 0.012 250)` | Table stripes, inputs |
| `--muted-foreground` | `oklch(0.50 0.015 255)` | `oklch(0.70 0.01 250)` | Secondary text |
| `--primary` | `oklch(0.45 0.12 250)` (deep blue) | `oklch(0.70 0.12 250)` | Main actions, focus |
| `--accent` | `oklch(0.72 0.15 65)` (site amber) | `oklch(0.78 0.14 65)` | Highlights, sparingly |
| `--border` | `oklch(0.91 0.006 250)` | `oklch(0.30 0.012 250)` | Lines |
| `--ring` | same as primary | same as primary | Focus outline |
| `--success` | `oklch(0.55 0.13 150)` | `oklch(0.70 0.14 150)` | ok |
| `--warning` | `oklch(0.70 0.15 75)` | `oklch(0.78 0.14 75)` | due |
| `--destructive` | `oklch(0.55 0.20 27)` | `oklch(0.68 0.19 25)` | expired, blocked |
| `--radius` | `0.5rem` |  | Corners |

**Type:** Inter for interface text with tabular figures for every number column; IBM Plex Sans Arabic reserved for Arabic. Sizes 12/13/14/16/20/24/30; body 14 on desktop, 16 on mobile. **Spacing:** 4 px grid; table rows 36 px (compact) or 44 px (comfortable). All text pairs meet WCAG AA contrast.

## Status system

One `Badge` with a `status` variant replaces the first slice's scaffold tags. Colour is never the only signal: every badge has an icon and a word.

| Status | Colour token | Icon | Used for |
|---|---|---|---|
| ok | `--success` | check | Compliant worker, verified document, paid invoice |
| due | `--warning` | clock | Document expiring within 30 days, timesheet awaiting approval |
| expired | `--destructive` | alert | Expired document, overdue invoice |
| blocked | `--destructive` outline | ban | Worker cannot be assigned, absconding |
| incomplete | `--muted-foreground` | dashed circle | Missing documents or data |
| draft / locked / released | neutral / primary / success | pencil / lock / send | Timesheets and payroll runs |

The badge text comes from the API, so the same word appears on every screen and in reports.

## Layouts

- **Office app shell:** left sidebar (Dashboard, Workers, Compliance, Clients, Roster, Timesheets, Payroll, Billing, Finance, Reports, Settings), top bar with breadcrumb, Ctrl+K search, notifications and user menu. Content area is a list with a filter bar, opening a sheet on the right for the selected record.
- **List screens:** title and primary action top-right; saved views as tabs; filter chips; table; bulk actions bar appears when rows are selected (print, export, assign).
- **Detail pages:** header with name, code, status badge and key actions; tabs (Overview, Documents, Assignments, Time, Pay, History).
- **Dashboards:** row of four number cards, then two charts, then "needs attention" lists that link straight to the fix.
- **Attendance entry (Version 1):** a spreadsheet-like grid pre-filled with the site's rostered crew, with the sheet photo docked beside it and zoomable; single keys for absent (A), sick (S) and late (L), a number for overtime hours; Enter moves down the column; rows that differ from the roster are highlighted; one key saves and opens the next site.
- **Supervisor app (Version 2):** one task per screen, bottom tab bar (Today, Crew, Issues), large tap targets (48 px), a sync status pill always visible.
- **Owner phone view (the web app in Version 1, the mobile app in Version 2):** a single scrolling page of cards: cash, margin, headcount deployed, compliance risk, pending approvals.
- **Client portal (Version 2):** top navigation (Sites, Timesheets, Invoices, Requests); simple tables; approval buttons in place.

## Desktop, mobile and web differences

| Area | Desktop (Tauri) | Web | Mobile app (Capacitor), Version 2 |
|---|---|---|---|
| Printing | Silent bulk printing, printer picker remembered | Browser print dialog | Not offered |
| Window | Native title bar, multiple windows (e.g. two workers side by side) | One tab | Full screen |
| Offline | Read cache of recent records | None | Full offline attendance capture |
| Input | Keyboard shortcuts, scanner input | Keyboard | Camera for documents and photos, GPS |
| Updates | Auto-update with release notes | Always latest | Store updates; forced upgrade below minimum version |
| Density | Compact by default | Comfortable by default | Comfortable only |

The same React components run in all three; platform differences live in small adapters, not separate screens.

## Accessibility and right-to-left

- WCAG 2.2 AA: contrast, visible focus ring, full keyboard use, labelled controls, error text linked to fields. axe runs in component and end-to-end tests.
- Touch targets at least 44 px (48 px in the supervisor app); works with gloves and in bright sun (high-contrast mode).
- `prefers-reduced-motion` turns off all Aceternity motion.
- shadcn is set with `rtl: true` from day one; all spacing uses logical utilities (`ms-`, `pe-`, `start-`) so Arabic can be switched on later without rebuilding screens. Numbers, codes and IBANs stay left-to-right inside Arabic text.

## Do and don't

| Do | Don't |
|---|---|
| Right-align money and use tabular figures with three decimals | Round baisa away or mix decimal places |
| Say why an action is blocked and link to the fix | Grey out a button with no explanation |
| Keep the list visible when opening a record | Navigate away and lose filters |
| Write confirm buttons as the action: "Release 684 salaries (OMR 214,350.500)" | Use "OK" or "Yes" |
| Mask passport, civil ID and bank numbers by default | Show full numbers in lists or screenshots |
| Use Aceternity only from the allowed list | Add animated backgrounds to working screens |
| Use real-looking fictional data in designs | Use real worker names or documents |

## Sources

- [shadcn/ui documentation](https://ui.shadcn.com/docs) and [changelog](https://ui.shadcn.com/docs/changelog), including RTL support and Tailwind v4
- [shadcn/ui RTL guide](https://ui.shadcn.com/docs/rtl)
- [Aceternity UI](https://ui.aceternity.com/) and its [CLI / registry install docs](https://ui.aceternity.com/docs/cli)
- [Aceternity UI licence](https://ui.aceternity.com/licence)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
