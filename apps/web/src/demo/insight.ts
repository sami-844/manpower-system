/**
 * DEMO DATA — owner dashboard money figures (S-32), the approvals inbox (S-33), the report
 * catalogue (S-34) and the role work queues on Today (S-02). Fictional and deterministic; see
 * ./core.ts. Headcount, deployment, compliance and renewal numbers are NOT here: screens read
 * them from the real API (`/api/dashboard/summary`, `/api/compliance/renewals`, `/api/workers`).
 *
 * The shared demo story: October 2026 payroll was released on 1 Nov; the owner's inbox holds a new client contract;
 * Wadi Infrastructure Co. is over its credit limit (OMR 27,410.250 vs 25,000.000); the inbox
 * holds exactly `pendingApprovalsCount` items.
 */
import { formatOmr, omr } from "@mms/core";
import type { DashboardSummary } from "@/lib/api";
import { DEMO_ACCOUNTS, ROLE_LABELS, type Role } from "@/lib/roles";
import type { StatusTone } from "@/components/status-badge";
import { delay, money } from "./core";
import { CLIENTS } from "./reference";
import { basicWage } from "./workforce";
import { pendingApprovalsCount } from "./notifications";

/** Percentage of a over b with one decimal, computed in decimal.js ("30.8"). */
export const pct = (a: string, b: string): string => (omr(b).isZero() ? "0.0" : omr(a).div(omr(b)).times(100).toFixed(1));

// ── Owner dashboard (PRD 4.16) ──────────────────────────────────────────────

/** Last closed month: invoiced from locked hours, payroll calculated. */
export const PERIOD_LABEL = "October 2026";

/** Revenue invoiced vs payroll cost, last six months. July and August dip with the midday work ban. */
export const MONTHLY: { month: string; label: string; revenue: string; payrollCost: string }[] = [
  { month: "2026-05", label: "May", revenue: "171240.000", payrollCost: "121880.500" },
  { month: "2026-06", label: "Jun", revenue: "168905.250", payrollCost: "120410.000" },
  { month: "2026-07", label: "Jul", revenue: "159330.750", payrollCost: "118760.250" },
  { month: "2026-08", label: "Aug", revenue: "162118.000", payrollCost: "119240.750" },
  { month: "2026-09", label: "Sep", revenue: "181472.500", payrollCost: "127915.000" },
  { month: "2026-10", label: "Oct", revenue: "189640.500", payrollCost: "131286.750" },
];

/** October revenue and direct cost (wages, camp, transport) by client. Sums to the October revenue. */
const CLIENT_MONTH: { clientId: string; revenue: string; directCost: string }[] = [
  { clientId: "cl-01", revenue: "78420.500", directCost: "53325.940" },
  { clientId: "cl-02", revenue: "41236.000", directCost: "29277.560" },
  { clientId: "cl-03", revenue: "30118.250", directCost: "20781.590" },
  { clientId: "cl-04", revenue: "22904.750", directCost: "16949.520" },
  { clientId: "cl-05", revenue: "13560.000", directCost: "11255.000" },
  { clientId: "cl-06", revenue: "3401.000", directCost: "2312.680" },
];

export interface ClientMargin {
  clientId: string;
  name: string;
  revenue: string;
  directCost: string;
  margin: string;
  marginPct: string;
}

export const CLIENT_MARGINS: ClientMargin[] = CLIENT_MONTH.map((c) => {
  const margin = money.minus(c.revenue, c.directCost);
  return { ...c, name: CLIENTS.find((x) => x.id === c.clientId)?.legalName ?? c.clientId, margin, marginPct: pct(margin, c.revenue) };
});

export const CREDIT_WATCH: { clientId: string; name: string; outstanding: string; limit: string; over: boolean }[] = [
  { clientId: "cl-05", name: "Wadi Infrastructure Co.", outstanding: "27410.250", limit: "25000.000", over: true },
  { clientId: "cl-02", name: "Al Noor Contracting", outstanding: "40122.750", limit: "45000.000", over: false },
];

export const OWNER_FINANCE = {
  revenue: MONTHLY[5]!.revenue,
  revenuePrev: MONTHLY[4]!.revenue,
  grossMargin: money.sum(CLIENT_MARGINS.map((c) => c.margin)),
  cash: { dueThisMonth: "172380.000", collected: "96415.750", overdue: "41206.500", overdueInvoices: 9 },
  payroll: {
    period: "November 2026",
    payslips: 622,
    net: "128900.000",
    salaryAccountBalance: "148900.000",
    financeApprovedAt: "2026-11-09T06:42:00Z",
  },
};
export const fetchOwnerFinance = () => delay(OWNER_FINANCE, 350);

// ── Approvals inbox (S-33, CLAUDE.md rule 6: maker ≠ checker) ─────────────────

export type ApprovalKind = "payroll" | "contract" | "rate_card" | "wage" | "override" | "write_off";
export const APPROVAL_KIND_LABELS: Record<ApprovalKind, string> = {
  payroll: "Payroll release",
  contract: "New contract",
  rate_card: "Rate card",
  wage: "Wage change",
  override: "Compliance override",
  write_off: "Invoice write-off",
};

export interface Approval {
  id: string;
  kind: ApprovalKind;
  title: string;
  /** Username of the maker. The checker must be someone else. */
  requestedBy: string;
  requestedAt: string; // ISO
  /** OMR amount the approver sees in the confirm, if money is involved. */
  amount?: string;
  amountLabel?: string;
  count?: { value: number; noun: string };
  summary: string;
  changes: { label: string; before: string; after: string }[];
  /** Route that opens the subject; `workerCode` resolves to the real worker file on screen. */
  to: string;
  workerCode?: string;
  step?: string;
  decision?: { outcome: "approved" | "rejected"; by: string; at: string; reason?: string };
}

const wageBefore = basicWage({ code: "W-000381", trade: "Welder" });
const wageAfter = money.sum([wageBefore, "20.000"]);

const approvals: Approval[] = [
  {
    id: "ap-1",
    kind: "contract",
    title: "New contract · Seeb Logistics Park",
    requestedBy: "finance.lead",
    requestedAt: "2026-11-08T12:30:00Z",
    amount: "18450.000",
    amountLabel: "Billing / month (estimate)",
    count: { value: 40, noun: "workers" },
    summary: "Master services agreement for 40 workers from 1 Dec 2026, 30-day payment terms. Operations and finance reviewed the crew plan and the margin; your approval makes the client active.",
    changes: [
      { label: "Client status", before: "Prospect", after: "Active" },
      { label: "Credit limit", before: "—", after: "OMR 15,000.000" },
      { label: "Estimated gross margin", before: "—", after: "21.4%" },
    ],
    to: "/clients/cl-07",
    step: "Owner approval · step 2 of 2",
  },
  {
    id: "ap-2",
    kind: "rate_card",
    title: "Rate card v3 · Coastal Marine Works",
    requestedBy: "finance.lead",
    requestedAt: "2026-11-08T10:05:00Z",
    amount: "801.665",
    amountLabel: "Billing change / month",
    count: { value: 50, noun: "rate lines" },
    summary: "3.5% uplift on every trade from 1 Jan 2027, under the contract's escalation clause.",
    changes: [
      { label: "Welder · normal hour", before: "OMR 1.845", after: "OMR 1.910" },
      { label: "General labourer · normal hour", before: "OMR 1.128", after: "OMR 1.167" },
      { label: "Valid from", before: "1 Sep 2026", after: "1 Jan 2027" },
    ],
    to: "/contracts/ct-04",
  },
  {
    id: "ap-3",
    kind: "wage",
    title: "Wage change · Anil Menon (W-000381)",
    requestedBy: "hr.officer",
    requestedAt: "2026-11-07T08:15:00Z",
    amount: "20.000",
    amountLabel: "Basic increase / month",
    summary: "Promoted to lead welder at Sohar Port Phase 3. Effective from the November payroll.",
    changes: [
      { label: "Basic wage", before: formatOmr(omr(wageBefore)), after: formatOmr(omr(wageAfter)) },
      { label: "Effective from", before: "—", after: "1 Nov 2026" },
    ],
    to: "/workers",
    workerCode: "W-000381",
  },
  {
    id: "ap-4",
    kind: "override",
    title: "Compliance override · Anil Das (W-000059)",
    requestedBy: "ops.manager",
    requestedAt: "2026-11-06T13:40:00Z",
    count: { value: 1, noun: "worker" },
    summary: "Muscat Tower Block B asks for a trade certificate. It is issued; the attested copy arrives on 20 Nov.",
    changes: [
      { label: "Site requirement · trade certificate", before: "Blocked", after: "Allowed until 20 Nov 2026" },
      { label: "Legal documents", before: "In order", after: "Unchanged (never overridable)" },
    ],
    to: "/overrides",
    workerCode: "W-000059",
  },
  {
    id: "ap-5",
    kind: "write_off",
    title: "Write off INV-2026-0412 balance · Wadi Infrastructure Co.",
    requestedBy: "finance.lead",
    requestedAt: "2026-11-05T09:20:00Z",
    amount: "1184.250",
    amountLabel: "Write-off",
    summary: "Disputed August transport charges, settled by agreement. The client stays over its credit limit afterwards.",
    changes: [
      { label: "Outstanding", before: "OMR 27,410.250", after: "OMR 26,226.000" },
      { label: "Credit limit", before: "OMR 25,000.000", after: "OMR 25,000.000" },
    ],
    to: "/receivables",
  },
  {
    id: "ap-h1",
    kind: "payroll",
    title: "Release September 2026 payroll",
    requestedBy: "payroll.officer",
    requestedAt: "2026-10-01T11:00:00Z",
    amount: "127915.000",
    amountLabel: "Net pay",
    count: { value: 671, noun: "payslips" },
    summary: "WPS file accepted by Bank Muscat on 4 Oct.",
    changes: [{ label: "Net pay vs August", before: "OMR 119,240.750", after: "OMR 127,915.000" }],
    to: "/payroll",
    decision: { outcome: "approved", by: "owner.gm", at: "2026-10-02T05:48:00Z" },
  },
  {
    id: "ap-h2",
    kind: "rate_card",
    title: "Rate card v2 · Gulf Build LLC",
    requestedBy: "finance.lead",
    requestedAt: "2026-08-24T07:30:00Z",
    amount: "2830.400",
    amountLabel: "Billing change / month",
    summary: "4.0% uplift from 1 Sep 2026.",
    changes: [{ label: "Valid from", before: "1 Jan 2026", after: "1 Sep 2026" }],
    to: "/contracts",
    decision: { outcome: "approved", by: "owner.gm", at: "2026-08-25T06:10:00Z" },
  },
  {
    id: "ap-h3",
    kind: "write_off",
    title: "Write off INV-2026-0288 balance · Crescent Facilities Services",
    requestedBy: "finance.lead",
    requestedAt: "2026-10-20T10:00:00Z",
    amount: "412.000",
    amountLabel: "Write-off",
    summary: "Short payment on a July invoice.",
    changes: [{ label: "Outstanding", before: "OMR 9,812.500", after: "OMR 9,400.500" }],
    to: "/receivables",
    decision: { outcome: "rejected", by: "owner.gm", at: "2026-10-21T04:55:00Z", reason: "Chase once more: the client confirmed a payment plan." },
  },
  {
    id: "ap-h4",
    kind: "wage",
    title: "Wage change · driver allowance (12 workers)",
    requestedBy: "hr.officer",
    requestedAt: "2026-10-12T09:00:00Z",
    amount: "180.000",
    amountLabel: "Total increase / month",
    count: { value: 12, noun: "workers" },
    summary: "Night-route allowance for the Sohar bus drivers.",
    changes: [{ label: "Allowance per driver", before: "OMR 0.000", after: "OMR 15.000" }],
    to: "/workers",
    decision: { outcome: "approved", by: "ops.manager", at: "2026-10-12T12:20:00Z" },
  },
];

if (approvals.filter((a) => !a.decision).length !== pendingApprovalsCount) {
  throw new Error("Approvals demo list is out of step with pendingApprovalsCount");
}

export const fetchApprovals = () =>
  delay({
    pending: approvals.filter((a) => !a.decision).map((a) => ({ ...a })),
    history: approvals
      .filter((a) => a.decision)
      .map((a) => ({ ...a }))
      .sort((a, b) => (a.decision!.at < b.decision!.at ? 1 : -1)),
  });

export async function decideApproval(input: { id: string; outcome: "approved" | "rejected"; by: string; reason?: string }) {
  const a = approvals.find((x) => x.id === input.id);
  if (!a) throw new Error("This request no longer exists.");
  if (a.decision) throw new Error("Someone has already decided this request.");
  // Four eyes (CLAUDE.md rule 6). The API enforces this too once /approvals is built.
  if (a.requestedBy === input.by) throw new Error("You made this request, so someone else must decide it.");
  a.decision = { outcome: input.outcome, by: input.by, at: new Date().toISOString(), reason: input.reason };
  return delay({ ...a }, 300);
}

// ── Today work queues (S-02) ──────────────────────────────────────────────────

export type QueueKind = "task" | "approval" | "alert";
export interface QueueItem {
  id: string;
  kind: QueueKind;
  title: string;
  detail: string;
  to: string;
  badge: { tone: StatusTone; text: string };
  /** true when the count comes from the live API rather than the demo layer. */
  live?: boolean;
}

/** What each role must act on today. Counts from `summary` are real; the rest are demo. */
export function queueFor(role: Role, s: DashboardSummary | undefined, pendingApprovals: number): QueueItem[] {
  const expiring = s?.expiringIn30Days ?? 0;
  const expired = s?.byCompliance.expired ?? 0;
  const incomplete = s?.byCompliance.incomplete ?? 0;
  const approvalsItem: QueueItem = {
    id: "approvals",
    kind: "approval",
    title: `${pendingApprovals} requests wait for a decision`,
    detail: "A new client contract, a rate card, a wage change, an override and a write-off.",
    to: "/approvals",
    badge: { tone: "due", text: "Awaiting approval" },
  };
  switch (role) {
    case "hr_pro":
      return [
        { id: "renew", kind: "task", title: `Renew ${expiring} documents expiring within 30 days`, detail: "Start the renewal before the visa or labour card lapses.", to: "/renewals", badge: { tone: "expired", text: "Within 30 days" }, live: true },
        { id: "expired", kind: "alert", title: `${expired} workers have expired papers`, detail: "They cannot be deployed or paid until renewed.", to: "/workers?compliance=expired", badge: { tone: "blocked", text: "Blocked" }, live: true },
        { id: "verify", kind: "task", title: "Verify 8 uploaded documents", detail: "Scanned yesterday by the PRO desk; check against the originals.", to: "/documents/upload", badge: { tone: "due", text: "To verify" } },
        { id: "incomplete", kind: "task", title: `Complete ${incomplete} files with missing papers`, detail: "New joiners waiting for medical fitness or a labour card.", to: "/workers?compliance=incomplete", badge: { tone: "incomplete", text: "Papers missing" }, live: true },
        { id: "gov", kind: "task", title: "3 government transactions waiting on the company", detail: "Two visa renewals need fees paid; one transfer needs a signature.", to: "/gov-transactions", badge: { tone: "due", text: "Waiting on us" } },
      ];
    case "ops_manager":
      return [
        { id: "sheets", kind: "alert", title: "Daily sheet missing for 2 sites (8 Nov)", detail: "Duqm Breakwater and Nizwa Road 7 Upgrade. Supervisors have been reminded.", to: "/daily-sheets", badge: { tone: "expired", text: "Missing" } },
        { id: "attendance", kind: "task", title: "Enter attendance for 4 sites", detail: "Sheets are scanned and waiting in the timekeeper queue.", to: "/attendance", badge: { tone: "due", text: "To enter" } },
        { id: "timesheets", kind: "task", title: "Review 12 timesheets", detail: "Week 45, ready to send to clients for signature.", to: "/timesheets", badge: { tone: "due", text: "Awaiting review" } },
        { id: "requests", kind: "task", title: "Fill 3 open manpower requests (26 workers)", detail: "Gulf Build needs 14 steel fixers by 16 Nov.", to: "/requests", badge: { tone: "info", text: "Open" } },
        { id: "deployed-expired", kind: "alert", title: `${expired} workers with expired papers`, detail: "Check none of them is still rostered.", to: "/workers?compliance=expired", badge: { tone: "blocked", text: "Blocked" }, live: true },
      ];
    case "payroll":
      return [
        { id: "run", kind: "task", title: "November 2026 run is in draft", detail: "Calculate once November timesheets lock. October was released on 1 Nov and paid through WPS.", to: "/payroll", badge: { tone: "draft", text: "Draft" } },
        { id: "blockers", kind: "alert", title: "3 workers have no bank account", detail: "They will be paid by cheque unless fixed before the WPS file.", to: "/payroll", badge: { tone: "blocked", text: "Blocker" } },
        { id: "loans", kind: "task", title: "Approve 2 salary advances", detail: "Requested through HR on 6 Nov.", to: "/loans", badge: { tone: "due", text: "To approve" } },
        { id: "exits", kind: "task", title: "Prepare 1 final settlement", detail: "Contract end on 15 Nov · Sohar Industrial Yard.", to: "/exits", badge: { tone: "draft", text: "Draft" } },
      ];
    case "finance":
      return [
        approvalsItem,
        { id: "issue", kind: "task", title: "Issue 6 invoices for October", detail: "Generated from locked timesheets; one line needs a rate.", to: "/invoices", badge: { tone: "draft", text: "Draft" } },
        { id: "overdue", kind: "alert", title: "OMR 41,206.500 overdue across 9 invoices", detail: "Reminders went out on 1 Nov.", to: "/receivables", badge: { tone: "expired", text: "Overdue" } },
        { id: "credit", kind: "alert", title: "Wadi Infrastructure Co. is over its credit limit", detail: "OMR 27,410.250 outstanding against 25,000.000.", to: "/receivables", badge: { tone: "blocked", text: "Over limit" } },
        { id: "bills", kind: "task", title: "Post 4 supplier bills", detail: "Camp rent and bus fuel for October.", to: "/supplier-bills", badge: { tone: "due", text: "To post" } },
      ];
    case "owner":
      return [
        approvalsItem,
        { id: "contract", kind: "approval", title: "New contract for Seeb Logistics Park needs your approval", detail: "40 workers from 1 Dec · OMR 18,450.000 a month (estimate).", to: "/approvals", badge: { tone: "due", text: "Awaiting you" } },
        { id: "credit", kind: "alert", title: "Wadi Infrastructure Co. is over its credit limit", detail: "OMR 27,410.250 outstanding against 25,000.000.", to: "/receivables", badge: { tone: "blocked", text: "Over limit" } },
        { id: "expired", kind: "alert", title: `${expired} workers have expired papers`, detail: "Blocked from deployment and pay until renewed.", to: "/workers?compliance=expired", badge: { tone: "blocked", text: "Blocked" }, live: true },
      ];
    default:
      return [
        { id: "rules", kind: "task", title: "12 rule versions are demo · unsigned", detail: "Placeholder values. Pay cannot use them until a named person signs each one.", to: "/admin/rules", badge: { tone: "due", text: "Unsigned" } },
        { id: "invites", kind: "task", title: "1 invitation not yet accepted", detail: "Sent to the new accounts assistant on 4 Nov.", to: "/admin/users", badge: { tone: "incomplete", text: "Invited" } },
        { id: "wps", kind: "alert", title: "Bank Muscat WPS link is pending decision D8", detail: "Salary files are generated and uploaded by hand until then.", to: "/admin/audit", badge: { tone: "incomplete", text: "Pending D8" } },
        { id: "audit", kind: "task", title: "Run the audit chain check", detail: "The nightly check passed; run it again after any data fix.", to: "/admin/audit", badge: { tone: "ok", text: "Last check passed" } },
      ];
  }
}

// ── Reports (S-34) ────────────────────────────────────────────────────────────

export const REPORT_GROUPS = ["Workforce", "Compliance", "Operations", "Time", "Payroll", "Billing", "Finance", "Owner"] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

export interface Report {
  id: string;
  group: ReportGroup;
  name: string;
  description: string;
}

const R = (group: ReportGroup, rows: [string, string][]): Report[] =>
  rows.map(([name, description], i) => ({ id: `${group.toLowerCase()}-${i + 1}`, group, name, description }));

export const REPORTS: Report[] = [
  ...R("Workforce", [
    ["Headcount by status", "Deployed, available, on leave and in recruitment, today and month by month."],
    ["Headcount by trade and nationality", "How many of each trade you have, split by nationality."],
    ["Joiners and leavers", "Arrivals, exits and the reason for each exit, by month."],
    ["Worker master list", "Every worker with code, trade, status and current site. Masked IDs."],
    ["Bench ageing", "Available workers by days idle, so long-idle trades are visible."],
    ["Worker profitability", "Billed minus paid per worker for a period."],
  ]),
  ...R("Compliance", [
    ["Expiring documents (90 days)", "Visas, labour cards, passports and medicals by expiry tier."],
    ["Expired papers while deployed", "Workers on a site whose mandatory document has lapsed."],
    ["Missing documents", "Workers whose file lacks a mandatory document."],
    ["Government transactions", "Every open ministry application and who it waits on."],
    ["Overrides register", "Each override with who approved it, why and until when."],
    ["Medical fitness schedule", "Medicals due in the next 60 days, grouped by clinic."],
  ]),
  ...R("Operations", [
    ["Deployment by site", "Workers on each site against the client's request."],
    ["Open manpower requests", "Unfilled positions, ageing and the trade asked for."],
    ["Roster coverage", "Rostered versus attended, per site per day."],
    ["Utilisation by client", "Billable hours against available hours per client."],
    ["Camp and transport allocation", "Who sleeps where and which bus takes them."],
  ]),
  ...R("Time", [
    ["Attendance summary", "Present, absent, sick and late per site for a period."],
    ["Overtime by site", "Overtime hours by type (day, night, rest day, holiday)."],
    ["Absence and lateness", "Workers above the absence threshold this month."],
    ["Timesheet approval status", "Which timesheets are drafted, sent, signed or locked."],
    ["Leave balances", "Annual and sick leave taken and remaining per worker."],
  ]),
  ...R("Payroll", [
    ["Payroll register", "Every payslip line for a run: basic, overtime, allowances, deductions."],
    ["Variance against last month", "Workers whose pay moved more than the review threshold."],
    ["WPS submission status", "Files sent to Bank Muscat, accepted and rejected rows."],
    ["Deductions and loans", "Advances and loan instalments outstanding."],
    ["End-of-service liability", "Gratuity accrued per worker to date."],
    ["Savings-system contributions", "Employer contributions once the start date (D9) is decided."],
  ]),
  ...R("Billing", [
    ["Invoice register", "Every invoice for a period with VAT and status."],
    ["Unbilled hours", "Locked hours not yet on an invoice, valued at the rate card."],
    ["Credit notes", "Credit notes issued, with the invoice and lines they correct."],
    ["VAT output summary", "Output VAT by month for the VAT return workings."],
  ]),
  ...R("Finance", [
    ["Receivables ageing", "Outstanding by client in 30, 60, 90 and 90+ day buckets."],
    ["Cash collected against due", "Receipts against invoices falling due, by week."],
    ["Trial balance", "Balances by account for a closed or open period."],
    ["Profit and loss by client", "Revenue, direct cost and margin per client and site."],
    ["Supplier bills due", "Camp rent, fuel, visa fees and agency bills by due date."],
  ]),
  ...R("Owner", [
    ["Monthly business pack", "Headcount, margin, cash, payroll and compliance on two pages."],
    ["Margin by client and site", "Where the money is made and lost this month."],
    ["Compliance risk summary", "Expiries, blocks and overrides in one view."],
  ]),
];

export interface SavedView {
  id: string;
  name: string;
  reportId: string;
  filters: string;
  owner: string;
  lastRun: string; // ISO
}

const savedViews: SavedView[] = [
  { id: "sv-1", name: "Sohar sites · expiring in 30 days", reportId: "compliance-1", filters: "Site: Sohar (3) · Tier ≤ 30 days", owner: "hr.officer", lastRun: "2026-11-09T05:10:00Z" },
  { id: "sv-2", name: "Welders idle more than 14 days", reportId: "workforce-5", filters: "Trade: Welder · Idle > 14 days", owner: "ops.manager", lastRun: "2026-11-08T07:45:00Z" },
  { id: "sv-3", name: "October overtime above 40 hours", reportId: "time-2", filters: "Period: Oct 2026 · Overtime > 40 h", owner: "payroll.officer", lastRun: "2026-11-07T11:30:00Z" },
  { id: "sv-4", name: "Wadi Infrastructure · overdue", reportId: "finance-1", filters: "Client: Wadi Infrastructure Co. · Bucket ≥ 30 days", owner: "finance.lead", lastRun: "2026-11-08T13:25:00Z" },
  { id: "sv-5", name: "Owner pack · last closed month", reportId: "owner-1", filters: "Period: last closed month", owner: "owner.gm", lastRun: "2026-11-01T03:00:00Z" },
];

export type Channel = "email" | "whatsapp";
export type Frequency = "daily" | "weekly" | "monthly";
export interface Schedule {
  id: string;
  reportId: string;
  channels: Channel[];
  frequency: Frequency;
  recipients: string[];
  format: "excel" | "pdf";
  nextRun: string; // YYYY-MM-DD
  createdBy: string;
}

const schedules: Schedule[] = [
  { id: "sc-1", reportId: "owner-1", channels: ["whatsapp", "email"], frequency: "monthly", recipients: ["owner@demo.mms"], format: "pdf", nextRun: "2026-12-01", createdBy: "owner.gm" },
  { id: "sc-2", reportId: "compliance-1", channels: ["email"], frequency: "weekly", recipients: ["hr@demo.mms", "pro.desk@demo.mms"], format: "excel", nextRun: "2026-11-15", createdBy: "hr.officer" },
  { id: "sc-3", reportId: "finance-1", channels: ["email"], frequency: "weekly", recipients: ["finance@demo.mms"], format: "excel", nextRun: "2026-11-16", createdBy: "finance.lead" },
];

export const fetchSavedViews = () => delay(savedViews.map((v) => ({ ...v })));
export const fetchSchedules = () => delay(schedules.map((s) => ({ ...s })));

export async function createSchedule(input: Omit<Schedule, "id">) {
  const s: Schedule = { ...input, id: `sc-${schedules.length + 1}-${Date.now() % 10000}` };
  schedules.push(s);
  return delay(s, 300);
}

export async function saveView(input: Omit<SavedView, "id" | "lastRun">) {
  const v: SavedView = { ...input, id: `sv-${savedViews.length + 1}-${Date.now() % 10000}`, lastRun: new Date().toISOString() };
  savedViews.unshift(v);
  return delay(v, 250);
}

/** Sample rows for report previews where the module has no API yet (Workforce and Compliance use live data). */
export const REPORT_SAMPLES: Record<Exclude<ReportGroup, "Workforce" | "Compliance">, { columns: string[]; numeric: number[]; rows: string[][] }> = {
  Operations: {
    columns: ["Site", "Client", "Requested", "Deployed", "Gap"],
    numeric: [2, 3, 4],
    rows: [
      ["Sohar Port Phase 3", "Gulf Build LLC", "125", "121", "4"],
      ["Muscat Tower Block B", "Al Noor Contracting", "90", "88", "2"],
      ["Sohar Industrial Yard", "Batinah Steel Fabrication", "64", "64", "0"],
      ["Sohar Wharf Extension", "Gulf Build LLC", "52", "48", "4"],
      ["Duqm Breakwater", "Coastal Marine Works", "50", "49", "1"],
      ["Nizwa Road 7 Upgrade", "Wadi Infrastructure Co.", "36", "33", "3"],
    ],
  },
  Time: {
    columns: ["Site", "Normal h", "Overtime h", "Rest-day h", "Absent days"],
    numeric: [1, 2, 3, 4],
    rows: [
      ["Sohar Port Phase 3", "26,180", "6,410", "1,120", "38"],
      ["Muscat Tower Block B", "19,040", "4,220", "860", "21"],
      ["Sohar Industrial Yard", "13,860", "3,150", "540", "17"],
      ["Sohar Wharf Extension", "10,390", "2,480", "410", "12"],
      ["Duqm Breakwater", "10,580", "2,610", "520", "9"],
      ["Nizwa Road 7 Upgrade", "7,140", "1,090", "220", "14"],
    ],
  },
  Payroll: {
    columns: ["Trade", "Payslips", "Basic", "Overtime", "Net pay"],
    numeric: [1, 2, 3, 4],
    rows: [
      ["General labourer", "214", "OMR 23,540.000", "OMR 4,812.250", "OMR 27,912.500"],
      ["Mason", "88", "OMR 14,080.000", "OMR 2,904.000", "OMR 16,540.750"],
      ["Steel fixer", "76", "OMR 12,540.000", "OMR 2,688.500", "OMR 14,905.250"],
      ["Welder", "61", "OMR 12,505.000", "OMR 2,511.750", "OMR 14,690.000"],
      ["Electrician", "54", "OMR 10,800.000", "OMR 2,106.000", "OMR 12,640.500"],
      ["Equipment operator", "39", "OMR 9,750.000", "OMR 1,833.000", "OMR 11,302.250"],
    ],
  },
  Billing: {
    columns: ["Invoice", "Client", "Period", "Net", "Status"],
    numeric: [3],
    rows: [
      ["INV-2026-0461", "Gulf Build LLC", "Oct 2026", "OMR 74,686.190", "Draft"],
      ["INV-2026-0462", "Al Noor Contracting", "Oct 2026", "OMR 39,272.380", "Draft"],
      ["INV-2026-0463", "Batinah Steel Fabrication", "Oct 2026", "OMR 28,684.050", "Draft"],
      ["INV-2026-0448", "Coastal Marine Works", "Sep 2026", "OMR 20,412.500", "Issued"],
      ["INV-2026-0412", "Wadi Infrastructure Co.", "Aug 2026", "OMR 12,914.290", "Overdue"],
    ],
  },
  Finance: {
    columns: ["Client", "0–30 days", "31–60", "61–90", "90+"],
    numeric: [1, 2, 3, 4],
    rows: [
      ["Gulf Build LLC", "OMR 31,204.500", "OMR 4,120.000", "—", "—"],
      ["Al Noor Contracting", "OMR 28,610.250", "OMR 9,402.500", "OMR 2,110.000", "—"],
      ["Wadi Infrastructure Co.", "OMR 6,140.000", "OMR 9,407.850", "OMR 6,200.000", "OMR 5,662.400"],
      ["Coastal Marine Works", "OMR 20,412.500", "—", "—", "—"],
      ["Batinah Steel Fabrication", "OMR 12,880.750", "OMR 3,050.000", "—", "—"],
    ],
  },
  Owner: {
    columns: ["Client", "Revenue", "Direct cost", "Margin", "Margin %"],
    numeric: [1, 2, 3, 4],
    rows: CLIENT_MARGINS.map((c) => [c.name, formatOmr(omr(c.revenue)), formatOmr(omr(c.directCost)), formatOmr(omr(c.margin)), `${c.marginPct}%`]),
  },
};


// ── Display helper shared by the insight and admin screens ────────────────────

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat" });
const DAY_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat" });
const OMAN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat" });

/** A moment in Oman time: "10:42" today, otherwise "8 Nov, 17:20". (Candidate for lib/format.) */
export function displayMoment(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return OMAN_DAY.format(d) === OMAN_DAY.format(new Date()) ? `Today, ${TIME.format(d)}` : DAY_TIME.format(d);
}

/** "Priya Nair (Payroll officer)" for a demo username; the username itself otherwise. */
export function personOf(username: string): string {
  const a = DEMO_ACCOUNTS.find((x) => x.username === username);
  return a ? `${a.displayName} (${ROLE_LABELS[a.role]})` : username;
}
