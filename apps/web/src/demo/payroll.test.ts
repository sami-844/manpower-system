// Money invariants of the demo pay engine (CLAUDE.md rule 2, Backend Schema `payslips`):
// net = gross − deductions exactly, net ≥ 0, run total = Σ nets. Fictional workers only.
import { describe, expect, it } from "vitest";
import { omr, sumOmr } from "@mms/core";
import type { WorkerListItem } from "@/lib/api";
import { TRADES } from "./reference";
import { buildPayslips, PERIODS, settlementOf, type ExitCase, type Loan } from "./payroll";

const workers: WorkerListItem[] = Array.from({ length: 400 }, (_, i) => ({
  id: `w-${i}`,
  code: `W-${String(i + 1).padStart(6, "0")}`,
  fullName: `Test Worker ${i + 1}`,
  nationality: "Testland",
  trade: TRADES[i % TRADES.length]!,
  status: i % 11 === 0 ? "on_leave" : "deployed",
  compliance: { state: "ok", missing: [], nextExpiry: null },
}));

// A loan far bigger than the deduction cap allows, so the cap path runs.
const greedy: Loan = {
  id: "LN-T1", workerId: "w-1", workerCode: "W-000002", workerName: "Test Worker 2", kind: "loan", principal: "7000.000", instalment: "1000.000",
  startPeriod: PERIODS[0]!, schedule: PERIODS.map((period) => ({ period, due: "1000.000" })), reason: "test", requestedBy: "payroll.officer",
  requestedAt: "2026-01-01T00:00:00Z", approver: "finance.lead", approvedBy: "finance.lead", approvedAt: "2026-01-02", status: "active",
};

describe("demo payroll engine", () => {
  for (const period of PERIODS) {
    it(`keeps every payslip's money exact for ${period}`, () => {
      const slips = buildPayslips(workers, period, `run-${period}`, [greedy]);
      for (const p of slips) {
        const earnings = sumOmr(p.lines.filter((l) => l.kind === "earning").map((l) => l.amount!));
        const deductions = sumOmr(p.lines.filter((l) => l.kind === "deduction").map((l) => l.amount!));
        expect(omr(p.gross).eq(earnings)).toBe(true);
        expect(omr(p.deductions).eq(deductions)).toBe(true);
        expect(omr(p.net).eq(omr(p.gross).minus(omr(p.deductions)))).toBe(true);
        expect(omr(p.net).isNegative()).toBe(false);
        // quantity × rate = amount on every hour/day line (the trace adds up).
        for (const l of p.lines) if (l.amount && l.rate && l.unit !== "of basic" && !l.trace.includes("capped")) expect(omr(l.rate).times(l.quantity).toDecimalPlaces(3).eq(omr(l.amount))).toBe(true);
      }
      const runNet = sumOmr(slips.map((p) => p.net));
      expect(runNet.eq(sumOmr(slips.map((p) => p.gross)).minus(sumOmr(slips.map((p) => p.deductions))))).toBe(true);
      // The cap held: deductions never exceed half of basic.
      const capped = slips.find((p) => p.workerCode === "W-000002")!;
      expect(omr(capped.deductions).lte(omr(capped.basic).times("0.5"))).toBe(true);
    });
  }

  it("is idempotent: the same inputs give the same run", () => {
    expect(buildPayslips(workers, PERIODS[6]!, "r", [greedy])).toEqual(buildPayslips(workers, PERIODS[6]!, "r", [greedy]));
  });

  it("never lets a settlement go negative", () => {
    const exit: ExitCase = {
      id: "SEP-T", workerId: "w-1", workerCode: "W-000002", workerName: "Test Worker 2", trade: "Mason", nationality: "Testland", siteName: "—", reason: "resignation",
      noticeDate: "2026-11-01", lastWorkingDay: "2026-11-10", reportDate: null, joinedOn: "2025-11-10", status: "in_progress", contractAllowsAssetDeduction: true,
      checklist: [], preparedBy: null, approvals: [], rehireEligible: null, closedAt: null,
    };
    const st = settlementOf(exit, [greedy], "150.000");
    expect(omr(st.total).eq(omr(st.earnings).minus(omr(st.deductions)))).toBe(true);
    expect(omr(st.total).isNegative()).toBe(false);
    expect(omr(st.unrecovered).gt(0)).toBe(true);
  });
});
