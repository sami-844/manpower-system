import { describe, expect, it } from "vitest";
import type { EligibilityResult } from "@mms/core";
import { ApiError, type DashboardSummary, type RenewalItem, type WorkerDetail, type WorkerListItem } from "@/lib/api";
import { createDemoServer } from "./server";

const TODAY = "2026-11-09";
type List = { total: number; items: WorkerListItem[] };

describe("hosted demo API (browser stand-in for apps/api)", () => {
  it("seeds the same 680 fictional workers every time, sorted by name, coded from a counter", async () => {
    const a = await createDemoServer(TODAY).handle<List>("GET", "/api/workers?limit=500", undefined, "hr.officer");
    const b = await createDemoServer(TODAY).handle<List>("GET", "/api/workers?limit=500", undefined, "hr.officer");
    expect(a.total).toBe(680);
    expect(a.items).toHaveLength(500);
    expect(a.items).toEqual(b.items);
    const names = a.items.map((w) => w.fullName);
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
    expect(a.items.every((w) => /^W-\d{6}$/.test(w.code))).toBe(true);
  });

  it("filters by search, status and paper state, and pages", async () => {
    const s = createDemoServer(TODAY);
    const one = await s.handle<List>("GET", "/api/workers?search=W-000007", undefined, "x");
    expect(one.items.map((w) => w.code)).toEqual(["W-000007"]);
    const expired = await s.handle<List>("GET", "/api/workers?compliance=expired&limit=500", undefined, "x");
    expect(expired.total).toBeGreaterThan(0);
    expect(expired.items.every((w) => w.compliance.state === "expired")).toBe(true);
    const bench = await s.handle<List>("GET", "/api/workers?status=available&limit=500", undefined, "x");
    expect(bench.items.every((w) => w.status === "available")).toBe(true);
    const page2 = await s.handle<List>("GET", "/api/workers?limit=10&offset=10", undefined, "x");
    const all = await s.handle<List>("GET", "/api/workers?limit=20", undefined, "x");
    expect(page2.items).toEqual(all.items.slice(10, 20));
  });

  it("adds a worker, refuses deployment without papers, then clears once papers are in", async () => {
    const s = createDemoServer(TODAY);
    const created = await s.handle<{ id: string; code: string }>(
      "POST", "/api/workers", { fullName: "Demo Worker", nationality: "Nepal", trade: "Scaffolder" }, "hr.officer");
    expect(created.code).toBe("W-000681");

    const check = () => s.handle<EligibilityResult>("POST", "/api/compliance/check", { workerId: created.id, from: TODAY, to: TODAY }, "hr.officer");
    const before = await check();
    expect(before.eligible).toBe(false);
    expect(before.blockers.some((b) => b.code === "MISSING_DOCUMENT" && b.documentType === "passport")).toBe(true);

    for (const type of ["passport", "residence_visa", "labour_card", "medical"]) {
      await s.handle("POST", `/api/workers/${created.id}/documents`, { type, number: "AB1234567", expiryDate: "2028-06-30", verified: true }, "hr.officer");
    }
    expect((await check()).eligible).toBe(true);

    const detail = await s.handle<WorkerDetail>("GET", `/api/workers/${created.id}`, undefined, "hr.officer");
    expect(detail.compliance.state).toBe("ok");
    expect(detail.documents).toHaveLength(4);
    expect(detail.documents.every((d) => d.number === "••••4567")).toBe(true); // rule 10: last 4 only
  });

  it("answers bad input and unknown records the way the API does", async () => {
    const s = createDemoServer(TODAY);
    const bad = await s.handle("POST", "/api/workers", { fullName: "A" }, "x").catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(ApiError);
    expect((bad as ApiError).status).toBe(400);
    expect((bad as ApiError).issues.map((i) => i.path)).toEqual(expect.arrayContaining(["fullName", "nationality", "trade"]));

    const missing = await s.handle("GET", "/api/workers/00000000-0000-4000-8000-ffffffffffff", undefined, "x").catch((e: unknown) => e);
    expect((missing as ApiError).status).toBe(404);

    const unknownRoute = await s.handle("GET", "/api/nothing", undefined, "x").catch((e: unknown) => e);
    expect((unknownRoute as ApiError).status).toBe(404);
  });

  it("records every change in an intact hash chain, and refuses overrides that end in the past", async () => {
    const s = createDemoServer(TODAY);
    const { items } = await s.handle<List>("GET", "/api/workers?limit=1", undefined, "x");
    const worker = items[0]!;
    const past = await s
      .handle("POST", `/api/workers/${worker.id}/overrides`, { code: "MISSING_DOCUMENT", documentType: "medical", validUntil: "2026-01-01", reason: "Clinic booked" }, "ops.manager")
      .catch((e: unknown) => e);
    expect((past as ApiError).status).toBe(400);

    await s.handle("POST", `/api/workers/${worker.id}/overrides`, { code: "MISSING_DOCUMENT", documentType: "medical", validUntil: "2026-12-01", reason: "Clinic booked" }, "ops.manager");
    await s.handle("POST", `/api/workers/${worker.id}/leave`, { fromDate: "2026-12-10", toDate: "2026-12-20" }, "hr.officer");

    const audit = await s.handle<{ items: { action: string; actor: string }[] }>("GET", `/api/audit?subjectId=${worker.id}`, undefined, "x");
    expect(audit.items.map((e) => e.action)).toEqual(["compliance.override"]);
    expect(audit.items[0]!.actor).toBe("ops.manager");
    expect(await s.handle("GET", "/api/audit/verify", undefined, "x")).toEqual({ intact: true, checked: 2, firstBrokenId: null });
  });

  it("builds renewals and the dashboard summary from the same rule engines", async () => {
    const s = createDemoServer(TODAY);
    const { items } = await s.handle<{ items: RenewalItem[] }>("GET", "/api/compliance/renewals", undefined, "x");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((r) => r.workerCode && r.workerName && r.expiryDate)).toBe(true);

    const sum = await s.handle<DashboardSummary>("GET", "/api/dashboard/summary", undefined, "x");
    expect(sum.today).toBe(TODAY);
    expect(sum.headcount).toBe(680);
    expect(Object.values(sum.byCompliance).reduce((a, b) => a + b, 0)).toBe(680);
    expect(Object.values(sum.byStatus).reduce((a, b) => a + b, 0)).toBe(680);

    const sites = await s.handle<{ items: { code: string }[] }>("GET", "/api/sites", undefined, "x");
    expect(sites.items.map((x) => x.code).sort()).toEqual(["MCT-TWR", "SOH-IND", "SOH-PORT"]);
  });
});
