/**
 * DEMO DATA — government transactions (S-10) and compliance overrides (S-11) until their APIs
 * arrive. Shapes follow docs/spec/07-Backend-Schema.md (`gov_transactions`,
 * `compliance_overrides`). People are the REAL workers from `/api/workers`, so every name opens
 * the real worker file. Deterministic (seeded `rng`), and changes made in the session (start a
 * renewal, approve an override through the real API) live in the in-memory store below.
 */
import type { DocumentType } from "@mms/core";
import type { WorkerListItem } from "@/lib/api";
import { dates, delay, hash, money, rng, todayOman } from "./core";

// ---------------------------------------------------------------------------
// Government transactions (PRD 4.3: "who is waiting on whom")
// ---------------------------------------------------------------------------

export const GOV_TYPES = ["visa_new", "visa_renewal", "labour_card", "transfer", "cancellation", "clearance"] as const;
export type GovType = (typeof GOV_TYPES)[number];
export const GOV_TYPE_LABELS: Record<GovType, string> = {
  visa_new: "New visa",
  visa_renewal: "Visa renewal",
  labour_card: "Labour card",
  transfer: "Transfer",
  cancellation: "Cancellation",
  clearance: "Work-permit clearance",
};

export type GovStatus = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "completed";
export const GOV_STATUS_LABELS: Record<GovStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

export type WaitingOn = "company" | "ministry" | "worker";
export const WAITING_LABELS: Record<WaitingOn, string> = { company: "Company", ministry: "Ministry", worker: "Worker" };

export interface GovTransaction {
  id: string;
  workerId: string;
  workerName: string;
  workerCode: string;
  type: GovType;
  reference: string | null;
  status: GovStatus;
  waitingOn: WaitingOn | null;
  /** When the ball last changed hands (drives "waiting 12 days"). */
  waitingSince: string | null;
  fees: string;
  submittedOn: string | null;
  completedOn: string | null;
  /** The document this application renews, when there is one. */
  documentId: string | null;
  documentType: DocumentType | null;
  note: string;
  createdBy: string;
}

const NOTES: Record<WaitingOn, string[]> = {
  company: ["Pay the renewal fee on the portal", "Upload the new medical result", "Sign the employer undertaking", "Attach the updated contract"],
  ministry: ["Under review at the ministry", "Awaiting card print", "Queued for officer approval", "Biometrics booked"],
  worker: ["Collect passport from site for stamping", "Worker to attend medical test", "Worker to sign the transfer consent", "Worker to bring two photos"],
};

const FEES: Record<GovType, [string, string]> = {
  visa_new: ["180.000", "240.000"],
  visa_renewal: ["140.000", "210.000"],
  labour_card: ["95.000", "140.000"],
  transfer: ["110.000", "160.000"],
  cancellation: ["15.000", "30.000"],
  clearance: ["45.000", "80.000"],
};

const reference = (type: GovType, seed: string) =>
  `${type.startsWith("visa") ? "ROP" : "MOL"}-2026-${String(100000 + (hash(seed) % 900000))}`;

let govStore: GovTransaction[] | null = null;

function seedGov(workers: readonly WorkerListItem[]): GovTransaction[] {
  const r = rng("gov-transactions");
  const today = todayOman();
  const out: GovTransaction[] = [];
  const used = new Set<string>();
  const add = (w: WorkerListItem, type: GovType, status: GovStatus, docType: DocumentType | null) => {
    used.add(w.id);
    const submittedOn = status === "draft" ? null : dates.addDays(today, -r.int(3, 40));
    const open = status !== "completed" && status !== "rejected";
    const waitingOn: WaitingOn | null = open ? (status === "draft" ? "company" : r.pick(["company", "ministry", "ministry", "worker"] as const)) : null;
    out.push({
      id: `gt-${String(out.length + 1).padStart(4, "0")}`,
      workerId: w.id,
      workerName: w.fullName,
      workerCode: w.code,
      type,
      reference: submittedOn ? reference(type, `${w.code}:${type}`) : null,
      status,
      waitingOn,
      waitingSince: waitingOn ? dates.addDays(today, -r.int(0, 18)) : null,
      fees: money.between(r, FEES[type][0], FEES[type][1], "0.500"),
      submittedOn,
      completedOn: open ? null : dates.addDays(today, -r.int(0, 2)),
      documentId: null,
      documentType: docType,
      note: waitingOn ? r.pick(NOTES[waitingOn]) : status === "rejected" ? "Rejected: photo did not meet the standard. Resubmit." : "Card collected and filed",
      createdBy: r.pick(["hr.officer", "hr.officer", "sys.admin"]),
    });
  };

  // Renewals already under way for papers that are expired or due inside 60 days.
  for (const w of workers) {
    const next = w.compliance.nextExpiry;
    if (!next || next.daysLeft > 60 || !["residence_visa", "labour_card", "medical"].includes(next.type)) continue;
    if (!r.chance(0.55)) continue;
    const type: GovType = next.type === "labour_card" ? "labour_card" : "visa_renewal";
    add(w, type, r.pick(["draft", "submitted", "submitted", "in_review", "in_review", "approved"] as const), next.type);
  }
  // Recently closed applications, transfers, clearances and new visas.
  const others = workers.filter((w) => !used.has(w.id) && w.compliance.state === "ok");
  const pickOther = () => others.splice(r.int(0, others.length - 1), 1)[0];
  const extra: [GovType, GovStatus, number][] = [
    ["visa_renewal", "completed", 9],
    ["labour_card", "completed", 5],
    ["transfer", "in_review", 3],
    ["transfer", "completed", 2],
    ["clearance", "submitted", 4],
    ["visa_new", "in_review", 3],
    ["cancellation", "submitted", 2],
    ["visa_renewal", "rejected", 1],
  ];
  for (const [type, status, n] of extra) {
    for (let i = 0; i < n; i++) {
      const w = pickOther();
      if (w) add(w, type, status, type === "visa_renewal" ? "residence_visa" : type === "labour_card" ? "labour_card" : null);
    }
  }
  return out;
}

function gov(workers: readonly WorkerListItem[]): GovTransaction[] {
  if (!govStore && workers.length) govStore = seedGov(workers);
  return govStore ?? [];
}

export const GOV_QUERY_KEY = ["demo", "gov-transactions"] as const;

export const listGovTransactions = (workers: readonly WorkerListItem[]) => delay([...gov(workers)]);

/** Which application renews a document (S-09 "Start renewal"); null when the worker renews it directly. */
export function renewalTypeFor(doc: DocumentType): GovType | null {
  if (doc === "residence_visa" || doc === "medical" || doc === "civil_id") return "visa_renewal";
  if (doc === "labour_card") return "labour_card";
  return null;
}

export function createGovTransaction(input: {
  worker: Pick<WorkerListItem, "id" | "fullName" | "code">;
  type: GovType;
  documentId?: string | null;
  documentType?: DocumentType | null;
  createdBy: string;
  allWorkers: readonly WorkerListItem[];
}): Promise<GovTransaction> {
  const list = gov(input.allWorkers);
  const today = todayOman();
  const tx: GovTransaction = {
    id: `gt-${String(list.length + 1).padStart(4, "0")}`,
    workerId: input.worker.id,
    workerName: input.worker.fullName,
    workerCode: input.worker.code,
    type: input.type,
    reference: null,
    status: "draft",
    waitingOn: "company",
    waitingSince: today,
    fees: money.between(rng(`fee:${input.worker.code}:${input.type}`), FEES[input.type][0], FEES[input.type][1]),
    submittedOn: null,
    completedOn: null,
    documentId: input.documentId ?? null,
    documentType: input.documentType ?? null,
    note: "Prepare the application and pay the fee",
    createdBy: input.createdBy,
  };
  list.unshift(tx);
  return delay(tx, 350);
}

/** Move an application on: who it is waiting on now, or close it. */
export function updateGovTransaction(id: string, change: { waitingOn?: WaitingOn; status?: GovStatus }): Promise<GovTransaction | undefined> {
  const tx = govStore?.find((t) => t.id === id);
  if (!tx) return delay(undefined);
  const today = todayOman();
  if (change.status) {
    tx.status = change.status;
    if (change.status === "submitted" && !tx.submittedOn) {
      tx.submittedOn = today;
      tx.reference = reference(tx.type, `${tx.workerCode}:${tx.type}:${tx.id}`);
      tx.waitingOn = "ministry";
      tx.waitingSince = today;
      tx.note = NOTES.ministry[0]!;
    }
    if (change.status === "completed" || change.status === "rejected") {
      tx.completedOn = today;
      tx.waitingOn = null;
      tx.waitingSince = null;
      tx.note = change.status === "completed" ? "Closed" : "Rejected — resubmit with corrections";
    }
  }
  if (change.waitingOn) {
    tx.waitingOn = change.waitingOn;
    tx.waitingSince = today;
    tx.note = NOTES[change.waitingOn][0]!;
  }
  return delay({ ...tx }, 300);
}

// ---------------------------------------------------------------------------
// Compliance overrides (rule 5: records with who, why and until when)
// ---------------------------------------------------------------------------

/** Blocker codes an override may lift (the API's `overrideSchema`; WORKER_NOT_ACTIVE never can). */
export const OVERRIDE_CODES = ["MISSING_DOCUMENT", "DOCUMENT_EXPIRED", "DOCUMENT_EXPIRES_DURING_PERIOD", "EXPIRY_DATE_MISSING", "LEAVE_OVERLAP"] as const;
export type OverrideCode = (typeof OVERRIDE_CODES)[number];
export const OVERRIDE_CODE_LABELS: Record<OverrideCode, string> = {
  MISSING_DOCUMENT: "Document missing",
  DOCUMENT_EXPIRED: "Document expired",
  DOCUMENT_EXPIRES_DURING_PERIOD: "Expires during the period",
  EXPIRY_DATE_MISSING: "Expiry date missing",
  LEAVE_OVERLAP: "Overlaps approved leave",
};

export interface OverrideRecord {
  id: string;
  workerId: string;
  workerName: string;
  workerCode: string;
  code: OverrideCode;
  documentType: DocumentType | null;
  validUntil: string;
  reason: string;
  requestedBy: string;
  requestedOn: string;
  approvedBy: string | null;
  approvedOn: string | null;
  /** "api" rows were approved through the real `POST /api/workers/:id/overrides` in this session. */
  source: "sample" | "api";
}

export type OverrideState = "awaiting" | "active" | "ended";
export function overrideState(o: OverrideRecord, today = todayOman()): OverrideState {
  if (!o.approvedBy) return "awaiting";
  return o.validUntil >= today ? "active" : "ended";
}

const REASONS = [
  "Renewal submitted to the ministry; receipt on file. Client needs the crew for the slab pour.",
  "New medical booked for Thursday; result expected before the period ends.",
  "Labour card printed, collection delayed by the ministry. Copy of approval attached.",
  "Visa stamped yesterday, scan not yet uploaded. HR to upload by end of week.",
  "Emergency shutdown work at the client's request; renewal fee paid.",
];

let overrideStore: OverrideRecord[] | null = null;

function seedOverrides(workers: readonly WorkerListItem[]): OverrideRecord[] {
  const r = rng("overrides");
  const today = todayOman();
  const due = workers.filter((w) => w.status === "deployed" && w.compliance.nextExpiry && w.compliance.nextExpiry.daysLeft <= 30);
  const out: OverrideRecord[] = [];
  due.slice(0, 12).forEach((w, i) => {
    const next = w.compliance.nextExpiry!;
    const state: OverrideState = i < 2 ? "awaiting" : i < 7 ? "active" : "ended";
    const requestedOn = dates.addDays(today, state === "ended" ? -r.int(20, 45) : -r.int(0, 6));
    out.push({
      id: `ov-${String(i + 1).padStart(3, "0")}`,
      workerId: w.id,
      workerName: w.fullName,
      workerCode: w.code,
      code: next.daysLeft < 0 ? "DOCUMENT_EXPIRED" : "DOCUMENT_EXPIRES_DURING_PERIOD",
      documentType: next.type,
      validUntil: state === "ended" ? dates.addDays(today, -r.int(1, 15)) : dates.addDays(today, r.int(2, 14)),
      reason: r.pick(REASONS),
      requestedBy: "hr.officer",
      requestedOn,
      approvedBy: state === "awaiting" ? null : "ops.manager",
      approvedOn: state === "awaiting" ? null : [dates.addDays(requestedOn, r.int(0, 1)), today].sort()[0]!,
      source: "sample",
    });
  });
  return out;
}

function overrides(workers: readonly WorkerListItem[]): OverrideRecord[] {
  if (!overrideStore && workers.length) overrideStore = seedOverrides(workers);
  return overrideStore ?? [];
}

export const OVERRIDES_QUERY_KEY = ["demo", "overrides"] as const;

export const listOverrides = (workers: readonly WorkerListItem[]) => delay([...overrides(workers)]);

/** HR asks; the operations manager approves (four eyes). */
export function requestOverride(input: Omit<OverrideRecord, "id" | "approvedBy" | "approvedOn" | "source" | "requestedOn">, allWorkers: readonly WorkerListItem[]) {
  const list = overrides(allWorkers);
  const row: OverrideRecord = { ...input, id: `ov-${String(list.length + 1).padStart(3, "0")}`, requestedOn: todayOman(), approvedBy: null, approvedOn: null, source: "sample" };
  list.unshift(row);
  return delay(row, 300);
}

/** Record an override the real API has just approved, closing the request it answered (if any). */
export function recordApprovedOverride(
  input: Omit<OverrideRecord, "id" | "approvedOn" | "source" | "requestedOn" | "requestedBy"> & { approvedBy: string; requestId?: string },
  allWorkers: readonly WorkerListItem[],
) {
  const list = overrides(allWorkers);
  const today = todayOman();
  const existing = input.requestId ? list.find((o) => o.id === input.requestId) : undefined;
  if (existing) {
    Object.assign(existing, { code: input.code, documentType: input.documentType, validUntil: input.validUntil, reason: input.reason, approvedBy: input.approvedBy, approvedOn: today, source: "api" as const });
    return delay({ ...existing });
  }
  const row: OverrideRecord = { ...input, id: `ov-${String(list.length + 1).padStart(3, "0")}`, requestedBy: input.approvedBy, requestedOn: today, approvedOn: today, source: "api" };
  list.unshift(row);
  return delay(row);
}
