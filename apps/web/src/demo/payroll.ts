/**
 * DEMO DATA — payroll, WPS, advances and loans, exits and final settlements (S-22 … S-27).
 * Fictional and deterministic (see ./core.ts). Shapes follow docs/spec/07-Backend-Schema.md
 * "Payroll": pay_periods, payroll_runs, run_approvals, payslips, payslip_lines (with trace),
 * loans, loan_instalments, wps_files, wps_responses, separations, final_settlements.
 *
 * Built FROM the real worker list: deployed and on-leave workers are paid, so every name opens
 * the real worker file. Money is strings end to end, computed with decimal.js (CLAUDE.md rule 2).
 *
 * Legal values come from the dated rule table below (CLAUDE.md rule 3). Every one of them is a
 * DEMO value, unsigned: the labour lawyer signs the real table before go-live. Open decisions:
 *   D8 — Bank Muscat WPS SIF specification: the WPS file template stays "draft (D8)".
 *   D9 — savings-system start date: the 9% line shows "starts on the Fund's date (pending D9)" and
 *        gratuity accrues "until the savings-system switch date".
 *
 * Actions are real in-session: an in-memory store stands in for the API, mutations invalidate
 * the ["payroll"] queries, and maker ≠ checker is enforced here as the API will (rule 6).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addDays, daysBetween, formatOmr, omr } from "@mms/core";
import type { WorkerListItem } from "@/lib/api";
import { displayDate } from "@/lib/format";
import { DEMO_ACCOUNTS, type DemoAccount, type V1Role } from "@/lib/roles";
import { dates, delay, hash, money, rng } from "./core";
import { basicWage, siteOf, useWorkforce } from "./workforce";

// ---------------------------------------------------------------------------
// Rule table (rule_versions) — demo values, unsigned
// ---------------------------------------------------------------------------

export interface RuleVersion {
  key: string;
  /** valid_from; null when the start date is an open decision. */
  validFrom: string | null;
  label: string;
  params: Record<string, string>;
  signed: false;
}

const rule = (key: string, validFrom: string | null, label: string, params: Record<string, string>): RuleVersion => ({ key, validFrom, label, params, signed: false });

export const RULES = {
  hourly: rule("pay.hourly_divisor", "2026-01-01", "Hourly rate = monthly basic ÷ 240 (30 days × 8 hours)", { divisor: "240" }),
  daily: rule("pay.daily_divisor", "2026-01-01", "Daily rate = monthly basic ÷ 30", { divisor: "30" }),
  otDay: rule("overtime.day", "2026-01-01", "Day overtime uplift", { multiplier: "1.25" }),
  otRest: rule("overtime.rest_day", "2026-01-01", "Rest-day overtime uplift", { multiplier: "1.5" }),
  deductionCap: rule("deduction.cap", "2026-01-01", "Deductions stop at this share of basic; the rest carries to next month", { shareOfBasic: "0.5" }),
  sickInsurance: rule("spf.sick_leave_insurance", "2026-07-19", "Sick and extraordinary leave insurance (employer)", { employerRate: "0.01" }),
  savings: rule("spf.savings_system", null, "Expatriate savings system (employer, % of basic)", { employerRate: "0.09" }),
  gratuity: rule("eos.gratuity", "2026-01-01", "End-of-service gratuity days per year of service", { daysPerYear: "15" }),
  annualLeave: rule("leave.annual", "2026-01-01", "Annual leave days per year", { daysPerYear: "30" }),
  ownerThreshold: rule("approval.owner_threshold", "2026-01-01", "Owner approves payroll runs above this net total", { amount: "50000.000" }),
  settlementOwner: rule("approval.settlement_owner_threshold", "2026-01-01", "Owner approves settlements above this total", { amount: "1000.000" }),
  variance: rule("payroll.variance_flag", "2026-01-01", "Flag a payslip that moved more than this share vs last month", { share: "0.15" }),
} as const;

/** "rule overtime.day · v2026-01-01 · demo, unsigned" */
export const ruleTag = (r: RuleVersion) => `rule ${r.key} · ${r.validFrom ? `v${r.validFrom}` : "start pending D9"} · demo, unsigned`;

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** The current pay period. Fixed so the demo tells the same story on every day it is shown. */
export const CURRENT_PERIOD = "2026-11-01";
/** Last six months (released, locked) and the current one. */
export const PERIODS: string[] = Array.from({ length: 7 }, (_, i) => dates.addMonths(CURRENT_PERIOD, i - 6));

export interface PayPeriod {
  id: string;
  startDate: string;
  endDate: string;
  /** 3 days after the period ends (PRD §6, WPS). */
  wpsDueDate: string;
  name: string;
}

export const periodOf = (start: string): PayPeriod => {
  const endDate = dates.monthEnd(start);
  return { id: `pp-${start.slice(0, 7)}`, startDate: start, endDate, wpsDueDate: addDays(endDate, 3), name: dates.monthName(start) };
};

// ---------------------------------------------------------------------------
// Payslips (pure builder — tested in payroll.test.ts)
// ---------------------------------------------------------------------------

export type LineKind = "earning" | "deduction" | "employer";

export interface PayslipLine {
  componentKey: string;
  label: string;
  kind: LineKind;
  /** null for a line that is shown but not yet in force (savings system, D9). */
  amount: string | null;
  quantity: string;
  unit: string;
  rate: string | null;
  rule: RuleVersion | null;
  /** source_refs: the locked timesheet, contract, loan or leave record it came from. */
  sourceRef: string;
  /** How it was derived, in words. */
  trace: string;
}

export interface Payslip {
  id: string;
  runId: string;
  periodStart: string;
  workerId: string;
  workerCode: string;
  workerName: string;
  trade: string;
  nationality: string;
  siteCode: string | null;
  siteName: string;
  workerStatus: string;
  paymentMethod: "wps" | "exchange_house";
  accountMask: string | null;
  basic: string;
  overtime: string;
  allowances: string;
  gross: string;
  deductions: string;
  net: string;
  otHours: number;
  lines: PayslipLine[];
}

export interface LoanScheduleItem {
  period: string;
  due: string;
}

export interface Loan {
  id: string;
  workerId: string;
  workerCode: string;
  workerName: string;
  kind: "advance" | "loan";
  principal: string;
  instalment: string;
  startPeriod: string;
  schedule: LoanScheduleItem[];
  reason: string;
  requestedBy: string;
  requestedAt: string;
  approver: string;
  approvedBy: string | null;
  approvedAt: string | null;
  status: "pending_approval" | "active" | "completed";
}

/** Masked account (last 4 only, rule 11). Never a full number anywhere. */
export const maskAccount = (code: string) => `••••${String(1000 + (hash(`acct:${code}`) % 9000))}`;

const ZERO = "0.000";
const ym = (period: string) => period.slice(0, 7).replace("-", "");

/** One worker's payslip for one regular run. Pure: same inputs, same payslip (idempotent runs). */
export function buildPayslip(w: WorkerListItem, periodStart: string, runId: string, loans: readonly Loan[] = []): Payslip {
  const r = rng(`pay:${w.code}:${periodStart}`);
  const site = siteOf(w);
  const onLeave = w.status === "on_leave";
  const basic = basicWage(w);
  const hourly = money.str(omr(basic).div(RULES.hourly.params.divisor!));
  const daily = money.str(omr(basic).div(RULES.daily.params.divisor!));
  const ts = `TS-${site?.code ?? "LEAVE"}-${ym(periodStart)} (locked)`;
  const contract = `contract CT-${w.code.slice(2)}`;
  const lines: PayslipLine[] = [];

  lines.push({
    componentKey: "basic",
    label: onLeave ? "Basic wage (annual leave, paid)" : "Basic wage",
    kind: "earning",
    amount: basic,
    quantity: "1",
    unit: "month",
    rate: basic,
    rule: null,
    sourceRef: onLeave ? `leave LV-${w.code.slice(2)}-${ym(periodStart)} (approved)` : contract,
    trace: `1 month × OMR ${basic} contract wage`,
  });

  // Overtime: a stable habit per worker, a little monthly movement, sometimes a big change.
  let otHours = 0;
  if (!onLeave) {
    const base = hash(`otbase:${w.code}`) % 26;
    const swing = r.chance(0.08) ? r.pick([-1, 1]) * r.int(10, 18) : r.int(-3, 3);
    const dayHours = Math.max(0, Math.min(60, base + swing));
    if (dayHours > 0) {
      const otRate = money.times(hourly, RULES.otDay.params.multiplier!);
      lines.push({ componentKey: "overtime.day", label: "Overtime (day)", kind: "earning", amount: money.times(otRate, dayHours), quantity: String(dayHours), unit: "h", rate: otRate, rule: RULES.otDay, sourceRef: ts, trace: `${dayHours} h × OMR ${otRate}/h (hourly OMR ${hourly} × ${RULES.otDay.params.multiplier})` });
      otHours += dayHours;
    }
    if (r.chance(0.3)) {
      const restHours = r.int(4, 16);
      const restRate = money.times(hourly, RULES.otRest.params.multiplier!);
      lines.push({ componentKey: "overtime.rest_day", label: "Overtime (rest day)", kind: "earning", amount: money.times(restRate, restHours), quantity: String(restHours), unit: "h", rate: restRate, rule: RULES.otRest, sourceRef: ts, trace: `${restHours} h × OMR ${restRate}/h (hourly OMR ${hourly} × ${RULES.otRest.params.multiplier})` });
      otHours += restHours;
    }
  }

  // Allowances are contractual, not legal: they come from the worker's contract.
  const food = hash(`food:${w.code}`) % 2 ? "20.000" : "15.000";
  lines.push({ componentKey: "allowance.food", label: "Food allowance", kind: "earning", amount: food, quantity: "1", unit: "month", rate: food, rule: null, sourceRef: contract, trace: `Fixed monthly allowance in the contract` });
  const remote = site?.code === "DQM-BRK" ? "25.000" : site?.code === "NZW-RD7" ? "15.000" : null;
  if (remote) lines.push({ componentKey: "allowance.site", label: "Remote site allowance", kind: "earning", amount: remote, quantity: "1", unit: "month", rate: remote, rule: null, sourceRef: `${contract} · site ${site!.code}`, trace: `Fixed monthly allowance for ${site!.name}` });

  // Deductions in priority order: loans by schedule, then absence and fines, stopping at the cap.
  const wanted: PayslipLine[] = [];
  for (const loan of loans) {
    if (loan.workerCode !== w.code || loan.status === "pending_approval") continue;
    const i = loan.schedule.findIndex((s) => s.period === periodStart);
    if (i < 0) continue;
    const due = loan.schedule[i]!.due;
    wanted.push({ componentKey: `loan.${loan.kind}`, label: loan.kind === "advance" ? "Salary advance recovery" : "Loan instalment", kind: "deduction", amount: due, quantity: "1", unit: "instalment", rate: due, rule: null, sourceRef: `loan ${loan.id} · instalment ${i + 1} of ${loan.schedule.length}`, trace: `Instalment ${i + 1} of ${loan.schedule.length} on the approved schedule` });
  }
  if (!onLeave && r.chance(0.06)) {
    const days = r.int(1, 3);
    wanted.push({ componentKey: "absence.unpaid", label: "Unpaid absence", kind: "deduction", amount: money.times(daily, days), quantity: String(days), unit: "days", rate: daily, rule: RULES.daily, sourceRef: ts, trace: `${days} day${days > 1 ? "s" : ""} absent without leave × OMR ${daily}/day (basic ÷ 30)` });
  }
  if (!onLeave && r.chance(0.02)) {
    const fine = r.pick(["5.000", "10.000"]);
    wanted.push({ componentKey: "fine", label: "Fine (documented)", kind: "deduction", amount: fine, quantity: "1", unit: "case", rate: fine, rule: null, sourceRef: `HSE-${w.code.slice(4)}-${ym(periodStart)}`, trace: `PPE not worn on site; written warning on file` });
  }
  let room = omr(money.times(basic, RULES.deductionCap.params.shareOfBasic!));
  for (const d of wanted) {
    const want = omr(d.amount!);
    const take = want.lte(room) ? want : room;
    room = room.minus(take);
    if (take.isZero()) continue;
    if (!take.eq(want)) {
      const carried = money.str(want.minus(take));
      lines.push({ ...d, amount: money.str(take), rate: money.str(take), trace: `${d.trace}; capped at ${share(RULES.deductionCap.params.shareOfBasic!)} of basic, OMR ${carried} carries to next month`, rule: RULES.deductionCap });
    } else lines.push(d);
  }

  // Employer contributions and accruals: shown for the record, never taken from net pay.
  // ponytail: a rule starting mid-period applies from the next whole period; split-by-date arrives with the real engine.
  if (RULES.sickInsurance.validFrom! <= periodStart) {
    const rate = RULES.sickInsurance.params.employerRate!;
    lines.push({ componentKey: "spf.sick_leave_insurance", label: "Sick-leave insurance (SPF)", kind: "employer", amount: money.times(basic, rate), quantity: share(rate), unit: "of basic", rate: basic, rule: RULES.sickInsurance, sourceRef: "SPF export", trace: `${share(rate)} × OMR ${basic} basic, paid by the employer` });
  }
  lines.push({ componentKey: "spf.savings_system", label: "Savings system (SPF)", kind: "employer", amount: null, quantity: share(RULES.savings.params.employerRate!), unit: "of basic", rate: basic, rule: RULES.savings, sourceRef: "SPF export", trace: `Starts on the Fund's date (pending D9); not charged yet` });
  const gratDays = omr(RULES.gratuity.params.daysPerYear!).div(12).toFixed(2);
  lines.push({ componentKey: "eos.gratuity_accrual", label: "End-of-service accrual", kind: "employer", amount: money.times(daily, gratDays), quantity: gratDays, unit: "days", rate: daily, rule: RULES.gratuity, sourceRef: "EOS ledger", trace: `${RULES.gratuity.params.daysPerYear} days a year ÷ 12 = ${gratDays} days × OMR ${daily}/day; accrues until the savings-system switch date` });

  return finish({
    id: `${runId}.${w.code}`,
    runId,
    periodStart,
    workerId: w.id,
    workerCode: w.code,
    workerName: w.fullName,
    trade: w.trade,
    nationality: w.nationality,
    siteCode: site?.code ?? null,
    siteName: site?.name ?? (onLeave ? "On annual leave" : "—"),
    workerStatus: w.status,
    paymentMethod: "wps",
    accountMask: maskAccount(w.code),
    otHours,
    lines,
  });
}

/** Totals from lines: gross = Σ earnings, deductions = Σ deductions, net = gross − deductions. */
function finish(p: Omit<Payslip, "basic" | "overtime" | "allowances" | "gross" | "deductions" | "net">): Payslip {
  const sumOf = (pred: (l: PayslipLine) => boolean) => money.sum(p.lines.filter((l) => pred(l) && l.amount !== null).map((l) => l.amount!));
  const gross = sumOf((l) => l.kind === "earning");
  const deductions = sumOf((l) => l.kind === "deduction");
  return {
    ...p,
    basic: sumOf((l) => l.componentKey === "basic"),
    overtime: sumOf((l) => l.componentKey.startsWith("overtime")),
    allowances: sumOf((l) => l.componentKey.startsWith("allowance")),
    gross,
    deductions,
    net: money.minus(gross, deductions),
  };
}

/** Every paid worker's payslip for a regular run. */
export function buildPayslips(workers: readonly WorkerListItem[], periodStart: string, runId: string, loans: readonly Loan[] = []): Payslip[] {
  return workers.map((w) => buildPayslip(w, periodStart, runId, loans));
}

const left = (n: number) => (n ? `${n} blocker${n > 1 ? "s" : ""} left` : "no blockers left");
const fmt = (x: string) => formatOmr(omr(x));
const share = (s: string) => `${omr(s).times(100).toFixed()}%`;

/** Who is paid in a regular run: deployed and on-leave workers. */
export const isPaid = (w: Pick<WorkerListItem, "status">) => w.status === "deployed" || w.status === "on_leave";

// ---------------------------------------------------------------------------
// Approvals (run_approvals) and four eyes
// ---------------------------------------------------------------------------

export type ApprovalLevel = "payroll" | "finance" | "owner";
export const LEVEL_LABEL: Record<ApprovalLevel, string> = { payroll: "Payroll prepares", finance: "Finance approves", owner: "Owner approves" };
const LEVEL_ROLE: Record<ApprovalLevel, V1Role> = { payroll: "payroll", finance: "finance", owner: "owner" };

export interface Approval {
  level: ApprovalLevel;
  by: string;
  name: string;
  at: string;
  /** The totals the approver saw. */
  totalSeen: string;
  countSeen: number;
}

export const accountName = (username: string | null | undefined) => DEMO_ACCOUNTS.find((a) => a.username === username)?.displayName ?? username ?? "—";

export function levelsFor(total: string, threshold: string): ApprovalLevel[] {
  return omr(total).gt(omr(threshold)) ? ["payroll", "finance", "owner"] : ["payroll", "finance"];
}

export const nextLevel = (approvals: readonly Approval[], levels: readonly ApprovalLevel[]) => levels.find((l) => !approvals.some((a) => a.level === l)) ?? null;

/** Why this account can't approve at this level, or null if it can (maker ≠ checker). */
export function approvalBlock(account: DemoAccount | null, level: ApprovalLevel, maker: string | null, approvals: readonly Approval[]): string | null {
  if (!account) return "Sign in first";
  if (account.role !== LEVEL_ROLE[level]) return `Needs the ${level === "payroll" ? "payroll officer" : level === "finance" ? "finance approver" : "owner"}`;
  if (level !== "payroll" && account.username === maker) return "You prepared this. A second person must approve it (four eyes).";
  if (approvals.some((a) => a.by === account.username)) return "You already approved this at another level";
  return null;
}

// ---------------------------------------------------------------------------
// Runs, blockers, WPS, loans, exits — the in-session store
// ---------------------------------------------------------------------------

export type RunKind = "regular" | "adjustment" | "settlement";
export type RunStatus = "draft" | "calculated" | "in_review" | "approved" | "released";
export const RUN_STATUS_LABEL: Record<RunStatus, string> = { draft: "Draft", calculated: "Calculated", in_review: "In review", approved: "Approved", released: "Released" };
export const RUN_STATUS_TONE = { draft: "draft", calculated: "info", in_review: "due", approved: "ok", released: "released" } as const;

export interface PayrollRun {
  id: string;
  period: PayPeriod;
  kind: RunKind;
  status: RunStatus;
  note: string;
  calculatedBy: string | null;
  calculatedAt: string | null;
  approvals: Approval[];
  releasedBy: string | null;
  releasedAt: string | null;
  /** Totals; null while the run is a draft. */
  headcount: number | null;
  gross: string | null;
  deductions: string | null;
  net: string | null;
  /** Approval levels this run needs (owner only above the rule-table threshold). */
  levels: ApprovalLevel[];
}

export type BlockerKind = "no_bank_account" | "invalid_iban" | "no_active_contract" | "document_expired";
export const BLOCKER_LABEL: Record<BlockerKind, string> = { no_bank_account: "No bank account", invalid_iban: "Invalid IBAN", no_active_contract: "No active contract", document_expired: "Document expired" };

export interface Blocker {
  id: string;
  runId: string;
  kind: BlockerKind;
  /** "blocks" stops the release; "flag" is paid but recorded ("flagged in payroll", PRD §4.3). */
  severity: "blocks" | "flag";
  workerId: string;
  workerCode: string;
  workerName: string;
  detail: string;
}

export interface Variance {
  payslipId: string;
  workerId: string;
  workerCode: string;
  workerName: string;
  siteName: string;
  prevNet: string;
  net: string;
  change: string;
  /** "18.2" (percent, one decimal). */
  pct: string;
  flagged: boolean;
  whatChanged: string;
  reason: string;
}

export type WpsStatus = "generated" | "sent" | "acknowledged" | "partly_rejected";
export const WPS_STATUS_LABEL: Record<WpsStatus, string> = { generated: "Generated", sent: "Sent", acknowledged: "Acknowledged", partly_rejected: "Partly rejected" };
export const WPS_STATUS_TONE = { generated: "draft", sent: "info", acknowledged: "ok", partly_rejected: "expired" } as const;

export interface WpsRow {
  payslipId: string;
  workerId: string;
  workerCode: string;
  workerName: string;
  accountMask: string;
  amount: string;
}

export interface WpsFile {
  id: string;
  runId: string;
  periodName: string;
  runKind: RunKind;
  bank: "Bank Muscat";
  templateVersion: "draft (D8)";
  kind: "full" | "rejected_rows";
  parentFileId: string | null;
  rows: WpsRow[];
  total: string;
  status: WpsStatus;
  generatedAt: string;
  generatedBy: string;
  sentAt: string | null;
}

export interface WpsResponse {
  id: string;
  fileId: string;
  payslipId: string;
  workerId: string;
  workerCode: string;
  workerName: string;
  accountMask: string;
  amount: string;
  result: "rejected";
  reason: string;
  receivedAt: string;
  /** The rejected-rows file that re-sent this row, if any. */
  resentInFileId: string | null;
}

export type ExitReason = "resignation" | "termination" | "contract_end" | "sponsorship_transfer" | "absconding" | "death";
export const EXIT_REASON_LABEL: Record<ExitReason, string> = {
  resignation: "Resignation",
  termination: "Termination",
  contract_end: "Contract end",
  sponsorship_transfer: "Transfer of sponsorship",
  absconding: "Absconding",
  death: "Death in service",
};
export type ExitStatus = "in_progress" | "awaiting_approval" | "approved" | "exited" | "frozen";
export const EXIT_STATUS_LABEL: Record<ExitStatus, string> = { in_progress: "In progress", awaiting_approval: "Awaiting approval", approved: "Settlement approved", exited: "Exited", frozen: "Pay frozen" };
export const EXIT_STATUS_TONE = { in_progress: "draft", awaiting_approval: "due", approved: "ok", exited: "locked", frozen: "blocked" } as const;

export interface ChecklistItem {
  id: string;
  group: "Last day" | "Assets" | "Government" | "Settlement";
  label: string;
  /** Asset value (only for assets). */
  value?: string;
  done: boolean;
  doneBy: string | null;
  doneAt: string | null;
}

export interface ExitCase {
  id: string;
  workerId: string;
  workerCode: string;
  workerName: string;
  trade: string;
  nationality: string;
  siteName: string;
  reason: ExitReason;
  noticeDate: string;
  lastWorkingDay: string;
  /** Absconding: pay and access frozen from this date. */
  reportDate: string | null;
  joinedOn: string;
  status: ExitStatus;
  contractAllowsAssetDeduction: boolean;
  checklist: ChecklistItem[];
  preparedBy: string | null;
  approvals: Approval[];
  rehireEligible: boolean | null;
  closedAt: string | null;
}

export interface Settlement {
  lines: PayslipLine[];
  earnings: string;
  deductions: string;
  total: string;
  levels: ApprovalLevel[];
  /** Amount owed back that the settlement could not cover (net is never negative). */
  unrecovered: string;
}

interface Store {
  workers: WorkerListItem[];
  paid: WorkerListItem[];
  runs: Map<string, PayrollRun>;
  payslips: Map<string, Payslip[]>;
  reasons: Map<string, string>;
  resolved: Set<string>;
  loans: Loan[];
  wps: WpsFile[];
  responses: WpsResponse[];
  exits: ExitCase[];
}

let S: Store | null = null;

const at = (date: string, time = "10:00") => `${date}T${time}:00+04:00`;
const nowIso = () => new Date().toISOString();
const ACC = (u: string) => DEMO_ACCOUNTS.find((a) => a.username === u)!;
const approve = (level: ApprovalLevel, by: string, when: string, total: string, count: number): Approval => ({ level, by, name: ACC(by).displayName, at: when, totalSeen: total, countSeen: count });

const runId = (period: string, kind: RunKind = "regular") => `run-${period.slice(0, 7)}${kind === "regular" ? "" : kind === "adjustment" ? "-adj" : "-set"}`;
export const CURRENT_RUN_ID = runId(CURRENT_PERIOD);

/** Workers leaving this period are paid through their final settlement, not the regular run. */
const leaversIn = (s: Store, period: string) => new Set(s.exits.filter((e) => e.lastWorkingDay >= period || e.reason === "absconding").map((e) => e.workerCode));

function init(workers: WorkerListItem[]): Store {
  const sorted = [...workers].sort((a, b) => a.code.localeCompare(b.code));
  const paid = sorted.filter(isPaid);
  const s: Store = { workers: sorted, paid, runs: new Map(), payslips: new Map(), reasons: new Map(), resolved: new Set(), loans: makeLoans(paid), wps: [], responses: [], exits: [] };
  s.exits = makeExits(sorted, paid);
  for (const e of s.exits) {
    if (e.status !== "awaiting_approval" && e.status !== "approved" && e.status !== "exited") continue;
    const st = settlementOf(e, s.loans, basicWage(sorted.find((w) => w.code === e.workerCode)!));
    const levels = e.status === "awaiting_approval" ? st.levels.slice(0, 1) : st.levels;
    const who: Record<ApprovalLevel, string> = { payroll: "payroll.officer", finance: "finance.lead", owner: "owner.gm" };
    e.preparedBy = "payroll.officer";
    e.approvals = levels.map((l, i) => approve(l, who[l], at(addDays(e.noticeDate, 5 + i), "11:00"), st.total, 1));
  }

  // Regular runs: six released months, then the current draft.
  for (const p of PERIODS) {
    const id = runId(p);
    const period = periodOf(p);
    const current = p === CURRENT_PERIOD;
    s.runs.set(id, { id, period, kind: "regular", status: current ? "draft" : "released", note: current ? "Locked timesheets, approved leave and loan schedules imported" : `Monthly run from locked ${dates.monthName(p)} timesheets, paid through Bank Muscat WPS`, calculatedBy: null, calculatedAt: null, approvals: [], releasedBy: null, releasedAt: null, headcount: null, gross: null, deductions: null, net: null, levels: [] });
    if (!current) releaseHistory(s, id);
  }

  // A correction to a released run goes into a new adjustment run (final means final, rule 7).
  const adj = runId("2026-09-01", "adjustment");
  s.runs.set(adj, { id: adj, period: periodOf("2026-09-01"), kind: "adjustment", status: "released", note: "Overtime missed on August 2026 timesheets, corrected after release", calculatedBy: null, calculatedAt: null, approvals: [], releasedBy: null, releasedAt: null, headcount: null, gross: null, deductions: null, net: null, levels: [] });
  s.payslips.set(adj, paid.filter((w) => hash(`adj:${w.code}`) % 36 === 5 && w.status === "deployed").map((w) => adjustmentPayslip(w, adj)));
  releaseHistory(s, adj, "2026-09-30");

  // October's settlement run pays the worker who left at contract end.
  const set = runId("2026-10-01", "settlement");
  s.runs.set(set, { id: set, period: periodOf("2026-10-01"), kind: "settlement", status: "released", note: "Final settlement for exits closed in October 2026", calculatedBy: null, calculatedAt: null, approvals: [], releasedBy: null, releasedAt: null, headcount: null, gross: null, deductions: null, net: null, levels: [] });
  s.payslips.set(set, s.exits.filter((e) => e.status === "exited").map((e) => settlementPayslip(s, e, set)));
  releaseHistory(s, set, "2026-10-29");

  // WPS files for every released run except October's settlement (left to generate in the demo).
  for (const run of s.runs.values()) {
    if (run.status !== "released" || run.kind === "settlement") continue;
    const file = makeFile(s, run, rowsFor(s, run.id), "payroll.officer", at(addDays(run.period.endDate, run.kind === "adjustment" ? 1 : 2), "11:20"), "full", null);
    file.status = "acknowledged";
    file.sentAt = at(addDays(run.period.endDate, run.kind === "adjustment" ? 1 : 2), "11:45");
    s.wps.push(file);
  }
  // August: two rows rejected, fixed with a rejected-rows file. October: three rows still open.
  rejectRows(s, s.wps.find((f) => f.runId === runId("2026-08-01"))!, 2, true);
  rejectRows(s, s.wps.find((f) => f.runId === runId("2026-10-01"))!, 3, false);
  return s;
}

function releaseHistory(s: Store, id: string, releaseDay?: string) {
  const run = s.runs.get(id)!;
  const slips = payslipsOf(s, id);
  const t = totals(slips);
  const end = run.period.endDate;
  const levels = levelsFor(t.net, run.kind === "settlement" ? RULES.settlementOwner.params.amount! : RULES.ownerThreshold.params.amount!);
  const day = releaseDay ?? addDays(end, 1);
  run.levels = levels;
  run.calculatedBy = "payroll.officer";
  run.calculatedAt = at(addDays(day, -2), "09:10");
  run.approvals = [approve("payroll", "payroll.officer", at(addDays(day, -2), "15:30"), t.net, t.headcount), approve("finance", "finance.lead", at(addDays(day, -1), "10:42"), t.net, t.headcount)];
  if (levels.includes("owner")) run.approvals.push(approve("owner", "owner.gm", at(addDays(day, -1), "18:05"), t.net, t.headcount));
  run.releasedBy = "finance.lead";
  run.releasedAt = at(day, "09:30");
  Object.assign(run, t);
}

function totals(slips: readonly Payslip[]) {
  return { headcount: slips.length, gross: money.sum(slips.map((p) => p.gross)), deductions: money.sum(slips.map((p) => p.deductions)), net: money.sum(slips.map((p) => p.net)) };
}

function payslipsOf(s: Store, id: string): Payslip[] {
  const cached = s.payslips.get(id);
  if (cached) return cached;
  const run = s.runs.get(id);
  if (!run || run.kind !== "regular" || run.status === "draft") return [];
  const leaving = run.period.startDate === CURRENT_PERIOD ? leaversIn(s, CURRENT_PERIOD) : new Set<string>();
  const out = buildPayslips(s.paid.filter((w) => !leaving.has(w.code)), run.period.startDate, id, s.loans);
  s.payslips.set(id, out);
  return out;
}

function adjustmentPayslip(w: WorkerListItem, id: string): Payslip {
  const hourly = money.str(omr(basicWage(w)).div(RULES.hourly.params.divisor!));
  const hours = 2 + (hash(`adjh:${w.code}`) % 7);
  const rate = money.times(hourly, RULES.otDay.params.multiplier!);
  const site = siteOf(w);
  return finish({
    id: `${id}.${w.code}`, runId: id, periodStart: "2026-09-01", workerId: w.id, workerCode: w.code, workerName: w.fullName, trade: w.trade, nationality: w.nationality,
    siteCode: site?.code ?? null, siteName: site?.name ?? "—", workerStatus: w.status, paymentMethod: "wps", accountMask: maskAccount(w.code), otHours: hours,
    lines: [{ componentKey: "adjustment.overtime", label: "Overtime correction (August 2026)", kind: "earning", amount: money.times(rate, hours), quantity: String(hours), unit: "h", rate, rule: RULES.otDay, sourceRef: `correction TC-${w.code.slice(4)} to TS-${site?.code ?? "—"}-202608`, trace: `${hours} h missed on the locked August sheet × OMR ${rate}/h; the released August run stays as it was` }],
  });
}

function rowsFor(s: Store, id: string): WpsRow[] {
  return payslipsOf(s, id).map((p) => ({ payslipId: p.id, workerId: p.workerId, workerCode: p.workerCode, workerName: p.workerName, accountMask: p.accountMask ?? "—", amount: p.net }));
}

function makeFile(s: Store, run: PayrollRun, rows: WpsRow[], by: string, when: string, kind: WpsFile["kind"], parent: string | null): WpsFile {
  const n = s.wps.filter((f) => f.runId === run.id).length + 1;
  return { id: `WPS-${run.period.startDate.slice(0, 7)}${run.kind === "regular" ? "" : `-${run.kind.slice(0, 3).toUpperCase()}`}-${String(n).padStart(2, "0")}`, runId: run.id, periodName: run.period.name, runKind: run.kind, bank: "Bank Muscat", templateVersion: "draft (D8)", kind, parentFileId: parent, rows, total: money.sum(rows.map((r) => r.amount)), status: "generated", generatedAt: when, generatedBy: by, sentAt: null };
}

const REJECT_REASONS = ["Account closed at the bank", "Name does not match the bank record", "Account number failed validation", "Labour card number does not match"];

function rejectRows(s: Store, file: WpsFile, n: number, fixed: boolean) {
  const r = rng(`reject:${file.id}`);
  const picks = new Set<number>();
  while (picks.size < Math.min(n, file.rows.length)) picks.add(r.int(0, file.rows.length - 1));
  const received = at(addDays(file.generatedAt.slice(0, 10), 1), "08:15");
  const rows = [...picks].map((i) => file.rows[i]!);
  file.status = "partly_rejected";
  const fix = fixed ? makeFile(s, s.runs.get(file.runId)!, rows, "payroll.officer", at(addDays(file.generatedAt.slice(0, 10), 2), "10:05"), "rejected_rows", file.id) : null;
  if (fix) {
    fix.status = "acknowledged";
    fix.sentAt = at(addDays(file.generatedAt.slice(0, 10), 2), "10:30");
    s.wps.push(fix);
  }
  rows.forEach((row, i) => s.responses.push({ id: `${file.id}-R${i + 1}`, fileId: file.id, ...row, result: "rejected", reason: REJECT_REASONS[(i + hash(file.id)) % REJECT_REASONS.length]!, receivedAt: received, resentInFileId: fix?.id ?? null }));
}

function makeLoans(paid: WorkerListItem[]): Loan[] {
  const out: Loan[] = [];
  const reasons = { advance: ["Family medical bill", "School fees at home", "Festival travel", "Rent deposit at home"], loan: ["House repair at home", "Family wedding", "Land purchase at home", "Debt consolidation"] };
  for (const w of paid) {
    if (hash(`loan:${w.code}`) % 12 !== 0) continue;
    const r = rng(`loan:${w.code}`);
    const kind = r.chance(0.55) ? "advance" : "loan";
    const n = kind === "advance" ? r.int(1, 3) : r.int(5, 10);
    const instalment = kind === "advance" ? r.pick(["25.000", "30.000", "40.000", "50.000"]) : r.pick(["20.000", "25.000", "30.000", "35.000"]);
    const startPeriod = PERIODS[r.int(0, PERIODS.length - 1)]!;
    out.push(newLoan(out.length + 1, w, kind, money.times(instalment, n), n, startPeriod, r.pick(reasons[kind]), "payroll.officer", r.chance(0.5) ? "finance.lead" : "owner.gm", "active", at(addDays(startPeriod, -6))));
  }
  // Two requests waiting for their second person.
  const waiting = paid.filter((w) => hash(`loanreq:${w.code}`) % 97 === 3).slice(0, 2);
  waiting.forEach((w, i) => out.push(newLoan(out.length + 1, w, i ? "loan" : "advance", i ? "240.000" : "60.000", i ? 8 : 2, dates.addMonths(CURRENT_PERIOD, 1), i ? "Family wedding" : "Family medical bill", "payroll.officer", "finance.lead", "pending_approval", at("2026-11-08", "12:40"))));
  return out.map(withStatus);
}

function newLoan(n: number, w: WorkerListItem, kind: Loan["kind"], principal: string, count: number, startPeriod: string, reason: string, requestedBy: string, approver: string, status: Loan["status"], requestedAt: string): Loan {
  const instalment = money.str(omr(principal).div(count).toDecimalPlaces(3, 1));
  const schedule = Array.from({ length: count }, (_, i) => ({ period: dates.addMonths(startPeriod, i), due: instalment }));
  // The last instalment takes the remainder, so Σ due = principal exactly.
  schedule[count - 1]!.due = money.minus(principal, money.times(instalment, count - 1));
  const approved = status !== "pending_approval";
  return { id: `LN-${String(n).padStart(4, "0")}`, workerId: w.id, workerCode: w.code, workerName: w.fullName, kind, principal, instalment, startPeriod, schedule, reason, requestedBy, requestedAt, approver, approvedBy: approved ? approver : null, approvedAt: approved ? addDays(requestedAt.slice(0, 10), 1) : null, status };
}

/** Recovered = instalments on released runs. */
export function loanProgress(loan: Loan, currentReleased = S?.runs.get(CURRENT_RUN_ID)?.status === "released") {
  const done = loan.status === "pending_approval" ? [] : loan.schedule.filter((x) => x.period < CURRENT_PERIOD || (x.period === CURRENT_PERIOD && currentReleased));
  const recovered = money.sum(done.map((x) => x.due));
  const next = loan.status === "pending_approval" ? loan.schedule[0] : loan.schedule[done.length];
  return { recovered, balance: money.minus(loan.principal, recovered), paidCount: done.length, next: next ?? null };
}

const withStatus = (l: Loan): Loan => (l.status === "pending_approval" ? l : { ...l, status: loanProgress(l, false).balance === ZERO ? "completed" : "active" });

const CHECKLISTS: Record<ExitReason, { group: ChecklistItem["group"]; label: string }[]> = {
  resignation: [
    { group: "Last day", label: "Resignation letter received and notice period agreed" },
    { group: "Last day", label: "Last working day confirmed with the site supervisor" },
    { group: "Last day", label: "Removed from future rosters" },
    { group: "Government", label: "Labour card cancellation submitted (Ministry of Labour)" },
    { group: "Government", label: "Residence visa cancellation submitted (ROP)" },
    { group: "Settlement", label: "Exit ticket booked" },
  ],
  termination: [
    { group: "Last day", label: "Termination letter issued with the documented reason" },
    { group: "Last day", label: "Last working day set; assignments ended" },
    { group: "Last day", label: "Removed from future rosters" },
    { group: "Government", label: "Labour card cancellation submitted (Ministry of Labour)" },
    { group: "Government", label: "Residence visa cancellation submitted (ROP)" },
    { group: "Settlement", label: "Exit ticket booked" },
  ],
  contract_end: [
    { group: "Last day", label: "Contract end date confirmed; no renewal" },
    { group: "Last day", label: "Removed from future rosters" },
    { group: "Government", label: "Labour card cancellation completed" },
    { group: "Government", label: "Residence visa cancellation completed" },
    { group: "Settlement", label: "Exit ticket issued" },
  ],
  sponsorship_transfer: [
    { group: "Last day", label: "Transfer request from the new employer received" },
    { group: "Last day", label: "Last working day agreed with the new employer" },
    { group: "Government", label: "No-objection letter issued" },
    { group: "Government", label: "Labour card transfer completed (Ministry of Labour)" },
    { group: "Government", label: "Residence visa transfer completed (ROP)" },
  ],
  absconding: [
    { group: "Last day", label: "Absence confirmed by the site supervisor (3 site visits)" },
    { group: "Last day", label: "Pay and system access frozen from the report date" },
    { group: "Government", label: "Absconding report filed with the Ministry of Labour" },
    { group: "Government", label: "Police (ROP) informed" },
    { group: "Settlement", label: "Case reviewed: worker returned or case closed" },
  ],
  death: [
    { group: "Last day", label: "Next of kin informed and contact recorded" },
    { group: "Last day", label: "Death certificate received" },
    { group: "Government", label: "Embassy informed; repatriation arranged" },
    { group: "Government", label: "Residence visa and labour card cancelled" },
    { group: "Settlement", label: "Legal heirs' bank details verified" },
  ],
};

const ASSETS: { label: string; value: string }[] = [
  { label: "Safety helmet and boots (PPE)", value: "18.000" },
  { label: "Hand tools kit", value: "35.000" },
  { label: "Camp bed and locker key", value: "12.000" },
  { label: "Company ID card", value: "2.000" },
];

function makeExits(all: WorkerListItem[], paid: WorkerListItem[]): ExitCase[] {
  const pick = (pool: WorkerListItem[], salt: string, taken: Set<string>) => {
    const r = rng(`exit:${salt}`);
    for (;;) {
      const w = pool[r.int(0, pool.length - 1)]!;
      if (!taken.has(w.code)) return (taken.add(w.code), w);
    }
  };
  const taken = new Set<string>();
  const bench = all.filter((w) => w.status === "available");
  const specs: { reason: ExitReason; status: ExitStatus; notice: string; lwd: string; done: number; returned: number; report?: string; allows: boolean; pool: WorkerListItem[] }[] = [
    { reason: "resignation", status: "in_progress", notice: "2026-10-31", lwd: "2026-11-30", done: 2, returned: 1, allows: true, pool: paid },
    { reason: "termination", status: "awaiting_approval", notice: "2026-11-01", lwd: "2026-11-15", done: 6, returned: 3, allows: true, pool: paid },
    { reason: "sponsorship_transfer", status: "approved", notice: "2026-10-20", lwd: "2026-11-20", done: 4, returned: 4, allows: false, pool: paid },
    { reason: "absconding", status: "frozen", notice: "2026-11-02", lwd: "2026-10-30", done: 3, returned: 0, report: "2026-11-02", allows: true, pool: paid },
    { reason: "death", status: "in_progress", notice: "2026-11-04", lwd: "2026-11-04", done: 2, returned: 4, allows: false, pool: paid },
    { reason: "contract_end", status: "exited", notice: "2026-09-25", lwd: "2026-10-25", done: 99, returned: 4, allows: true, pool: bench.length ? bench : paid },
  ];
  return specs.map((sp, i) => {
    const w = pick(sp.pool, sp.reason, taken);
    const r = rng(`joined:${w.code}`);
    const joinedOn = addDays(sp.lwd, -(365 * r.int(1, 7) + r.int(0, 300)));
    const items = CHECKLISTS[sp.reason].map((c, j) => ({ ...c, id: `c${j}`, done: j < sp.done, doneBy: j < sp.done ? "hr.officer" : null, doneAt: j < sp.done ? at(addDays(sp.notice, j + 1)) : null }));
    const assets = ASSETS.map((a, j) => ({ id: `a${j}`, group: "Assets" as const, label: a.label, value: a.value, done: j < sp.returned, doneBy: j < sp.returned ? "ops.manager" : null, doneAt: j < sp.returned ? at(sp.lwd, "16:00") : null }));
    const site = siteOf({ code: w.code, status: "deployed" });
    const c: ExitCase = {
      id: `SEP-${String(41 + i).padStart(4, "0")}`, workerId: w.id, workerCode: w.code, workerName: w.fullName, trade: w.trade, nationality: w.nationality, siteName: site?.name ?? "—",
      reason: sp.reason, noticeDate: sp.notice, lastWorkingDay: sp.lwd, reportDate: sp.report ?? null, joinedOn, status: sp.status, contractAllowsAssetDeduction: sp.allows,
      checklist: [...items.slice(0, 3), ...assets, ...items.slice(3)], preparedBy: null, approvals: [], rehireEligible: sp.status === "exited" ? true : null, closedAt: sp.status === "exited" ? at("2026-10-29", "12:00") : null,
    };
    return c;
  });
}

/** Final settlement statement for an exit; each line shows how it was derived. */
export function settlementOf(e: ExitCase, loans: readonly Loan[], basic: string): Settlement {
  const daily = money.str(omr(basic).div(RULES.daily.params.divisor!));
  const lines: PayslipLine[] = [];
  const stop = e.reportDate ?? e.lastWorkingDay;
  const monthStart = dates.monthStart(stop);
  const unpaidDays = daysBetween(monthStart, stop) + (e.reason === "absconding" ? 0 : 1);
  if (unpaidDays > 0) lines.push({ componentKey: "settlement.unpaid_salary", label: "Unpaid salary", kind: "earning", amount: money.times(daily, unpaidDays), quantity: String(unpaidDays), unit: "days", rate: daily, rule: RULES.daily, sourceRef: `TS ${monthStart.slice(0, 7)} (locked)`, trace: `${unpaidDays} days worked ${dates.monthName(monthStart)} × OMR ${daily}/day (basic ÷ 30)` });
  const leaveDays = 4 + (hash(`leavebal:${e.workerCode}`) % 21);
  lines.push({ componentKey: "settlement.leave_encashment", label: "Leave encashment", kind: "earning", amount: money.times(daily, leaveDays), quantity: String(leaveDays), unit: "days", rate: daily, rule: RULES.annualLeave, sourceRef: `leave balance at ${displayDate(stop)}`, trace: `${leaveDays} unused annual-leave days × OMR ${daily}/day` });
  const serviceDays = daysBetween(e.joinedOn, stop);
  const years = omr(String(serviceDays)).div(365);
  const gratDays = years.times(RULES.gratuity.params.daysPerYear!).toFixed(2);
  lines.push({ componentKey: "settlement.gratuity", label: "End-of-service gratuity", kind: "earning", amount: money.times(daily, gratDays), quantity: gratDays, unit: "days", rate: daily, rule: RULES.gratuity, sourceRef: `service ${displayDate(e.joinedOn)} → ${displayDate(stop)}`, trace: `${years.toFixed(2)} years × ${RULES.gratuity.params.daysPerYear} days = ${gratDays} days × OMR ${daily}/day; earned up to the savings-system switch date (pending D9)` });
  if (e.reason !== "sponsorship_transfer") {
    const ticket = ["85.000", "95.000", "110.000", "125.000"][hash(`ticket:${e.nationality}`) % 4]!;
    lines.push({ componentKey: "settlement.ticket", label: e.reason === "death" ? "Repatriation ticket" : "Return ticket", kind: "earning", amount: ticket, quantity: "1", unit: "ticket", rate: ticket, rule: null, sourceRef: `contract CT-${e.workerCode.slice(2)} · ticket clause`, trace: `Economy fare to ${e.nationality}, paid by the employer under the contract` });
  }
  const owed: PayslipLine[] = [];
  for (const l of loans) {
    if (l.workerCode !== e.workerCode || l.status !== "active") continue;
    const { balance } = loanProgress(l);
    if (balance !== ZERO) owed.push({ componentKey: `settlement.${l.kind}`, label: `Outstanding ${l.kind}`, kind: "deduction", amount: balance, quantity: "1", unit: "balance", rate: balance, rule: null, sourceRef: `loan ${l.id}`, trace: `Balance of ${l.id}: OMR ${l.principal} principal less instalments recovered` });
  }
  const missing = e.checklist.filter((c) => c.group === "Assets" && !c.done);
  if (missing.length) {
    const value = money.sum(missing.map((m) => m.value ?? ZERO));
    owed.push(e.contractAllowsAssetDeduction
      ? { componentKey: "settlement.assets", label: "Unreturned assets", kind: "deduction", amount: value, quantity: String(missing.length), unit: "items", rate: null, rule: null, sourceRef: "asset register", trace: `${missing.map((m) => m.label).join(", ")}; the contract allows deducting their value` }
      : { componentKey: "settlement.assets", label: "Unreturned assets (not deducted)", kind: "deduction", amount: ZERO, quantity: String(missing.length), unit: "items", rate: null, rule: null, sourceRef: "asset register", trace: `OMR ${value} of items not returned; the contract does not allow a deduction` });
  }
  // Net is never negative: what the settlement can't cover is reported, not deducted.
  const earnings = money.sum(lines.map((l) => l.amount!));
  let room = omr(earnings);
  let unrecovered = omr(ZERO);
  for (const d of owed) {
    const want = omr(d.amount!);
    const take = want.lte(room) ? want : room;
    room = room.minus(take);
    unrecovered = unrecovered.plus(want.minus(take));
    lines.push(take.eq(want) ? d : { ...d, amount: money.str(take), trace: `${d.trace}; OMR ${money.str(want.minus(take))} could not be covered and goes to finance` });
  }
  const deductions = money.sum(lines.filter((l) => l.kind === "deduction").map((l) => l.amount!));
  const total = money.minus(earnings, deductions);
  return { lines, earnings, deductions, total, levels: levelsFor(total, RULES.settlementOwner.params.amount!), unrecovered: money.str(unrecovered) };
}

function settlementPayslip(s: Store, e: ExitCase, id: string): Payslip {
  const w = s.workers.find((x) => x.code === e.workerCode)!;
  const st = settlementOf(e, s.loans, basicWage(w));
  return finish({ id: `${id}.${w.code}`, runId: id, periodStart: "2026-10-01", workerId: w.id, workerCode: w.code, workerName: w.fullName, trade: w.trade, nationality: w.nationality, siteCode: null, siteName: e.siteName, workerStatus: "exited", paymentMethod: "wps", accountMask: maskAccount(w.code), otHours: 0, lines: st.lines });
}

function blockersOf(s: Store, run: PayrollRun): Blocker[] {
  if (run.id !== CURRENT_RUN_ID || run.status === "draft" || run.status === "released") return [];
  const out: Blocker[] = [];
  const leaving = leaversIn(s, CURRENT_PERIOD);
  for (const w of s.paid) {
    if (leaving.has(w.code)) continue;
    const h = hash(`blk:${w.code}`);
    const add = (kind: BlockerKind, severity: Blocker["severity"], detail: string) => {
      const id = `${run.id}.${kind}.${w.code}`;
      if (!s.resolved.has(id)) out.push({ id, runId: run.id, kind, severity, workerId: w.id, workerCode: w.code, workerName: w.fullName, detail });
    };
    if (h % 97 === 0) add("no_bank_account", "blocks", "No verified salary account on file; WPS needs one (or an exchange-house payment with signed acknowledgement)");
    else if (h % 89 === 1) add("invalid_iban", "blocks", `Account ${maskAccount(w.code)} fails the IBAN check digits`);
    else if (h % 101 === 2) add("no_active_contract", "blocks", "Employment contract ended 31 Oct 2026; renewal not yet signed");
    if (w.compliance.state === "expired" && w.compliance.nextExpiry) add("document_expired", "flag", `${w.compliance.nextExpiry.type.replace(/_/g, " ")} expired ${displayDate(w.compliance.nextExpiry.expiryDate)}; paid, flagged in payroll`);
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "blocks" ? -1 : 1));
}

function variancesOf(s: Store, run: PayrollRun): Variance[] {
  if (run.kind !== "regular") return [];
  const i = PERIODS.indexOf(run.period.startDate);
  if (i <= 0) return [];
  const prev = new Map(payslipsOf(s, runId(PERIODS[i - 1]!)).map((p) => [p.workerCode, p]));
  const threshold = omr(RULES.variance.params.share!);
  const out: Variance[] = [];
  for (const p of payslipsOf(s, run.id)) {
    const q = prev.get(p.workerCode);
    if (!q || omr(q.net).isZero()) continue;
    const change = omr(p.net).minus(omr(q.net));
    const ratio = change.div(omr(q.net));
    const bits: string[] = [];
    if (p.otHours !== q.otHours) bits.push(`Overtime ${p.otHours} h (was ${q.otHours} h)`);
    if (p.deductions !== q.deductions) bits.push(`Deductions OMR ${p.deductions} (was ${q.deductions})`);
    if (p.workerStatus === "on_leave") bits.push("On annual leave");
    out.push({ payslipId: p.id, workerId: p.workerId, workerCode: p.workerCode, workerName: p.workerName, siteName: p.siteName, prevNet: q.net, net: p.net, change: money.str(change), pct: ratio.times(100).toFixed(1), flagged: ratio.abs().gt(threshold), whatChanged: bits.join(" · ") || "Allowance change", reason: s.reasons.get(p.id) ?? "" });
  }
  return out.sort((a, b) => omr(b.change).abs().cmp(omr(a.change).abs()));
}

// ---------------------------------------------------------------------------
// Reads (async, through useQuery so screens show skeletons)
// ---------------------------------------------------------------------------

const ensure = (workers: WorkerListItem[]) => (S ??= init(workers));

export interface RunDetail {
  run: PayrollRun;
  payslips: Payslip[];
  blockers: Blocker[];
  variances: Variance[];
  leavers: number;
}

export interface PayslipDetail {
  payslip: Payslip;
  run: PayrollRun;
  prevId: string | null;
  nextId: string | null;
  index: number;
  count: number;
}

export interface LoanView extends Loan {
  recovered: string;
  balance: string;
  next: LoanScheduleItem | null;
  paidCount: number;
}

export interface ExitView extends ExitCase {
  settlement: Settlement;
}

function useWorkersReady() {
  const w = useWorkforce();
  return { workers: w.data, error: w.error };
}

/** Reads hand out deep copies: the store mutates in place, and React Query must see every change. */
function useDemoQuery<T>(key: readonly unknown[], fn: (s: Store) => T) {
  const { workers, error } = useWorkersReady();
  const q = useQuery({ queryKey: ["payroll", ...key], queryFn: () => delay(structuredClone(fn(ensure(workers!))), 220), enabled: !!workers });
  return { ...q, error: q.error ?? error, isPending: q.isPending || !workers };
}

const sortRuns = (runs: PayrollRun[]) => runs.sort((a, b) => b.period.startDate.localeCompare(a.period.startDate) || ["regular", "adjustment", "settlement"].indexOf(a.kind) - ["regular", "adjustment", "settlement"].indexOf(b.kind));

export const usePayrollRuns = () =>
  useDemoQuery(["runs"], (s) => ({
    runs: sortRuns([...s.runs.values()].map((r) => ({ ...r }))),
    blockers: blockersOf(s, s.runs.get(CURRENT_RUN_ID)!),
  }));

export const usePayrollRun = (id: string) =>
  useDemoQuery(["run", id], (s): RunDetail | null => {
    const run = s.runs.get(id);
    if (!run) return null;
    return { run: { ...run }, payslips: payslipsOf(s, id), blockers: blockersOf(s, run), variances: variancesOf(s, run), leavers: run.id === CURRENT_RUN_ID ? leaversIn(s, CURRENT_PERIOD).size : 0 };
  });

export const usePayslip = (id: string) =>
  useDemoQuery(["payslip", id], (s): PayslipDetail | null => {
    const rid = id.slice(0, id.lastIndexOf("."));
    const run = s.runs.get(rid);
    if (!run) return null;
    const all = payslipsOf(s, rid);
    const index = all.findIndex((p) => p.id === id);
    if (index < 0) return null;
    return { payslip: all[index]!, run: { ...run }, prevId: all[index - 1]?.id ?? null, nextId: all[index + 1]?.id ?? null, index, count: all.length };
  });

export const useWpsFiles = () =>
  useDemoQuery(["wps"], (s) => ({
    files: [...s.wps].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    responses: [...s.responses],
    /** Runs that can get a WPS file: approved or released, with none yet. */
    eligible: sortRuns([...s.runs.values()].filter((r) => (r.status === "approved" || r.status === "released") && !s.wps.some((f) => f.runId === r.id && f.kind === "full")).map((r) => ({ ...r }))),
  }));

const LOAN_ORDER: Loan["status"][] = ["pending_approval", "active", "completed"];

export const useLoans = () =>
  useDemoQuery(["loans"], (s) => ({
    loans: s.loans.map((l): LoanView => ({ ...l, ...loanProgress(l) })).sort((a, b) => LOAN_ORDER.indexOf(a.status) - LOAN_ORDER.indexOf(b.status)),
    workers: s.paid,
  }));

export const useExits = () =>
  useDemoQuery(["exits"], (s) =>
    s.exits.map((e): ExitView => ({ ...e, settlement: settlementOf(e, s.loans, basicWage(s.workers.find((w) => w.code === e.workerCode)!)) })),
  );

// ---------------------------------------------------------------------------
// Actions (the API stand-in). Each throws a plain-words Error when a rule says no.
// ---------------------------------------------------------------------------

const store = () => {
  if (!S) throw new Error("Payroll data is still loading");
  return S;
};

function needRole(account: DemoAccount | null, roles: V1Role[], what: string): asserts account is DemoAccount {
  if (!account || !roles.includes(account.role)) throw new Error(`Only ${what} can do this`);
}

function runOrThrow(id: string) {
  const run = store().runs.get(id);
  if (!run) throw new Error("Run not found");
  if (run.status === "released") throw new Error("This run is released and locked. Corrections go to the next run.");
  return run;
}

export const actions = {
  calculate({ runId: id, account }: { runId: string; account: DemoAccount | null }) {
    needRole(account, ["payroll"], "the payroll officer");
    const s = store();
    const run = runOrThrow(id);
    s.payslips.delete(id);
    run.status = "calculated";
    run.calculatedBy = account.username;
    run.calculatedAt = nowIso();
    const hadApprovals = run.approvals.length > 0;
    run.approvals = [];
    const slips = payslipsOf(s, id);
    Object.assign(run, totals(slips));
    run.levels = levelsFor(run.net!, RULES.ownerThreshold.params.amount!);
    const b = blockersOf(s, run).filter((x) => x.severity === "blocks").length;
    return `${run.period.name} calculated: ${slips.length} payslips, net ${fmt(run.net!)}${b ? `, ${b} blockers to clear` : ""}${hadApprovals ? ". Earlier approvals were cleared" : ""}`;
  },

  resolveBlockers({ runId: id, ids, account }: { runId: string; ids: string[]; account: DemoAccount | null }) {
    needRole(account, ["payroll"], "the payroll officer");
    const s = store();
    ids.forEach((b) => s.resolved.add(b));
    actions.calculate({ runId: id, account });
    return `Recalculated with ${ids.length} fix${ids.length > 1 ? "es" : ""}; ${left(blockersOf(s, s.runs.get(id)!).filter((x) => x.severity === "blocks").length)}`;
  },

  approve({ runId: id, account }: { runId: string; account: DemoAccount | null }) {
    const run = runOrThrow(id);
    if (run.status === "draft") throw new Error("Calculate the run first");
    const level = nextLevel(run.approvals, run.levels);
    if (!level) throw new Error("Already fully approved");
    const why = approvalBlock(account, level, run.calculatedBy, run.approvals);
    if (why) throw new Error(why);
    if (level === "payroll" && blockersOf(store(), run).some((b) => b.severity === "blocks")) throw new Error("Clear the blockers before sending for approval");
    run.approvals.push(approve(level, account!.username, nowIso(), run.net!, run.headcount!));
    run.status = nextLevel(run.approvals, run.levels) ? "in_review" : "approved";
    return level === "payroll" ? `${run.period.name} sent to finance for approval` : `${LEVEL_LABEL[level].replace("approves", "approved")} ${run.period.name}`;
  },

  release({ runId: id, account }: { runId: string; account: DemoAccount | null }) {
    needRole(account, ["payroll", "finance"], "payroll or finance");
    const run = runOrThrow(id);
    if (run.status !== "approved") throw new Error("The run needs every approval first");
    if (blockersOf(store(), run).some((b) => b.severity === "blocks")) throw new Error("Clear the blockers first");
    run.status = "released";
    run.releasedBy = account.username;
    run.releasedAt = nowIso();
    return `${run.period.name} released and locked: ${run.headcount} salaries, ${fmt(run.net!)}. Next: generate the WPS file.`;
  },

  setReason({ payslipId, reason }: { payslipId: string; reason: string }) {
    const s = store();
    runOrThrow(payslipId.slice(0, payslipId.lastIndexOf(".")));
    s.reasons.set(payslipId, reason.trim());
    return "Reason saved";
  },

  generateWps({ runId: id, account, rejectedOf }: { runId: string; account: DemoAccount | null; rejectedOf?: string }) {
    needRole(account, ["payroll", "finance"], "payroll or finance");
    const s = store();
    const run = s.runs.get(id);
    if (!run || (run.status !== "approved" && run.status !== "released")) throw new Error("Only an approved run can produce a WPS file");
    let file: WpsFile;
    if (rejectedOf) {
      const open = s.responses.filter((r) => r.fileId === rejectedOf && !r.resentInFileId);
      if (!open.length) throw new Error("No open rejected rows on that file");
      file = makeFile(s, run, open.map(({ payslipId, workerId, workerCode, workerName, accountMask, amount }) => ({ payslipId, workerId, workerCode, workerName, accountMask, amount })), account.username, nowIso(), "rejected_rows", rejectedOf);
      open.forEach((r) => (r.resentInFileId = file.id));
    } else {
      if (s.wps.some((f) => f.runId === id && f.kind === "full")) throw new Error("This run already has a WPS file");
      file = makeFile(s, run, rowsFor(s, id), account.username, nowIso(), "full", null);
    }
    s.wps.push(file);
    return `${file.id} ready to send: ${file.rows.length} rows, ${fmt(file.total)}`;
  },

  markSent({ fileId }: { fileId: string }) {
    const f = store().wps.find((x) => x.id === fileId);
    if (!f || f.status !== "generated") throw new Error("Only a generated file can be marked as sent");
    f.status = "sent";
    f.sentAt = nowIso();
    return `${f.id} marked as sent to Bank Muscat`;
  },

  recordAcknowledgement({ fileId }: { fileId: string }) {
    const f = store().wps.find((x) => x.id === fileId);
    if (!f || f.status !== "sent") throw new Error("Only a sent file can be acknowledged");
    f.status = "acknowledged";
    return `${f.id}: Bank Muscat accepted all ${f.rows.length} rows`;
  },

  createLoan(input: { workerCode: string; kind: Loan["kind"]; principal: string; instalments: number; reason: string; approver: string; account: DemoAccount | null }) {
    needRole(input.account, ["payroll", "hr_pro"], "payroll or HR");
    if (input.approver === input.account.username) throw new Error("Pick a different person to approve (four eyes)");
    const s = store();
    const w = s.paid.find((x) => x.code === input.workerCode);
    if (!w) throw new Error("Pick a worker on payroll");
    const loan = newLoan(s.loans.length + 1, w, input.kind, money.str(omr(input.principal)), input.instalments, dates.addMonths(CURRENT_PERIOD, 1), input.reason.trim(), input.account.username, input.approver, "pending_approval", nowIso());
    s.loans.unshift(loan);
    return `${loan.id} sent to ${accountName(input.approver)} for approval`;
  },

  approveLoan({ loanId, account }: { loanId: string; account: DemoAccount | null }) {
    const l = store().loans.find((x) => x.id === loanId);
    if (!l || l.status !== "pending_approval") throw new Error("Nothing to approve");
    const why = loanApprovalBlock(l, account);
    if (why) throw new Error(why);
    l.status = "active";
    l.approvedBy = account!.username;
    l.approvedAt = nowIso();
    return `${l.id} approved; recovery starts ${dates.monthName(l.startPeriod)}`;
  },

  toggleChecklist({ exitId, itemId, account }: { exitId: string; itemId: string; account: DemoAccount | null }) {
    const e = exitOrThrow(exitId);
    const c = e.checklist.find((x) => x.id === itemId)!;
    c.done = !c.done;
    c.doneBy = c.done ? (account?.username ?? null) : null;
    c.doneAt = c.done ? nowIso() : null;
    // An asset changes the settlement, so approvals given on the old figure no longer stand.
    const cleared = c.group === "Assets" && e.approvals.length > 0;
    if (cleared) {
      e.approvals = [];
      e.preparedBy = null;
      if (e.status !== "frozen") e.status = "in_progress";
    }
    return `${c.done ? "Done" : "Reopened"}: ${c.label}${cleared ? ". The settlement changed, so its approvals were cleared" : ""}`;
  },

  approveSettlement({ exitId, account }: { exitId: string; account: DemoAccount | null }) {
    const s = store();
    const e = exitOrThrow(exitId);
    if (e.status === "frozen") throw new Error("Pay is frozen while the absconding case is open");
    const st = settlementOf(e, s.loans, basicWage(s.workers.find((w) => w.code === e.workerCode)!));
    const level = nextLevel(e.approvals, st.levels);
    if (!level) throw new Error("Already approved");
    const why = approvalBlock(account, level, e.preparedBy, e.approvals);
    if (why) throw new Error(why);
    if (level === "payroll") e.preparedBy = account!.username;
    e.approvals.push(approve(level, account!.username, nowIso(), st.total, 1));
    e.status = nextLevel(e.approvals, st.levels) ? "awaiting_approval" : "approved";
    return level === "payroll" ? `Settlement for ${e.workerName} sent to finance` : `${LEVEL_LABEL[level].replace("approves", "approved")} the settlement for ${e.workerName}`;
  },

  closeExit({ exitId, rehire, account }: { exitId: string; rehire: boolean; account: DemoAccount | null }) {
    needRole(account, ["hr_pro", "payroll"], "HR or payroll");
    const e = exitOrThrow(exitId);
    if (e.status !== "approved") throw new Error("The settlement needs every approval first");
    if (e.checklist.some((c) => !c.done)) throw new Error("Finish the checklist first");
    e.status = "exited";
    e.rehireEligible = rehire;
    e.closedAt = nowIso();
    return `${e.workerName} is now Exited (${rehire ? "eligible for rehire" : "not eligible for rehire"})`;
  },
};

function exitOrThrow(id: string) {
  const e = store().exits.find((x) => x.id === id);
  if (!e) throw new Error("Exit not found");
  if (e.status === "exited") throw new Error("This exit is closed and locked");
  return e;
}

export function loanApprovalBlock(l: Pick<Loan, "requestedBy">, account: DemoAccount | null): string | null {
  if (!account) return "Sign in first";
  if (account.username === l.requestedBy) return "You requested this. A second person must approve it (four eyes).";
  if (account.role !== "finance" && account.role !== "owner") return "Needs finance or the owner";
  return null;
}

/** Run an action as a mutation: latency, refreshed queries, a toast with the outcome. */
export function usePayrollAction<A>(fn: (a: A) => string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: A) => delay(null, 350).then(() => fn(a)),
    onSuccess: (msg) => {
      void qc.invalidateQueries({ queryKey: ["payroll"] });
      toast.success(msg);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------------------------------------------------------------------------
// WPS file content (demo CSV, masked accounts only) and its checksum
// ---------------------------------------------------------------------------

export function wpsCsv(f: WpsFile): string {
  const head = [
    `# DEMO FILE ${f.id} - NOT A BANK MUSCAT SALARY FILE. Template: draft (D8), pending the bank's specification.`,
    `# Fictional sample data. Accounts are masked; this file cannot be used for payment.`,
    "employer_id,file_id,period,worker_code,worker_name,account,amount_omr",
  ];
  const rows = f.rows.map((r) => ["DEMO-OM-01", f.id, f.periodName, r.workerCode, `"${r.workerName}"`, r.accountMask, r.amount].join(","));
  return [...head, ...rows, `# rows ${f.rows.length}, total OMR ${f.total}`].join("\n");
}

/** SHA-256 (hex) of the file content, computed in the browser. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

