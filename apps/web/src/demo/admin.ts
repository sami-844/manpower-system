/**
 * DEMO DATA — admin screens until `/users`, `/roles` and `/rules` exist (Backend Schema
 * "Platform": users, user_roles, rule_tables, rule_versions). Fictional office staff; the six
 * sign-in accounts come from `DEMO_ACCOUNTS`.
 *
 * Rule values are PLACEHOLDERS, not law (CLAUDE.md rule 3): every legal version is
 * "demo · unsigned" until a named person (payroll officer, accountant, labour lawyer) signs it.
 * Only company-policy rules carry a fictional company sign-off. The savings-system start date
 * is decision D9 and stays "Pending (D9)".
 */
import { DEMO_ACCOUNTS, type Role, type V1Role } from "@/lib/roles";
import { delay } from "./core";

// ── Users (S-36) ──────────────────────────────────────────────────────────────

export type UserStatus = "active" | "invited" | "suspended";
export interface DemoUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: V1Role;
  title: string;
  scope: string;
  status: UserStatus;
  mfa: boolean;
  lastSignInAt: string | null;
}

const SIGN_IN: Record<string, string> = {
  "owner.gm": "2026-11-09T06:58:00Z",
  "ops.manager": "2026-11-09T04:31:00Z",
  "hr.officer": "2026-11-09T04:05:00Z",
  "payroll.officer": "2026-11-09T04:48:00Z",
  "finance.lead": "2026-11-09T05:12:00Z",
  "sys.admin": "2026-11-09T03:40:00Z",
};
const TITLES: Record<V1Role, string> = {
  owner: "General manager",
  ops_manager: "Operations manager",
  hr_pro: "HR / PRO officer",
  payroll: "Payroll officer",
  finance: "Finance lead",
  admin: "System administrator",
};

const users: DemoUser[] = [
  ...DEMO_ACCOUNTS.map((a, i) => ({
    id: `u-0${i + 1}`,
    username: a.username,
    displayName: a.displayName,
    email: a.email,
    role: a.role,
    title: TITLES[a.role],
    scope: "All sites and clients",
    status: "active" as const,
    mfa: true,
    lastSignInAt: SIGN_IN[a.username] ?? null,
  })),
  { id: "u-07", username: "deputy.gm", displayName: "Yousuf Al Hashmi", email: "deputy@demo.mms", role: "owner", title: "Deputy general manager", scope: "All sites and clients", status: "active", mfa: true, lastSignInAt: "2026-11-08T15:20:00Z" },
  { id: "u-08", username: "pro.desk", displayName: "Saeed Al Mamari", email: "pro.desk@demo.mms", role: "hr_pro", title: "PRO officer", scope: "All sites and clients", status: "active", mfa: true, lastSignInAt: "2026-11-09T04:12:00Z" },
  { id: "u-09", username: "hr.assistant", displayName: "Mariam Al Lawati", email: "hr.assistant@demo.mms", role: "hr_pro", title: "HR assistant", scope: "All sites and clients", status: "active", mfa: true, lastSignInAt: "2026-11-08T12:44:00Z" },
  { id: "u-10", username: "ops.sohar", displayName: "Deepa Krishnan", email: "ops.sohar@demo.mms", role: "ops_manager", title: "Operations coordinator", scope: "Sohar sites (3)", status: "active", mfa: true, lastSignInAt: "2026-11-09T03:55:00Z" },
  { id: "u-11", username: "ops.south", displayName: "Ahmed Al Zadjali", email: "ops.south@demo.mms", role: "ops_manager", title: "Operations coordinator", scope: "Duqm and Nizwa sites (2)", status: "active", mfa: false, lastSignInAt: "2026-11-07T05:02:00Z" },
  { id: "u-12", username: "timekeeper", displayName: "Rajesh Pillai", email: "timekeeper@demo.mms", role: "ops_manager", title: "Timekeeper", scope: "All sites and clients", status: "active", mfa: true, lastSignInAt: "2026-11-09T04:40:00Z" },
  { id: "u-13", username: "payroll.assistant", displayName: "Noura Al Siyabi", email: "payroll.assistant@demo.mms", role: "payroll", title: "Payroll assistant", scope: "All sites and clients", status: "active", mfa: true, lastSignInAt: "2026-11-08T10:18:00Z" },
  { id: "u-14", username: "accounts", displayName: "Thomas Varghese", email: "accounts@demo.mms", role: "finance", title: "Accountant", scope: "All sites and clients", status: "active", mfa: true, lastSignInAt: "2026-11-09T05:30:00Z" },
  { id: "u-15", username: "accounts.assistant", displayName: "Hilal Al Busaidi", email: "accounts.assistant@demo.mms", role: "finance", title: "Accounts assistant", scope: "All sites and clients", status: "invited", mfa: false, lastSignInAt: null },
  { id: "u-16", username: "payroll.former", displayName: "Lakshmi Iyer", email: "payroll.former@demo.mms", role: "payroll", title: "Payroll officer (left)", scope: "All sites and clients", status: "suspended", mfa: true, lastSignInAt: "2026-09-30T13:05:00Z" },
];

export const fetchUsers = () => delay(users.map((u) => ({ ...u })));

export async function inviteUser(input: { displayName: string; email: string; role: V1Role; scope: string }) {
  const email = input.email.trim().toLowerCase();
  if (users.some((u) => u.email === email)) throw new Error(`${email} already has an account.`);
  const u: DemoUser = {
    id: `u-${users.length + 1}`,
    username: email.split("@")[0]!,
    displayName: input.displayName.trim(),
    email,
    role: input.role,
    title: TITLES[input.role],
    scope: input.scope,
    status: "invited",
    mfa: false,
    lastSignInAt: null,
  };
  users.push(u);
  return delay(u, 300);
}

export async function setUserStatus(id: string, status: UserStatus) {
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error("User not found.");
  u.status = status;
  return delay({ ...u }, 200);
}

/** Version 2 roles: built in the API and permissions now, no accounts until Version 2 (CLAUDE.md release scope). */
export const V2_ROLES = ["supervisor", "client", "worker"] as const satisfies readonly Role[];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Reads the dashboard and approves big decisions: payroll, rate cards, write-offs, wage changes.",
  ops_manager: "Requests, roster, daily sheets and timesheets for the sites in scope.",
  hr_pro: "Worker files, documents, renewals and government transactions.",
  payroll: "Payroll runs, payslips, WPS files, advances and settlements.",
  finance: "Clients' money: invoices, receivables, ledger, supplier bills, approvals.",
  admin: "Accounts, roles, rule tables and the audit trail. No business approvals.",
  supervisor: "Marks attendance and raises issues for their own sites.",
  client: "Approves timesheets and sees invoices for their own company.",
  worker: "Sees their own payslips, roster and documents.",
};

// ── Rule tables (S-37) ────────────────────────────────────────────────────────

export interface RuleTable {
  key: string;
  name: string;
  description: string;
  ownerRole: V1Role;
  /** Company policy may be signed by the company; legal values need a named legal sign-off. */
  kind: "legal" | "policy" | "tax";
}

export interface RuleVersion {
  id: string;
  ruleKey: string;
  version: number;
  /** null while the start date is an open decision (D9). */
  validFrom: string | null;
  validTo: string | null;
  params: Record<string, unknown>;
  sourceRef: string;
  signedBy: string | null;
  signedAt: string | null;
  createdBy: string;
  createdAt: string;
  /** Seeded placeholder value: shown as "demo · unsigned". */
  demo: boolean;
  pendingDecision?: string;
}

export const RULE_TABLES: RuleTable[] = [
  { key: "overtime.day", name: "Overtime · daytime", description: "Pay multiplier for overtime hours worked in the day.", ownerRole: "payroll", kind: "legal" },
  { key: "overtime.night", name: "Overtime · night", description: "Pay multiplier for overtime hours worked at night.", ownerRole: "payroll", kind: "legal" },
  { key: "overtime.rest_day", name: "Overtime · rest day", description: "Pay for work on the weekly rest day.", ownerRole: "payroll", kind: "legal" },
  { key: "overtime.holiday", name: "Overtime · public holiday", description: "Pay for work on an official public holiday.", ownerRole: "payroll", kind: "legal" },
  { key: "hours.max_daily", name: "Maximum daily hours", description: "Normal working hours per day, and the Ramadan reduction.", ownerRole: "ops_manager", kind: "legal" },
  { key: "leave.annual", name: "Annual leave", description: "Paid annual leave entitlement and how it accrues.", ownerRole: "hr_pro", kind: "legal" },
  { key: "leave.sick", name: "Sick leave", description: "Sick-leave bands and the share of pay in each band.", ownerRole: "hr_pro", kind: "legal" },
  { key: "gratuity.rate", name: "End-of-service gratuity", description: "Gratuity earned per year of service, up to the savings-system switch.", ownerRole: "payroll", kind: "legal" },
  { key: "deduction.cap", name: "Deduction cap", description: "Most that can be deducted from one month's wage.", ownerRole: "payroll", kind: "legal" },
  { key: "savings.rate", name: "Savings system contribution", description: "Employer contribution to the savings system that replaces gratuity.", ownerRole: "payroll", kind: "legal" },
  { key: "spf.sick_leave_insurance", name: "Sick-leave insurance (SPF)", description: "Employer contribution for sick-leave insurance.", ownerRole: "payroll", kind: "legal" },
  { key: "vat.standard", name: "VAT standard rate", description: "Output VAT on invoices.", ownerRole: "finance", kind: "tax" },
  { key: "approval.owner_threshold", name: "Owner approval threshold", description: "Above this amount, the owner must approve a payment, write-off or settlement.", ownerRole: "owner", kind: "policy" },
  { key: "renewal.tiers", name: "Renewal reminder tiers", description: "Days before expiry when HR is reminded to renew a document.", ownerRole: "hr_pro", kind: "policy" },
];

const LEGAL_SOURCE = "Labour Law (Royal Decree 53/2023) · article to be confirmed by labour lawyer";
const v = (ruleKey: string, version: number, validFrom: string | null, validTo: string | null, params: Record<string, unknown>, extra: Partial<RuleVersion> = {}): RuleVersion => ({
  id: `${ruleKey}#${version}`,
  ruleKey,
  version,
  validFrom,
  validTo,
  params,
  sourceRef: LEGAL_SOURCE,
  signedBy: null,
  signedAt: null,
  createdBy: "sys.admin",
  createdAt: "2026-06-02T08:00:00Z",
  demo: true,
  ...extra,
});

const versions: RuleVersion[] = [
  v("overtime.day", 1, "2023-07-01", "2026-12-31", { multiplier: "1.25" }),
  v("overtime.day", 2, "2027-01-01", null, { multiplier: "1.25", minimumBlockMinutes: 30 }),
  v("overtime.night", 1, "2023-07-01", null, { multiplier: "1.50", nightStarts: "21:00", nightEnds: "06:00" }),
  v("overtime.rest_day", 1, "2023-07-01", null, { multiplier: "2.00", orDayOff: true }),
  v("overtime.holiday", 1, "2023-07-01", null, { multiplier: "2.00", orDayOff: true }),
  v("hours.max_daily", 1, "2023-07-01", null, { normalHours: 9, ramadanHours: 6, maxWithOvertime: 12 }),
  v("leave.annual", 1, "2023-07-01", null, { daysPerYear: 30, accrual: "monthly", carryOverMax: 15 }),
  v("leave.sick", 1, "2023-07-01", null, { bands: [{ days: 21, pay: "1.00" }, { days: 21, pay: "0.75" }, { days: 42, pay: "0.50" }] }),
  v("gratuity.rate", 1, "2023-07-01", null, { firstThreeYears: "15 days per year", afterThreeYears: "30 days per year", basis: "basic wage" }),
  v("deduction.cap", 1, "2023-07-01", null, { maxShareOfBasic: "0.50" }),
  v("savings.rate", 1, null, null, { ratePercent: 9, basis: "basic wage" }, { sourceRef: "Social Protection Law · start date is decision D9", pendingDecision: "D9" }),
  v("spf.sick_leave_insurance", 1, "2024-07-01", null, { ratePercent: 1 }, { sourceRef: "Social Protection Law · rate to be confirmed by payroll and accountant" }),
  v("vat.standard", 1, "2021-04-16", null, { ratePercent: 5 }, { sourceRef: "VAT Law (Royal Decree 121/2020)", signedBy: "finance.lead", signedAt: "2026-06-10T07:30:00Z", demo: false }),
  v("approval.owner_threshold", 1, "2026-01-01", "2026-06-30", { amount: "10000.000" }, { sourceRef: "Board minute 2025-12 (company policy)", signedBy: "owner.gm", signedAt: "2025-12-18T06:00:00Z", demo: false }),
  v("approval.owner_threshold", 2, "2026-07-01", null, { amount: "5000.000" }, { sourceRef: "Board minute 2026-06 (company policy)", signedBy: "owner.gm", signedAt: "2026-06-24T06:00:00Z", demo: false }),
  v("renewal.tiers", 1, "2026-01-01", null, { daysBefore: [90, 60, 30, 7] }, { sourceRef: "HR procedure HR-07 (company policy)", signedBy: "hr.officer", signedAt: "2026-01-05T05:00:00Z", demo: false }),
];

export const fetchRuleVersions = () => delay(versions.map((x) => ({ ...x })));

export type VersionState = "in_force" | "scheduled" | "superseded" | "pending_decision";
export function versionState(x: RuleVersion, today: string): VersionState {
  if (!x.validFrom) return "pending_decision";
  if (x.validFrom > today) return "scheduled";
  if (x.validTo && x.validTo < today) return "superseded";
  return "in_force";
}

const dayBefore = (d: string) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};

/**
 * Checks a new version against the existing ones (rule_versions: no overlaps). An open-ended
 * latest version is closed the day before the new one starts; any other overlap is refused.
 * Returns the problem in plain words, or the version that would be closed.
 */
export function checkNewVersion(ruleKey: string, validFrom: string, validTo: string | null, all: readonly RuleVersion[]): { error: string } | { closes: RuleVersion | null } {
  if (validTo && validTo < validFrom) return { error: "The end date is before the start date." };
  const mine = all.filter((x) => x.ruleKey === ruleKey && x.validFrom);
  const latest = mine.reduce<RuleVersion | null>((a, b) => (!a || b.validFrom! > a.validFrom! ? b : a), null);
  if (latest && validFrom <= latest.validFrom!) return { error: `Must start after v${latest.version} begins (${latest.validFrom}). Earlier dates would rewrite pay already calculated.` };
  for (const x of mine) {
    if (x === latest && !x.validTo) continue;
    const end = x.validTo ?? "9999-12-31";
    if (validFrom <= end && (validTo ?? "9999-12-31") >= x.validFrom!) return { error: `Overlaps v${x.version} (${x.validFrom} to ${x.validTo ?? "open"}).` };
  }
  return { closes: latest && !latest.validTo ? latest : null };
}

export async function addRuleVersion(input: { ruleKey: string; validFrom: string; validTo: string | null; params: Record<string, unknown>; sourceRef: string; by: string }) {
  const check = checkNewVersion(input.ruleKey, input.validFrom, input.validTo, versions);
  if ("error" in check) throw new Error(check.error);
  if (check.closes) check.closes.validTo = dayBefore(input.validFrom);
  const n = Math.max(0, ...versions.filter((x) => x.ruleKey === input.ruleKey).map((x) => x.version)) + 1;
  const created: RuleVersion = {
    id: `${input.ruleKey}#${n}`,
    ruleKey: input.ruleKey,
    version: n,
    validFrom: input.validFrom,
    validTo: input.validTo,
    params: input.params,
    sourceRef: input.sourceRef,
    signedBy: null,
    signedAt: null,
    createdBy: input.by,
    createdAt: new Date().toISOString(),
    demo: false,
  };
  versions.push(created);
  return delay(created, 300);
}

export async function signRuleVersion(id: string, by: string) {
  const x = versions.find((r) => r.id === id);
  if (!x) throw new Error("Version not found.");
  if (x.pendingDecision) throw new Error(`Waiting on decision ${x.pendingDecision}: the start date is not set.`);
  if (x.createdBy === by) throw new Error("You created this version, so someone else must sign it.");
  x.signedBy = by;
  x.signedAt = new Date().toISOString();
  x.demo = false;
  return delay({ ...x }, 300);
}

// ── Integration health (S-38) ─────────────────────────────────────────────────

export interface Integration {
  id: string;
  name: string;
  purpose: string;
  status: "ok" | "degraded" | "pending";
  statusText: string;
  detail: string;
  lastCheckAt: string | null;
}

export const INTEGRATIONS: Integration[] = [
  { id: "wps", name: "Bank Muscat WPS", purpose: "Salary files", status: "pending", statusText: "Pending D8", detail: "Upload channel and file format wait on decision D8. Files are generated and uploaded by hand.", lastCheckAt: null },
  { id: "whatsapp", name: "WhatsApp Business", purpose: "Payslips, reminders, approval links", status: "ok", statusText: "Healthy", detail: "1,284 messages delivered in the last 24 hours, 3 failed and retried by SMS.", lastCheckAt: "2026-11-09T07:00:00Z" },
  { id: "email", name: "Email (Amazon SES)", purpose: "Timesheet packs, invoices, digests", status: "ok", statusText: "Healthy", detail: "Bounce rate 0.4%. Domain verified.", lastCheckAt: "2026-11-09T07:00:00Z" },
  { id: "cognito", name: "Amazon Cognito", purpose: "Sign-in and MFA", status: "ok", statusText: "Healthy", detail: "Demo sign-in in this build; the user pool is wired in S2.", lastCheckAt: "2026-11-09T06:55:00Z" },
  { id: "s3", name: "Amazon S3 + virus scan", purpose: "Document scans and photos", status: "degraded", statusText: "Slow", detail: "Scan queue is 4 minutes behind. Uploads stay quarantined until scanned.", lastCheckAt: "2026-11-09T07:05:00Z" },
  { id: "backups", name: "Database backups", purpose: "Nightly snapshot, point-in-time recovery", status: "ok", statusText: "Healthy", detail: "Last snapshot 02:00 today. Restore last tested on 1 Nov.", lastCheckAt: "2026-11-09T02:00:00Z" },
];
export const fetchIntegrations = () => delay(INTEGRATIONS.map((i) => ({ ...i })), 300);
