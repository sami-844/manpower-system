/**
 * DEMO DATA — in-app notifications (Backend Schema `notifications`) and the approvals count
 * shown in the sidebar. Fictional. Read state changes in the session through
 * `markNotificationsRead`; the Notifications screen (S-04) reads them with `fetchNotifications`.
 */
import { delay } from "./core";

export type NotificationKind = "renewal" | "approval" | "timesheet" | "payroll" | "billing" | "system";

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  approval: "Approvals",
  renewal: "Renewals",
  timesheet: "Timesheets",
  payroll: "Payroll",
  billing: "Billing",
  system: "System",
};

export interface DemoNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Route that opens the subject. */
  to: string;
  at: string; // ISO timestamp
  read: boolean;
}

export const NOTIFICATIONS: DemoNotification[] = [
  { id: "n1", kind: "approval", title: "New contract for Seeb Logistics Park awaits your approval", body: "40 workers from 1 Dec · reviewed by operations and finance.", to: "/approvals", at: "2026-11-09T07:12:00Z", read: false },
  { id: "n2", kind: "renewal", title: "6 residence visas expire within 7 days", body: "Two workers are deployed at Sohar Port Phase 3.", to: "/renewals", at: "2026-11-09T05:30:00Z", read: false },
  { id: "n3", kind: "timesheet", title: "Daily sheet missing for Duqm Breakwater", body: "No photo filed for 8 Nov. The supervisor has been sent a reminder.", to: "/attendance", at: "2026-11-09T04:00:00Z", read: false },
  { id: "n4", kind: "billing", title: "Wadi Infrastructure Co. is over its credit limit", body: "OMR 27,410.250 outstanding against a 25,000.000 limit.", to: "/receivables", at: "2026-11-08T13:20:00Z", read: false },
  { id: "n5", kind: "approval", title: "Rate card v3 for Coastal Marine Works needs a second approver", body: "Requested by finance.lead.", to: "/approvals", at: "2026-11-08T10:05:00Z", read: true },
  { id: "n8", kind: "approval", title: "Wage change for Anil Menon (W-000381) needs approval", body: "Requested by hr.officer · basic +OMR 20.000 from 1 Nov.", to: "/approvals", at: "2026-11-07T08:15:00Z", read: true },
  { id: "n9", kind: "timesheet", title: "Gulf Build LLC signed the week 44 timesheet pack", body: "Sohar Port Phase 3 · 121 workers · locked automatically.", to: "/timesheet-packs", at: "2026-11-06T11:02:00Z", read: true },
  { id: "n10", kind: "renewal", title: "Medical fitness due for 11 workers this month", body: "Clinic slots booked for 12 and 13 Nov.", to: "/renewals", at: "2026-11-05T06:30:00Z", read: true },
  { id: "n6", kind: "payroll", title: "WPS file accepted by Bank Muscat", body: "September 2026 run · 671 accepted, 0 rejected.", to: "/wps", at: "2026-10-04T09:15:00Z", read: true },
  { id: "n7", kind: "system", title: "Audit chain verified", body: "Nightly check passed for every event.", to: "/admin/audit", at: "2026-11-09T01:00:00Z", read: true },
];

export const unreadCount = NOTIFICATIONS.filter((n) => !n.read).length;

/** Items waiting in the Approvals inbox (S-33). Kept in step with the Approvals demo list (checked in ./insight.ts). */
export const pendingApprovalsCount = 5;

const readInSession = new Set<string>();

export const fetchNotifications = () =>
  delay(
    NOTIFICATIONS.map((n) => ({ ...n, read: n.read || readInSession.has(n.id) })).sort((a, b) => (a.at < b.at ? 1 : -1)),
    200,
  );

export async function markNotificationsRead(ids: readonly string[]) {
  for (const id of ids) readInSession.add(id);
  return delay(ids.length, 120);
}
