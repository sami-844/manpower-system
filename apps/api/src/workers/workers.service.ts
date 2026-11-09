import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  DOCUMENT_TYPES,
  renewalStatus,
  summariseWorkerCompliance,
  WORKER_STATUSES,
  type DocumentType,
  type WorkerComplianceState,
  type WorkerDocument,
} from "@mms/core";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { CLOCK, type Clock } from "../common/clock";
import { maskNumber } from "../common/mask";
import { calendarDate } from "../common/validation";
import { DB, type Database } from "../db/client";
import { leavePeriods, workerDocuments, workers } from "../db/schema";

export const createWorkerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  fullNameAr: z.string().trim().max(120).optional(),
  nationality: z.string().trim().min(2).max(60),
  trade: z.string().trim().min(2).max(60),
  status: z.enum(WORKER_STATUSES).default("available"),
  phone: z.string().trim().max(30).optional(),
  dateOfBirth: calendarDate.optional(),
  joinedOn: calendarDate.optional(),
});

export const addDocumentSchema = z
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

export const listWorkersSchema = z.object({
  search: z.string().trim().max(60).optional(),
  status: z.enum(WORKER_STATUSES).optional(),
  compliance: z.enum(["ok", "due", "incomplete", "expired"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const addLeaveSchema = z
  .object({ fromDate: calendarDate, toDate: calendarDate })
  .refine((l) => l.fromDate <= l.toDate, { message: "Leave must end on or after it starts", path: ["toDate"] });

type DocRow = typeof workerDocuments.$inferSelect;

function asCoreDocument(d: DocRow): WorkerDocument {
  return { type: d.type as DocumentType, expiryDate: d.expiryDate, verified: d.verified };
}

@Injectable()
export class WorkersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(input: z.infer<typeof createWorkerSchema>, actor: string) {
    return this.db.orm.transaction(async (tx) => {
      const [worker] = await tx.insert(workers).values(input).returning();
      await this.audit.record(tx, {
        actor,
        action: "worker.create",
        subjectType: "worker",
        subjectId: worker!.id,
        before: null,
        after: worker,
      });
      return worker!;
    });
  }

  async list(query: z.infer<typeof listWorkersSchema>) {
    const all = await this.allWithCompliance(query);
    const filtered = query.compliance ? all.filter((w) => w.compliance.state === query.compliance) : all;
    return { total: filtered.length, items: filtered.slice(query.offset, query.offset + query.limit) };
  }

  /** Every matching worker with their compliance summary (≈700 rows: cheap at this scale). */
  async allWithCompliance(query: { search?: string; status?: string } = {}) {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(workers.status, query.status));
    if (query.search) {
      const term = `%${query.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      filters.push(or(ilike(workers.fullName, term), ilike(workers.code, term))!);
    }
    const rows = await this.db.orm
      .select()
      .from(workers)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(workers.fullName));

    const docs = rows.length
      ? await this.db.orm.select().from(workerDocuments).where(inArray(workerDocuments.workerId, rows.map((r) => r.id)))
      : [];
    const docsByWorker = Map.groupBy(docs, (d) => d.workerId);
    const today = this.clock.today();

    return rows.map((w) => ({
      id: w.id,
      code: w.code,
      fullName: w.fullName,
      nationality: w.nationality,
      trade: w.trade,
      status: w.status,
      compliance: summariseWorkerCompliance((docsByWorker.get(w.id) ?? []).map(asCoreDocument), today),
    }));
  }

  async get(id: string) {
    const [worker] = await this.db.orm.select().from(workers).where(eq(workers.id, id));
    if (!worker) throw new NotFoundException("Worker not found");
    const docs = await this.db.orm
      .select()
      .from(workerDocuments)
      .where(eq(workerDocuments.workerId, id))
      .orderBy(asc(workerDocuments.expiryDate));
    const leave = await this.db.orm.select().from(leavePeriods).where(eq(leavePeriods.workerId, id));
    const today = this.clock.today();
    return {
      ...worker,
      compliance: summariseWorkerCompliance(docs.map(asCoreDocument), today),
      documents: docs.map((d) => ({
        ...d,
        number: maskNumber(d.number),
        renewal: d.expiryDate ? renewalStatus(d.expiryDate, today) : null,
      })),
      leave,
    };
  }

  async exists(id: string): Promise<void> {
    const [row] = await this.db.orm.select({ id: workers.id }).from(workers).where(eq(workers.id, id));
    if (!row) throw new NotFoundException("Worker not found");
  }

  async addDocument(workerId: string, input: z.infer<typeof addDocumentSchema>, actor: string) {
    await this.exists(workerId);
    return this.db.orm.transaction(async (tx) => {
      const [doc] = await tx
        .insert(workerDocuments)
        .values({
          workerId,
          type: input.type,
          number: input.number,
          issueDate: input.issueDate,
          expiryDate: input.expiryDate ?? null,
          verified: input.verified,
          verifiedBy: input.verified ? actor : null,
          verifiedAt: input.verified ? new Date() : null,
        })
        .returning();
      await this.audit.record(tx, {
        actor,
        action: "document.create",
        subjectType: "worker_document",
        subjectId: doc!.id,
        before: null,
        after: { ...doc, number: maskNumber(doc!.number) },
      });
      return { ...doc!, number: maskNumber(doc!.number) };
    });
  }

  async verifyDocument(documentId: string, actor: string) {
    return this.db.orm.transaction(async (tx) => {
      const [before] = await tx.select().from(workerDocuments).where(eq(workerDocuments.id, documentId)).for("update");
      if (!before) throw new NotFoundException("Document not found");
      const [after] = await tx
        .update(workerDocuments)
        .set({ verified: true, verifiedBy: actor, verifiedAt: new Date(), updatedAt: sql`now()` })
        .where(eq(workerDocuments.id, documentId))
        .returning();
      await this.audit.record(tx, {
        actor,
        action: "document.verify",
        subjectType: "worker_document",
        subjectId: documentId,
        before: { ...before, number: maskNumber(before.number) },
        after: { ...after, number: maskNumber(after!.number) },
      });
      return { ...after!, number: maskNumber(after!.number) };
    });
  }

  async addLeave(workerId: string, input: z.infer<typeof addLeaveSchema>, actor: string) {
    await this.exists(workerId);
    return this.db.orm.transaction(async (tx) => {
      const [leave] = await tx.insert(leavePeriods).values({ workerId, ...input }).returning();
      await this.audit.record(tx, {
        actor,
        action: "leave.create",
        subjectType: "leave",
        subjectId: leave!.id,
        before: null,
        after: leave,
      });
      return leave!;
    });
  }
}

export type WorkerListItem = Awaited<ReturnType<WorkersService["list"]>>["items"][number];
export type { WorkerComplianceState };
