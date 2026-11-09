import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule, configureApp } from "../src/app.module";
import { CLOCK, type Clock } from "../src/common/clock";
import { DB, type Database } from "../src/db/client";

export const TODAY = "2026-10-14";

export interface TestContext {
  app: INestApplication;
  db: Database;
  api: () => ReturnType<typeof request>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestApp(today = TODAY): Promise<TestContext> {
  const clock: Clock = { today: () => today };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  const db = app.get<Database>(DB);
  return {
    app,
    db,
    api: () => request(app.getHttpServer()),
    // audit_events is append-only by design, so tests filter it by subject instead of clearing it.
    reset: async () => {
      await db.sql`TRUNCATE leave_periods, compliance_overrides, worker_documents, sites, workers RESTART IDENTITY CASCADE`;
    },
    close: async () => {
      await app.close();
    },
  };
}

export const validDocs = (expiry = "2027-12-31") => [
  { type: "passport", number: "P1234567", expiryDate: expiry },
  { type: "residence_visa", number: "V-998877", expiryDate: expiry },
  { type: "labour_card", number: "LC-445566", expiryDate: expiry },
  { type: "medical", expiryDate: expiry },
];

export async function createWorker(
  ctx: TestContext,
  over: Record<string, unknown> = {},
  docs = validDocs(),
): Promise<{ id: string; code: string }> {
  const res = await ctx
    .api()
    .post("/api/workers")
    .set("x-user", "hr.officer")
    .send({ fullName: "Test Worker", nationality: "Bangladesh", trade: "Mason", ...over });
  if (res.status !== 201) throw new Error(`createWorker failed: ${res.status} ${JSON.stringify(res.body)}`);
  for (const d of docs) {
    const r = await ctx.api().post(`/api/workers/${res.body.id}/documents`).set("x-user", "hr.officer").send({ ...d, verified: true });
    if (r.status !== 201) throw new Error(`add document failed: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return res.body;
}
