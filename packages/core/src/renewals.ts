import { daysBetween, type CalendarDate } from "./dates";
import type { DocumentType } from "./compliance";

/** Alert tiers in days before expiry (PRD 4.3). */
export const DEFAULT_RENEWAL_TIERS = [90, 60, 30, 7] as const;

export type RenewalState = "expired" | "due" | "ok";

export interface RenewalStatus {
  state: RenewalState;
  daysLeft: number;
  /** The tightest tier the document has entered; 0 when expired, null when ok. */
  tier: number | null;
}

export function renewalStatus(
  expiryDate: CalendarDate,
  today: CalendarDate,
  tiers: readonly number[] = DEFAULT_RENEWAL_TIERS,
): RenewalStatus {
  const daysLeft = daysBetween(today, expiryDate);
  if (daysLeft < 0) return { state: "expired", daysLeft, tier: 0 };
  const ascending = [...tiers].sort((a, b) => a - b);
  const tier = ascending.find((t) => daysLeft <= t);
  return tier === undefined ? { state: "ok", daysLeft, tier: null } : { state: "due", daysLeft, tier };
}

export interface RenewableDocument {
  id: string;
  workerId: string;
  type: DocumentType;
  expiryDate: CalendarDate | null;
}

export type RenewalQueueItem<T extends RenewableDocument = RenewableDocument> = T & RenewalStatus;

/** HR/PRO's morning list: expired and due documents, most urgent first. */
export function buildRenewalQueue<T extends RenewableDocument>(
  documents: readonly T[],
  today: CalendarDate,
  tiers: readonly number[] = DEFAULT_RENEWAL_TIERS,
): RenewalQueueItem<T>[] {
  return documents
    .filter((d): d is T & { expiryDate: CalendarDate } => d.expiryDate !== null)
    .map((d) => ({ ...d, ...renewalStatus(d.expiryDate, today, tiers) }))
    .filter((d) => d.state !== "ok")
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
