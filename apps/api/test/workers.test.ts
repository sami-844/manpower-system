import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createTestApp, createWorker, validDocs, type TestContext } from "./helpers";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => ctx.reset());

describe("POST /api/workers", () => {
  it("creates a worker with a human-readable code and status available", async () => {
    const res = await ctx
      .api()
      .post("/api/workers")
      .set("x-user", "hr.officer")
      .send({ fullName: "Rahim Uddin", nationality: "Bangladesh", trade: "Steel fixer", phone: "+96890000001" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ fullName: "Rahim Uddin", status: "available", trade: "Steel fixer" });
    expect(res.body.code).toMatch(/^W-\d{6}$/);
  });

  it("rejects a worker without a name, with a field-level message", async () => {
    const res = await ctx.api().post("/api/workers").send({ nationality: "India", trade: "Mason" });
    expect(res.status).toBe(400);
    expect(res.body.issues).toContainEqual(expect.objectContaining({ path: "fullName" }));
  });

  it("rejects an unknown status", async () => {
    const res = await ctx
      .api()
      .post("/api/workers")
      .send({ fullName: "A", nationality: "India", trade: "Mason", status: "holiday" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/workers", () => {
  it("lists workers with a compliance summary each", async () => {
    await createWorker(ctx, { fullName: "Valid Worker" });
    await createWorker(ctx, { fullName: "Expiring Worker" }, validDocs("2026-11-01"));
    await createWorker(ctx, { fullName: "No Papers" }, []);

    const res = await ctx.api().get("/api/workers");
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.items.map((w: { fullName: string }) => [w.fullName, w]));
    expect(byName["Valid Worker"].compliance.state).toBe("ok");
    expect(byName["Expiring Worker"].compliance).toMatchObject({ state: "due", nextExpiry: { daysLeft: 18 } });
    expect(byName["No Papers"].compliance.state).toBe("incomplete");
    expect(res.body.total).toBe(3);
  });

  it("searches by name or code, case-insensitively", async () => {
    const a = await createWorker(ctx, { fullName: "Mohammed Karim" });
    await createWorker(ctx, { fullName: "Suresh Kumar" });
    const byName = await ctx.api().get("/api/workers").query({ search: "karim" });
    expect(byName.body.items.map((w: { fullName: string }) => w.fullName)).toEqual(["Mohammed Karim"]);
    const byCode = await ctx.api().get("/api/workers").query({ search: a.code });
    expect(byCode.body.total).toBe(1);
  });

  it("filters by compliance state", async () => {
    await createWorker(ctx, { fullName: "Valid" });
    await createWorker(ctx, { fullName: "Expired" }, validDocs("2026-10-01"));
    const res = await ctx.api().get("/api/workers").query({ compliance: "expired" });
    expect(res.body.items.map((w: { fullName: string }) => w.fullName)).toEqual(["Expired"]);
  });
});

describe("GET /api/workers/:id", () => {
  it("returns the worker file with documents and renewal status", async () => {
    const w = await createWorker(ctx, {}, validDocs("2026-10-20"));
    const res = await ctx.api().get(`/api/workers/${w.id}`);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(4);
    expect(res.body.documents[0]).toMatchObject({ renewal: { state: "due", daysLeft: 6, tier: 7 } });
  });

  it("masks document numbers by default", async () => {
    const w = await createWorker(ctx);
    const res = await ctx.api().get(`/api/workers/${w.id}`);
    const passport = res.body.documents.find((d: { type: string }) => d.type === "passport");
    expect(passport.number).toBe("••••4567");
  });

  it("returns 404 for an unknown worker", async () => {
    const res = await ctx.api().get("/api/workers/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    expect((await ctx.api().get("/api/workers/not-a-uuid")).status).toBe(400);
  });
});

describe("POST /api/workers/:id/documents", () => {
  it("rejects an expiry date before the issue date", async () => {
    const w = await createWorker(ctx, {}, []);
    const res = await ctx
      .api()
      .post(`/api/workers/${w.id}/documents`)
      .send({ type: "passport", issueDate: "2026-01-01", expiryDate: "2025-01-01" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid calendar date", async () => {
    const w = await createWorker(ctx, {}, []);
    const res = await ctx.api().post(`/api/workers/${w.id}/documents`).send({ type: "passport", expiryDate: "2026-02-30" });
    expect(res.status).toBe(400);
  });

  it("records who verified a document", async () => {
    const w = await createWorker(ctx, {}, []);
    const doc = await ctx.api().post(`/api/workers/${w.id}/documents`).send({ type: "medical", expiryDate: "2027-01-01" });
    expect(doc.body.verified).toBe(false);
    const res = await ctx.api().patch(`/api/documents/${doc.body.id}/verify`).set("x-user", "hr.lead");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ verified: true, verifiedBy: "hr.lead" });
  });
});
