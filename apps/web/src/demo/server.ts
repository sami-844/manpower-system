/**
 * HOSTED DEMO API — a browser stand-in for `apps/api`, used ONLY by the Cloudflare demo build
 * (`vite build --mode demo`, see `lib/api.ts`). The hosted demo has no PostgreSQL, so the
 * thirteen endpoints the web app calls are answered here, in memory, per visitor. A reload
 * starts a fresh demo; nothing leaves the browser.
 *
 * It is not a second backend: every rule comes from `@mms/core` (the same engines the API
 * calls), the validation mirrors the API's zod schemas (`apps/api/src/workers/workers.service.ts`,
 * `compliance/compliance.service.ts`), and the people come from the same fictional recipe as
 * `apps/api/src/db/seed.ts` (CLAUDE.md rule 10: no real personal data). If an API endpoint
 * changes, change it here too; `server.test.ts` pins the shared behaviour.
 */
import {
  addDays,
  buildRenewalQueue,
  checkEligibility,
  daysBetween,
  DOCUMENT_TYPES,
  isValidDate,
  renewalStatus,
  summariseWorkerCompliance,
  WORKER_STATUSES,
  type BlockerCode,
  type DocumentType,
  type WorkerStatus,
} from "@mms/core";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { todayOman } from "./core";

// ---- Validation (mirrors apps/api) -------------------------------------------------------

const calendarDate = z.string().refine(isValidDate, { message: "Must be a real date in YYYY-MM-DD format" });
const uuid = z.string().uuid();

const createWorkerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  fullNameAr: z.string().trim().max(120).optional(),
  nationality: z.string().trim().min(2).max(60),
  trade: z.string().trim().min(2).max(60),
  status: z.enum(WORKER_STATUSES).default("available"),
  phone: z.string().trim().max(30).optional(),
  dateOfBirth: calendarDate.optional(),
  joinedOn: calendarDate.optional(),
});
const addDocumentSchema = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    number: z.string().trim().max(60).optional(),
    issueDate: calendarDate.optional(),
    expiryDate: calendarDate.nullable().optional(),
    verified: z.boolean().default(false),
  })
  .refine((d) => !d.issueDate || !d.expiryDate || d.issueDate <= d.expiryDate, {
    message: "Expiry date must be on or after the issue date",
    path: ["expiryDate"],
  });
const listWorkersSchema = z.object({
  search: z.string().trim().max(60).optional(),
  status: z.enum(WORKER_STATUSES).optional(),
  compliance: z.enum(["ok", "due", "incomplete", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
const addLeaveSchema = z
  .object({ fromDate: calendarDate, toDate: calendarDate })
  .refine((l) => l.fromDate <= l.toDate, { message: "Leave must end on or after it starts", path: ["toDate"] });
const BLOCKER_CODES = [
  "MISSING_DOCUMENT",
  "DOCUMENT_EXPIRED",
  "DOCUMENT_EXPIRES_DURING_PERIOD",
  "EXPIRY_DATE_MISSING",
  "LEAVE_OVERLAP",
] as const satisfies readonly BlockerCode[];
const checkSchema = z
  .object({ workerId: uuid, siteId: uuid.optional(), from: calendarDate, to: calendarDate })
  .refine((p) => p.from <= p.to, { message: "Period must end on or after it starts", path: ["to"] });
const overrideSchema = z.object({
  code: z.enum(BLOCKER_CODES),
  documentType: z.string().optional(),
  validUntil: calendarDate,
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters").max(500),
});

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError(
      400,
      "Validation failed",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

const notFound = (what: string) => new ApiError(404, `${what} not found`);

/** Last 4 characters only (apps/api/src/common/mask.ts, CLAUDE.md rule 10). */
const mask = (v: string | null): string | null => (!v ? v : v.length <= 4 ? "••••" : `••••${v.slice(-4)}`);

// ---- Records (shapes of apps/api/src/db/schema.ts rows) --------------------------------

interface Worker {
  id: string; entityId: string; code: string; fullName: string; fullNameAr: string | null;
  nationality: string; trade: string; status: WorkerStatus; phone: string | null;
  dateOfBirth: string | null; joinedOn: string | null; createdAt: string; updatedAt: string;
}
interface Doc {
  id: string; entityId: string; workerId: string; type: DocumentType; number: string | null;
  issueDate: string | null; expiryDate: string | null; verified: boolean; verifiedBy: string | null;
  verifiedAt: string | null; createdAt: string; updatedAt: string;
}
interface Leave { id: string; entityId: string; workerId: string; fromDate: string; toDate: string; status: string; createdAt: string }
interface Override {
  id: string; entityId: string; workerId: string; code: BlockerCode; documentType: string | null;
  validUntil: string; approvedBy: string; reason: string; createdAt: string;
}
interface Site { id: string; entityId: string; code: string; name: string; clientName: string; requiredDocuments: DocumentType[]; createdAt: string; updatedAt: string }
interface AuditEvent {
  id: number; actor: string; action: string; subjectType: string; subjectId: string;
  before: unknown; after: unknown; at: string; prevHash: string; hash: string;
}

const ENTITY = "OM-01";
/** Stable UUID-shaped ids, so a shared link to `#/workers/<id>` opens the same person after a reload. */
const idOf = (kind: number, n: number) => `00000000-0000-4000-8${kind.toString(16).padStart(3, "0")}-${n.toString(16).padStart(12, "0")}`;

// ---- Fictional people (same recipe as apps/api/src/db/seed.ts) --------------------------

const FIRST = ["Rahim", "Karim", "Suresh", "Anil", "Bikash", "Imran", "Ravi", "Hasan", "Joseph", "Manoj", "Sabbir", "Arjun", "Faisal", "Ramesh", "Dipak", "Nasir", "Vinod", "Shakil", "Pradeep", "Asif"];
const LAST = ["Uddin", "Hossain", "Kumar", "Thapa", "Khan", "Rana", "Pillai", "Mia", "Nair", "Gurung", "Ahmed", "Islam", "Singh", "Shrestha", "Rahman", "Menon", "Ali", "Das", "Tamang", "Iqbal"];
const COUNTRIES = ["Bangladesh", "India", "Nepal", "Pakistan"];
const TRADES = ["General labourer", "Mason", "Carpenter", "Steel fixer", "Electrician", "Plumber", "Scaffolder", "Welder", "Equipment operator", "Driver"];
const DEMO_WORKERS = 680;

function seed(today: string, stamp: string) {
  let state = 20261014;
  const rand = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  const site = (n: number, code: string, name: string, clientName: string, requiredDocuments: DocumentType[]): Site =>
    ({ id: idOf(3, n), entityId: ENTITY, code, name, clientName, requiredDocuments, createdAt: stamp, updatedAt: stamp });
  const sites = [
    site(1, "SOH-PORT", "Sohar Port Phase 3", "Gulf Build LLC", []),
    site(2, "MCT-TWR", "Muscat Tower Block B", "Al Noor Contracting", ["trade_certificate"]),
    site(3, "SOH-IND", "Sohar Industrial Yard", "Batinah Steel", ["driving_licence"]),
  ];

  const workers: Worker[] = [];
  const docs: Doc[] = [];
  for (let i = 1; i <= DEMO_WORKERS; i++) {
    const id = idOf(1, i);
    workers.push({
      id, entityId: ENTITY, code: `W-${String(i).padStart(6, "0")}`,
      fullName: `${pick(FIRST)} ${pick(LAST)}`, fullNameAr: null,
      nationality: pick(COUNTRIES), trade: pick(TRADES),
      status: rand() < 0.86 ? "deployed" : rand() < 0.6 ? "available" : "on_leave",
      phone: `+968 9${int(1000000, 9999999)}`, dateOfBirth: null, joinedOn: addDays(today, -int(30, 2000)),
      createdAt: stamp, updatedAt: stamp,
    });
    const roll = rand();
    const baseExpiry = (offset: number) => addDays(today, offset + int(0, 400));
    const doc = (type: DocumentType, number: string | null, expiryDate: string, verified: boolean): Doc => ({
      id: idOf(2, docs.length + 1), entityId: ENTITY, workerId: id, type, number, issueDate: null, expiryDate,
      verified, verifiedBy: verified ? "hr.officer" : null, verifiedAt: verified ? stamp : null, createdAt: stamp, updatedAt: stamp,
    });
    docs.push(doc("passport", `P${int(1000000, 9999999)}`, baseExpiry(500), true));
    docs.push(doc("residence_visa", `RV${int(100000, 999999)}`, roll < 0.12 ? addDays(today, int(1, 85)) : roll < 0.17 ? addDays(today, -int(1, 40)) : baseExpiry(120), true));
    docs.push(doc("labour_card", `LC${int(100000, 999999)}`, roll > 0.9 ? addDays(today, int(1, 60)) : baseExpiry(150), rand() > 0.05));
    if (roll > 0.04) docs.push(doc("medical", null, baseExpiry(60), true));
  }
  return { sites, workers, docs };
}

// ---- Audit hash chain (apps/api/src/audit/audit.service.ts) ------------------------------

const GENESIS = "0".repeat(64);
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const hashOf = (prev: string, e: Pick<AuditEvent, "actor" | "action" | "subjectType" | "subjectId" | "before" | "after">) =>
  sha256([prev, e.actor, e.action, e.subjectType, e.subjectId, canonical(e.before), canonical(e.after)].join("|"));

// ---- The server ---------------------------------------------------------------------------

export function createDemoServer(today: string = todayOman()) {
  const now = () => new Date().toISOString();
  const db = { ...seed(today, `${today}T05:00:00.000Z`), leave: [] as Leave[], overrides: [] as Override[], audit: [] as AuditEvent[] };
  let nextWorker = db.workers.length + 1;
  let nextId = 1;
  const newId = (kind: number) => idOf(kind, 0x100000 + nextId++);

  async function record(actor: string, action: string, subjectType: string, subjectId: string, before: unknown, after: unknown) {
    const e = { actor, action, subjectType, subjectId, before: JSON.parse(JSON.stringify(before ?? null)), after: JSON.parse(JSON.stringify(after ?? null)) };
    const prevHash = db.audit.at(-1)?.hash ?? GENESIS;
    db.audit.push({ ...e, id: db.audit.length + 1, at: now(), prevHash, hash: await hashOf(prevHash, e) });
  }

  const docsByWorker = new Map<string, Doc[]>();
  const indexDoc = (d: Doc) => docsByWorker.set(d.workerId, [...(docsByWorker.get(d.workerId) ?? []), d]);
  db.docs.forEach(indexDoc);
  const docsOf = (workerId: string) => [...(docsByWorker.get(workerId) ?? [])];
  const coreDocs = (ds: Doc[]) => ds.map((d) => ({ type: d.type, expiryDate: d.expiryDate, verified: d.verified }));
  const findWorker = (id: string) => {
    const w = db.workers.find((x) => x.id === parse(uuid, id));
    if (!w) throw notFound("Worker");
    return w;
  };
  const withCompliance = (w: Worker) => ({
    id: w.id, code: w.code, fullName: w.fullName, nationality: w.nationality, trade: w.trade, status: w.status,
    compliance: summariseWorkerCompliance(coreDocs(docsOf(w.id)), today),
  });
  const allWithCompliance = (q: { search?: string; status?: string } = {}) => {
    const term = q.search?.toLowerCase();
    return db.workers
      .filter((w) => (!q.status || w.status === q.status) && (!term || w.fullName.toLowerCase().includes(term) || w.code.toLowerCase().includes(term)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(withCompliance);
  };
  const shownDoc = (d: Doc) => ({ ...d, number: mask(d.number) });

  type Handler = (m: RegExpMatchArray, body: unknown, actor: string, query: URLSearchParams) => unknown;
  const routes: [string, RegExp, Handler][] = [
    ["GET", /^\/api\/health$/, () => ({ ok: true })],
    ["GET", /^\/api\/workers$/, (_m, _b, _a, query) => {
      const q = parse(listWorkersSchema, Object.fromEntries(query));
      const all = allWithCompliance(q);
      const filtered = q.compliance ? all.filter((w) => w.compliance.state === q.compliance) : all;
      return { total: filtered.length, items: filtered.slice(q.offset, q.offset + q.limit) };
    }],
    ["POST", /^\/api\/workers$/, async (_m, body, actor) => {
      const input = parse(createWorkerSchema, body);
      const t = now();
      const worker: Worker = {
        id: newId(1), entityId: ENTITY, code: `W-${String(nextWorker++).padStart(6, "0")}`,
        fullName: input.fullName, fullNameAr: input.fullNameAr ?? null, nationality: input.nationality, trade: input.trade,
        status: input.status, phone: input.phone ?? null, dateOfBirth: input.dateOfBirth ?? null, joinedOn: input.joinedOn ?? null,
        createdAt: t, updatedAt: t,
      };
      db.workers.push(worker);
      await record(actor, "worker.create", "worker", worker.id, null, worker);
      return worker;
    }],
    ["GET", /^\/api\/workers\/([^/]+)$/, ([, id]) => {
      const w = findWorker(id!);
      const ds = docsOf(w.id).sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
      return {
        ...w,
        compliance: summariseWorkerCompliance(coreDocs(ds), today),
        documents: ds.map((d) => ({ ...shownDoc(d), renewal: d.expiryDate ? renewalStatus(d.expiryDate, today) : null })),
        leave: db.leave.filter((l) => l.workerId === w.id),
      };
    }],
    ["POST", /^\/api\/workers\/([^/]+)\/documents$/, async ([, id], body, actor) => {
      const w = findWorker(id!);
      const input = parse(addDocumentSchema, body);
      const t = now();
      const doc: Doc = {
        id: newId(2), entityId: ENTITY, workerId: w.id, type: input.type, number: input.number ?? null,
        issueDate: input.issueDate ?? null, expiryDate: input.expiryDate ?? null, verified: input.verified,
        verifiedBy: input.verified ? actor : null, verifiedAt: input.verified ? t : null, createdAt: t, updatedAt: t,
      };
      db.docs.push(doc);
      indexDoc(doc);
      await record(actor, "document.create", "worker_document", doc.id, null, shownDoc(doc));
      return shownDoc(doc);
    }],
    ["POST", /^\/api\/workers\/([^/]+)\/leave$/, async ([, id], body, actor) => {
      const w = findWorker(id!);
      const input = parse(addLeaveSchema, body);
      const leave: Leave = { id: newId(4), entityId: ENTITY, workerId: w.id, ...input, status: "approved", createdAt: now() };
      db.leave.push(leave);
      await record(actor, "leave.create", "leave", leave.id, null, leave);
      return leave;
    }],
    ["PATCH", /^\/api\/documents\/([^/]+)\/verify$/, async ([, id], _b, actor) => {
      if (actor === "anonymous") throw new ApiError(401, "A named user is required for this action");
      const doc = db.docs.find((d) => d.id === parse(uuid, id));
      if (!doc) throw notFound("Document");
      const before = shownDoc(doc);
      const t = now();
      Object.assign(doc, { verified: true, verifiedBy: actor, verifiedAt: t, updatedAt: t });
      await record(actor, "document.verify", "worker_document", doc.id, before, shownDoc(doc));
      return shownDoc(doc);
    }],
    ["POST", /^\/api\/compliance\/check$/, (_m, body) => {
      const input = parse(checkSchema, body);
      const w = findWorker(input.workerId);
      let site: { id: string; requiredDocuments: DocumentType[] } | undefined;
      if (input.siteId) {
        const row = db.sites.find((s) => s.id === input.siteId);
        if (!row) throw notFound("Site");
        site = { id: row.id, requiredDocuments: row.requiredDocuments };
      }
      return checkEligibility({
        worker: { id: w.id, status: w.status },
        documents: coreDocs(docsOf(w.id)),
        period: { from: input.from, to: input.to },
        today,
        site,
        leave: db.leave.filter((l) => l.workerId === w.id && l.status === "approved").map((l) => ({ from: l.fromDate, to: l.toDate })),
        overrides: db.overrides
          .filter((o) => o.workerId === w.id)
          .map((o) => ({ code: o.code, documentType: (o.documentType ?? undefined) as DocumentType | undefined, validUntil: o.validUntil, approvedBy: o.approvedBy, reason: o.reason })),
      });
    }],
    ["POST", /^\/api\/workers\/([^/]+)\/overrides$/, async ([, id], body, approvedBy) => {
      const w = findWorker(id!);
      const input = parse(overrideSchema, body);
      if (input.validUntil < today) throw new ApiError(400, "An override cannot end in the past");
      const row: Override = { id: newId(5), entityId: ENTITY, workerId: w.id, code: input.code, documentType: input.documentType ?? null, validUntil: input.validUntil, approvedBy, reason: input.reason, createdAt: now() };
      db.overrides.push(row);
      await record(approvedBy, "compliance.override", "worker", w.id, null, row);
      return row;
    }],
    ["GET", /^\/api\/compliance\/renewals$/, () => {
      const active = new Map(db.workers.filter((w) => w.status !== "exited").map((w) => [w.id, w]));
      const rows = db.docs.flatMap((d) => {
        const w = active.get(d.workerId);
        return w ? [{ id: d.id, workerId: w.id, type: d.type, expiryDate: d.expiryDate, workerName: w.fullName, workerCode: w.code }] : [];
      });
      return { items: buildRenewalQueue(rows, today) };
    }],
    ["GET", /^\/api\/dashboard\/summary$/, () => {
      const all = allWithCompliance();
      const byStatus: Record<string, number> = {};
      const byCompliance = { ok: 0, due: 0, incomplete: 0, expired: 0 };
      let expiringIn30Days = 0;
      for (const w of all) {
        byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
        byCompliance[w.compliance.state] += 1;
        const next = w.compliance.nextExpiry;
        if (next && next.daysLeft >= 0 && daysBetween(today, next.expiryDate) <= 30) expiringIn30Days += 1;
      }
      return { today, headcount: all.length, byStatus, byCompliance, expiringIn30Days };
    }],
    ["GET", /^\/api\/sites$/, () => ({ items: [...db.sites].sort((a, b) => a.name.localeCompare(b.name)) })],
    ["GET", /^\/api\/audit$/, (_m, _b, _a, query) => {
      const { subjectId } = parse(z.object({ subjectId: z.string().min(1) }), Object.fromEntries(query));
      return { items: db.audit.filter((e) => e.subjectId === subjectId) };
    }],
    ["GET", /^\/api\/audit\/verify$/, async () => {
      let prevHash = GENESIS;
      for (const row of db.audit) {
        if (row.prevHash !== prevHash || row.hash !== (await hashOf(prevHash, row))) {
          return { intact: false, checked: db.audit.length, firstBrokenId: row.id };
        }
        prevHash = row.hash;
      }
      return { intact: true, checked: db.audit.length, firstBrokenId: null };
    }],
  ];

  return {
    /** Answer one request like the API would: the parsed JSON body, or an `ApiError`. */
    async handle<T>(method: string, url: string, body: unknown, actor: string): Promise<T> {
      const [path = "", search = ""] = url.split("?");
      for (const [m, pattern, handler] of routes) {
        const match = m === method ? path.match(pattern) : null;
        // structuredClone: callers get copies, as they would over HTTP, never the live records.
        if (match) return structuredClone(await handler(match, body, actor, new URLSearchParams(search))) as T;
      }
      throw new ApiError(404, `Cannot ${method} ${path}`);
    },
  };
}

let shared: ReturnType<typeof createDemoServer> | undefined;
/** The one in-memory server for this browser tab (created on first use). */
export const demoServer = () => (shared ??= createDemoServer());
