import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createTestApp, createWorker, validDocs, type TestContext } from "./helpers";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => ctx.reset());

const period = { from: "2026-11-01", to: "2026-11-30" };

describe("POST /api/compliance/check", () => {
  it("allows a fully documented worker", async () => {
    const w = await createWorker(ctx);
    const res = await ctx.api().post("/api/compliance/check").send({ workerId: w.id, ...period });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ eligible: true, blockers: [] });
  });

  it("blocks a worker whose visa expires during the period", async () => {
    const w = await createWorker(ctx, {}, validDocs("2026-11-15"));
    const res = await ctx.api().post("/api/compliance/check").send({ workerId: w.id, ...period });
    expect(res.body.eligible).toBe(false);
    expect(res.body.blockers.map((b: { code: string }) => b.code)).toContain("DOCUMENT_EXPIRES_DURING_PERIOD");
  });

  it("applies the site's extra document requirements", async () => {
    const w = await createWorker(ctx);
    const site = await ctx
      .api()
      .post("/api/sites")
      .send({ code: "SOH-PORT", name: "Sohar Port Phase 3", clientName: "Gulf Build LLC", requiredDocuments: ["trade_certificate"] });
    expect(site.status).toBe(201);
    const res = await ctx.api().post("/api/compliance/check").send({ workerId: w.id, siteId: site.body.id, ...period });
    expect(res.body.blockers).toContainEqual(
      expect.objectContaining({ code: "MISSING_DOCUMENT", documentType: "trade_certificate" }),
    );
  });

  it("blocks when approved leave overlaps", async () => {
    const w = await createWorker(ctx);
    await ctx.api().post(`/api/workers/${w.id}/leave`).send({ fromDate: "2026-11-10", toDate: "2026-11-20" });
    const res = await ctx.api().post("/api/compliance/check").send({ workerId: w.id, ...period });
    expect(res.body.blockers.map((b: { code: string }) => b.code)).toContain("LEAVE_OVERLAP");
  });

  it("honours a recorded override with approver and reason", async () => {
    const w = await createWorker(ctx, {}, validDocs("2026-10-31"));
    const o = await ctx
      .api()
      .post(`/api/workers/${w.id}/overrides`)
      .set("x-user", "ops.manager")
      .send({ code: "DOCUMENT_EXPIRED", documentType: "passport", validUntil: "2026-11-30", reason: "Renewal at embassy" });
    expect(o.status).toBe(201);
    expect(o.body.approvedBy).toBe("ops.manager");
    const res = await ctx.api().post("/api/compliance/check").send({ workerId: w.id, ...period });
    // Passport overridden; the other three documents are still expired.
    expect(res.body.blockers.filter((b: { documentType: string }) => b.documentType === "passport")).toEqual([]);
    expect(res.body.blockers).toHaveLength(3);
  });

  it("refuses an override without a reason", async () => {
    const w = await createWorker(ctx);
    const res = await ctx
      .api()
      .post(`/api/workers/${w.id}/overrides`)
      .set("x-user", "ops.manager")
      .send({ code: "DOCUMENT_EXPIRED", validUntil: "2026-11-30", reason: "" });
    expect(res.status).toBe(400);
  });

  it("refuses an override from an anonymous user", async () => {
    const w = await createWorker(ctx);
    const res = await ctx
      .api()
      .post(`/api/workers/${w.id}/overrides`)
      .send({ code: "DOCUMENT_EXPIRED", validUntil: "2026-11-30", reason: "x" });
    expect(res.status).toBe(401);
  });

  it("validates the period", async () => {
    const w = await createWorker(ctx);
    const res = await ctx.api().post("/api/compliance/check").send({ workerId: w.id, from: "2026-11-30", to: "2026-11-01" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/compliance/renewals", () => {
  it("returns expired and due documents across workers, most urgent first, with worker names", async () => {
    await createWorker(ctx, { fullName: "Far Future" });
    await createWorker(ctx, { fullName: "Soon" }, validDocs("2026-10-20"));
    await createWorker(ctx, { fullName: "Late" }, validDocs("2026-10-01"));
    const res = await ctx.api().get("/api/compliance/renewals");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(8);
    expect(res.body.items[0]).toMatchObject({ workerName: "Late", state: "expired", daysLeft: -13 });
    expect(res.body.items[7]).toMatchObject({ workerName: "Soon", state: "due", daysLeft: 6 });
    expect(res.body.items.some((i: { workerName: string }) => i.workerName === "Far Future")).toBe(false);
  });

  it("excludes exited workers", async () => {
    await createWorker(ctx, { fullName: "Gone", status: "exited" }, validDocs("2026-10-01"));
    expect((await ctx.api().get("/api/compliance/renewals")).body.items).toEqual([]);
  });
});

describe("GET /api/dashboard/summary", () => {
  it("counts workers by compliance state and status", async () => {
    await createWorker(ctx);
    await createWorker(ctx, { status: "deployed" });
    await createWorker(ctx, {}, validDocs("2026-10-01"));
    await createWorker(ctx, {}, []);
    const res = await ctx.api().get("/api/dashboard/summary");
    expect(res.body).toMatchObject({
      headcount: 4,
      byStatus: { available: 3, deployed: 1 },
      byCompliance: { ok: 2, expired: 1, incomplete: 1, due: 0 },
      expiringIn30Days: 0,
    });
  });
});
