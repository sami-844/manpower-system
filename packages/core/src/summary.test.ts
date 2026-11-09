import { describe, expect, it } from "vitest";
import { summariseWorkerCompliance } from "./summary";

const today = "2026-10-14";
const full = (expiry: string) => [
  { type: "passport" as const, expiryDate: "2030-01-01", verified: true },
  { type: "residence_visa" as const, expiryDate: expiry, verified: true },
  { type: "labour_card" as const, expiryDate: "2030-01-01", verified: true },
  { type: "medical" as const, expiryDate: "2030-01-01", verified: true },
];

describe("summariseWorkerCompliance", () => {
  it("is ok when every mandatory document is valid beyond 90 days", () => {
    expect(summariseWorkerCompliance(full("2027-06-01"), today)).toEqual({
      state: "ok",
      missing: [],
      nextExpiry: { type: "residence_visa", expiryDate: "2027-06-01", daysLeft: 230 },
    });
  });

  it("is due when the nearest mandatory expiry is within 90 days", () => {
    expect(summariseWorkerCompliance(full("2026-11-01"), today).state).toBe("due");
  });

  it("is expired when any mandatory document has expired", () => {
    expect(summariseWorkerCompliance(full("2026-10-13"), today)).toMatchObject({
      state: "expired",
      nextExpiry: { type: "residence_visa", daysLeft: -1 },
    });
  });

  it("is incomplete when a mandatory document is missing or undated", () => {
    const docs = full("2027-06-01").filter((d) => d.type !== "medical");
    expect(summariseWorkerCompliance(docs, today)).toMatchObject({ state: "incomplete", missing: ["medical"] });
    const undated = full("2027-06-01").map((d) => (d.type === "passport" ? { ...d, expiryDate: null } : d));
    expect(summariseWorkerCompliance(undated, today)).toMatchObject({ state: "incomplete", missing: ["passport"] });
  });

  it("ranks expired above incomplete", () => {
    const docs = full("2026-10-01").filter((d) => d.type !== "medical");
    expect(summariseWorkerCompliance(docs, today).state).toBe("expired");
  });

  it("ignores non-mandatory documents and uses the latest renewal", () => {
    const docs = [
      ...full("2027-06-01"),
      { type: "driving_licence" as const, expiryDate: "2026-10-01", verified: true },
      { type: "residence_visa" as const, expiryDate: "2026-10-01", verified: true },
    ];
    expect(summariseWorkerCompliance(docs, today).state).toBe("ok");
  });

  it("has no next expiry when there are no dated documents", () => {
    expect(summariseWorkerCompliance([], today)).toEqual({
      state: "incomplete",
      missing: ["passport", "residence_visa", "labour_card", "medical"],
      nextExpiry: null,
    });
  });
});
