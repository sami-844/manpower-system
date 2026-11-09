import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Spec §3 data model — first slice: workforce, documents, sites, overrides,
 * leave and the hash-chained audit log. Every table carries entity_id so a
 * second legal entity (e.g. UAE) is configuration, not a rewrite.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const entityId = text("entity_id").notNull().default("OM-01");

export const workers = pgTable(
  "workers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId,
    // Default set by migration 0001 (worker_code_seq): W-000001, W-000002, ...
    code: text("code")
      .notNull()
      .default(sql`'W-' || lpad(nextval('worker_code_seq')::text, 6, '0')`),
    fullName: text("full_name").notNull(),
    fullNameAr: text("full_name_ar"),
    nationality: text("nationality").notNull(),
    trade: text("trade").notNull(),
    status: text("status").notNull().default("available"),
    phone: text("phone"),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    joinedOn: date("joined_on", { mode: "string" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("workers_code_uq").on(t.entityId, t.code),
    index("workers_name_idx").on(t.fullName),
    check(
      "workers_status_ck",
      sql`${t.status} in ('in_recruitment','available','deployed','on_leave','absconding_reported','exited')`,
    ),
  ],
);

export const workerDocuments = pgTable(
  "worker_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId,
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id),
    type: text("type").notNull(),
    number: text("number"),
    issueDate: date("issue_date", { mode: "string" }),
    expiryDate: date("expiry_date", { mode: "string" }),
    verified: boolean("verified").notNull().default(false),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("worker_documents_worker_idx").on(t.workerId),
    index("worker_documents_expiry_idx").on(t.expiryDate),
    check(
      "worker_documents_type_ck",
      sql`${t.type} in ('passport','residence_visa','labour_card','civil_id','medical','driving_licence','trade_certificate','insurance')`,
    ),
    check("worker_documents_dates_ck", sql`${t.issueDate} is null or ${t.expiryDate} is null or ${t.issueDate} <= ${t.expiryDate}`),
  ],
);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityId,
    code: text("code").notNull(),
    name: text("name").notNull(),
    clientName: text("client_name").notNull(),
    requiredDocuments: text("required_documents").array().notNull().default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [uniqueIndex("sites_code_uq").on(t.entityId, t.code)],
);

export const complianceOverrides = pgTable("compliance_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId,
  workerId: uuid("worker_id")
    .notNull()
    .references(() => workers.id),
  code: text("code").notNull(),
  documentType: text("document_type"),
  validUntil: date("valid_until", { mode: "string" }).notNull(),
  approvedBy: text("approved_by").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leavePeriods = pgTable("leave_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityId,
  workerId: uuid("worker_id")
    .notNull()
    .references(() => workers.id),
  fromDate: date("from_date", { mode: "string" }).notNull(),
  toDate: date("to_date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("approved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Append-only, hash-chained audit trail (Spec §6). */
export const auditEvents = pgTable("audit_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  entityId,
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
});
