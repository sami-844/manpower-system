import { describe, expect, it } from "vitest";
import { renewalStatus, buildRenewalQueue } from "./renewals";

// PRD 4.3 — "tiered alerts (90/60/30/7 days)" and "a morning to-do list of what expires".

describe("renewalStatus", () => {
  const today = "2026-10-14";

  it("marks an expired document", () => {
    expect(renewalStatus("2026-10-13", today)).toEqual({ state: "expired", daysLeft: -1, tier: 0 });
  });

  it("treats the expiry day itself as due, not expired", () => {
    expect(renewalStatus("2026-10-14", today)).toEqual({ state: "due", daysLeft: 0, tier: 7 });
  });

  it.each([
    ["2026-10-21", 7, 7],
    ["2026-10-22", 8, 30],
    ["2026-11-13", 30, 30],
    ["2026-11-14", 31, 60],
    ["2026-12-13", 60, 60],
    ["2027-01-12", 90, 90],
  ])("puts expiry %s (%i days) in the %i-day tier", (expiry, daysLeft, tier) => {
    expect(renewalStatus(expiry, today)).toEqual({ state: "due", daysLeft, tier });
  });

  it("is ok beyond the widest tier", () => {
    expect(renewalStatus("2027-01-13", today)).toEqual({ state: "ok", daysLeft: 91, tier: null });
  });

  it("accepts custom tiers in any order", () => {
    expect(renewalStatus("2026-10-30", today, [45, 15])).toEqual({ state: "due", daysLeft: 16, tier: 45 });
    expect(renewalStatus("2026-10-29", today, [45, 15])).toEqual({ state: "due", daysLeft: 15, tier: 15 });
  });
});

describe("buildRenewalQueue", () => {
  const today = "2026-10-14";
  const docs = [
    { id: "d1", workerId: "W-1", type: "passport" as const, expiryDate: "2027-06-01" },
    { id: "d2", workerId: "W-2", type: "residence_visa" as const, expiryDate: "2026-10-20" },
    { id: "d3", workerId: "W-3", type: "medical" as const, expiryDate: "2026-10-01" },
    { id: "d4", workerId: "W-1", type: "labour_card" as const, expiryDate: "2026-12-01" },
    { id: "d5", workerId: "W-4", type: "medical" as const, expiryDate: null },
  ];

  it("lists only expired and due documents, most urgent first", () => {
    const queue = buildRenewalQueue(docs, today);
    expect(queue.map((q) => q.id)).toEqual(["d3", "d2", "d4"]);
    expect(queue[0]).toMatchObject({ state: "expired", daysLeft: -13 });
  });

  it("skips documents with no expiry date", () => {
    expect(buildRenewalQueue(docs, today).some((q) => q.id === "d5")).toBe(false);
  });
});

describe("buildRenewalQueue ordering", () => {
  it("orders by days left even when the input is reversed", () => {
    const docs = [
      { id: "late", workerId: "W-1", type: "passport" as const, expiryDate: "2026-12-01" },
      { id: "soon", workerId: "W-2", type: "passport" as const, expiryDate: "2026-10-20" },
      { id: "mid", workerId: "W-3", type: "passport" as const, expiryDate: "2026-11-01" },
    ];
    expect(buildRenewalQueue(docs, "2026-10-14").map((d) => d.id)).toEqual(["soon", "mid", "late"]);
  });
});
