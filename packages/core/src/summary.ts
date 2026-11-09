import { daysBetween, type CalendarDate } from "./dates";
import {
  DEFAULT_COMPLIANCE_RULES,
  latestByType,
  type ComplianceRules,
  type DocumentType,
  type WorkerDocument,
} from "./compliance";
import { DEFAULT_RENEWAL_TIERS } from "./renewals";

export type WorkerComplianceState = "ok" | "due" | "incomplete" | "expired";

export interface WorkerComplianceSummary {
  state: WorkerComplianceState;
  missing: DocumentType[];
  nextExpiry: { type: DocumentType; expiryDate: CalendarDate; daysLeft: number } | null;
}

/** One status per worker for lists and dashboards, from their mandatory documents. */
export function summariseWorkerCompliance(
  documents: readonly WorkerDocument[],
  today: CalendarDate,
  rules: ComplianceRules = DEFAULT_COMPLIANCE_RULES,
): WorkerComplianceSummary {
  const latest = latestByType(documents);
  const missing: DocumentType[] = [];
  let nextExpiry: WorkerComplianceSummary["nextExpiry"] = null;

  for (const type of rules.mandatoryDocuments) {
    const doc = latest.get(type);
    if (!doc || doc.expiryDate === null) {
      missing.push(type);
      continue;
    }
    if (!nextExpiry || doc.expiryDate < nextExpiry.expiryDate) {
      nextExpiry = { type, expiryDate: doc.expiryDate, daysLeft: daysBetween(today, doc.expiryDate) };
    }
  }

  const widestTier = Math.max(...DEFAULT_RENEWAL_TIERS);
  const state: WorkerComplianceState =
    nextExpiry && nextExpiry.daysLeft < 0
      ? "expired"
      : missing.length > 0
        ? "incomplete"
        : nextExpiry && nextExpiry.daysLeft <= widestTier
          ? "due"
          : "ok";

  return { state, missing, nextExpiry };
}
