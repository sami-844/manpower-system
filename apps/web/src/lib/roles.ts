/**
 * The nine PRD roles (PRD §3, Backend Schema `roles`). Version 1 issues accounts for the six
 * office/owner/admin roles only; supervisor, client and worker accounts open in Version 2.
 *
 * Navigation is filtered by role on the client for a sensible demo, but the server stays the
 * source of truth: S3 adds role permissions and RLS in the API (CLAUDE.md rule 12).
 */
export const ROLES = ["owner", "ops_manager", "hr_pro", "payroll", "finance", "admin", "supervisor", "client", "worker"] as const;
export type Role = (typeof ROLES)[number];

export const V1_ROLES = ["owner", "ops_manager", "hr_pro", "payroll", "finance", "admin"] as const satisfies readonly Role[];
export type V1Role = (typeof V1_ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner / GM",
  ops_manager: "Operations manager",
  hr_pro: "HR / PRO officer",
  payroll: "Payroll officer",
  finance: "Accountant / finance",
  admin: "System admin",
  supervisor: "Site supervisor",
  client: "Client contact",
  worker: "Worker",
};

/** Fictional office accounts for the demo sign-in. `username` is what the API records as the actor. */
export interface DemoAccount {
  username: string;
  displayName: string;
  email: string;
  role: V1Role;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { username: "owner.gm", displayName: "Khalid Al Harthy", email: "owner@demo.mms", role: "owner" },
  { username: "ops.manager", displayName: "Sunil Varma", email: "ops@demo.mms", role: "ops_manager" },
  { username: "hr.officer", displayName: "Fatima Al Balushi", email: "hr@demo.mms", role: "hr_pro" },
  { username: "payroll.officer", displayName: "Priya Nair", email: "payroll@demo.mms", role: "payroll" },
  { username: "finance.lead", displayName: "Omar Al Rawahi", email: "finance@demo.mms", role: "finance" },
  { username: "sys.admin", displayName: "Daniel Joseph", email: "admin@demo.mms", role: "admin" },
];

/** Navigation areas (Design Brief "Layouts": the office app shell's sidebar). */
export const AREAS = [
  "today",
  "insight",
  "workforce",
  "compliance",
  "commercial",
  "operations",
  "time",
  "payroll",
  "billing",
  "finance",
  "reports",
  "admin",
  "desktop",
] as const;
export type Area = (typeof AREAS)[number];

/**
 * Which areas each V1 role sees (App Flow: "Office roles see only the desktop sections their
 * role grants (payroll staff do not see Commercial, for example)").
 */
export const ROLE_AREAS: Record<V1Role, readonly Area[]> = {
  owner: ["today", "insight", "workforce", "compliance", "commercial", "operations", "time", "payroll", "billing", "finance", "reports", "desktop"],
  ops_manager: ["today", "insight", "workforce", "compliance", "commercial", "operations", "time", "reports", "desktop"],
  hr_pro: ["today", "insight", "workforce", "compliance", "time", "payroll", "reports", "desktop"],
  payroll: ["today", "insight", "workforce", "time", "payroll", "reports", "desktop"],
  finance: ["today", "insight", "commercial", "payroll", "billing", "finance", "reports", "desktop"],
  admin: ["today", "insight", "workforce", "compliance", "commercial", "operations", "time", "payroll", "billing", "finance", "reports", "admin", "desktop"],
};

export const canSee = (role: V1Role, area: Area): boolean => ROLE_AREAS[role].includes(area);
