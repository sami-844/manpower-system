import { describe, expect, it } from "vitest";
import type { WorkerListItem } from "@/lib/api";
import { approveRateCard, proposeRateCard, rateCardsOf } from "./commercial";
import { dates, todayOman } from "./core";
import { rankCandidates } from "./operations";

const worker = (code: string, over: Partial<WorkerListItem> = {}): WorkerListItem => ({
  id: code,
  code,
  fullName: `Test ${code}`,
  nationality: "India",
  trade: "Mason",
  status: "available",
  compliance: { state: "ok", missing: [], nextExpiry: { type: "passport", expiryDate: "2030-01-01", daysLeft: 1000 } },
  ...over,
});

describe("rate card four-eyes", () => {
  it("refuses the maker, lets a second person approve, and closes the old version", async () => {
    const card = await proposeRateCard({ contractId: "ct-01", upliftPct: "5", validFrom: dates.addMonths(todayOman(), 2), reason: "Test escalation", by: "ops.manager" });
    expect(() => approveRateCard({ contractId: "ct-01", cardId: card.id, by: "ops.manager" })).toThrow(/cannot approve/);
    await approveRateCard({ contractId: "ct-01", cardId: card.id, by: "finance.lead" });
    const cards = rateCardsOf("ct-01");
    const prev = cards.find((c) => c.version === card.version - 1)!;
    expect(prev.validTo).toBe(dates.addDays(card.validFrom, -1));
    expect(prev.lines[0]!.rate).not.toBe(card.lines[0]!.rate); // old rates untouched, new version differs
  });
});

describe("rankCandidates", () => {
  it("puts eligible workers first and gives every ineligible one a reason", () => {
    const line = { id: "l1", trade: "Mason" as const, quantity: 2, startDate: "2026-12-01", endDate: "2027-02-01", shift: "day" as const, skillLevelMin: 1 as const };
    const ranked = rankCandidates(
      line,
      "st-01",
      [
        worker("W-1", { status: "deployed" }),
        worker("W-2", { compliance: { state: "expired", missing: [], nextExpiry: { type: "residence_visa", expiryDate: "2026-11-01", daysLeft: -8 } } }),
        worker("W-3"),
        worker("W-4", { trade: "Welder" }),
      ],
      [],
    );
    expect(ranked.map((c) => c.worker.code)).not.toContain("W-4");
    expect(ranked[0]!.worker.code).toBe("W-3");
    expect(ranked[0]!.eligible).toBe(true);
    for (const c of ranked.slice(1)) {
      expect(c.eligible).toBe(false);
      expect(c.reasons.length).toBeGreaterThan(0);
    }
  });
});
