import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { asc, desc, eq, sql } from "drizzle-orm";
import { DB, type Database } from "../db/client";
import { auditEvents } from "../db/schema";

type Tx = Parameters<Parameters<Database["orm"]["transaction"]>[0]>[0];

export interface AuditEntry {
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  before: unknown;
  after: unknown;
}

const GENESIS = "0".repeat(64);
const AUDIT_LOCK = 4_242_001;

/** JSON with sorted keys, so the same data always hashes the same way. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/** Round-trip through JSON so values hash the same before and after storage. */
function normalise(value: unknown): unknown {
  return value === undefined || value === null ? null : JSON.parse(JSON.stringify(value));
}

function hashOf(prevHash: string, e: AuditEntry): string {
  const payload = [prevHash, e.actor, e.action, e.subjectType, e.subjectId, canonical(e.before), canonical(e.after)].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Append an event inside the caller's transaction, so the change and its record commit together. */
  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    const e = { ...entry, before: normalise(entry.before), after: normalise(entry.after) };
    await tx.execute(sql`select pg_advisory_xact_lock(${AUDIT_LOCK})`);
    const [last] = await tx.select({ hash: auditEvents.hash }).from(auditEvents).orderBy(desc(auditEvents.id)).limit(1);
    const prevHash = last?.hash ?? GENESIS;
    await tx.insert(auditEvents).values({ ...e, prevHash, hash: hashOf(prevHash, e) });
  }

  async forSubject(subjectId: string) {
    return this.db.orm
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, subjectId))
      .orderBy(asc(auditEvents.id));
  }

  /** Recompute the whole chain; any edited or removed row breaks it. */
  async verifyChain(): Promise<{ intact: boolean; checked: number; firstBrokenId: number | null }> {
    const rows = await this.db.orm.select().from(auditEvents).orderBy(asc(auditEvents.id));
    let prevHash = GENESIS;
    for (const row of rows) {
      const expected = hashOf(prevHash, row as AuditEntry);
      if (row.prevHash !== prevHash || row.hash !== expected) {
        return { intact: false, checked: rows.length, firstBrokenId: row.id };
      }
      prevHash = row.hash;
    }
    return { intact: true, checked: rows.length, firstBrokenId: null };
  }
}
