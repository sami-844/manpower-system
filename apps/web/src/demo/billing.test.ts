/**
 * Invariants of the billing and ledger demo data (Backend Schema "Billing and ledger" rules):
 * invoice total = subtotal + VAT, every journal balances, allocations never exceed the payment or
 * the invoice, and the shared story figure (Wadi Infrastructure owes OMR 27,410.250).
 */
import { describe, expect, it } from "vitest";
import { omr } from "@mms/core";
import { money } from "./core";
import { allInvoices, balanceOf, generateInvoices, issueInvoices, listAllocations, listExceptions, listPayments, outstandingFor, recordPayment } from "./billing";
import { bankReconciliation, closePeriod, isBalanced, listJournals, postManualJournal, trialBalance } from "./finance";

describe("billing and ledger demo data", () => {
  it("keeps the shared story: Wadi Infrastructure is over its 25,000.000 limit at 27,410.250", () => {
    expect(outstandingFor("cl-05")).toBe("27410.250");
  });

  it("prices every invoice so total = subtotal + VAT and subtotal = sum of lines", () => {
    generateInvoices("2026-10-01", "finance.lead");
    for (const i of allInvoices()) {
      expect(money.sum([i.subtotal, i.vat])).toBe(i.total);
      expect(money.sum(i.lines.map((l) => l.amount))).toBe(i.subtotal);
    }
  });

  it("blocks the draft with an unmatched rate instead of skipping it", () => {
    const ex = listExceptions();
    expect(ex.length).toBeGreaterThan(0);
    expect(ex.every((e) => e.line.rate === null)).toBe(true);
    expect(() => issueInvoices([ex[0]!.invoiceId], "finance.lead", "2026-11-09")).toThrow(/blocked/);
  });

  it("never allocates more than a payment or an invoice balance", () => {
    for (const p of listPayments()) {
      const applied = money.sum(listAllocations().filter((a) => a.paymentId === p.id).map((a) => a.amount));
      expect(omr(applied).lte(omr(p.amount))).toBe(true);
    }
    for (const i of allInvoices()) expect(omr(balanceOf(i)).gte(0)).toBe(true);
    const open = allInvoices().find((i) => i.clientId === "cl-05" && omr(balanceOf(i)).gt(0))!;
    expect(() =>
      recordPayment({ clientId: "cl-05", receivedOn: "2026-11-09", amount: "999999.000", method: "bank_transfer", reference: "x", allocations: [{ invoiceId: open.id, amount: money.sum([balanceOf(open), "0.001"]) }], by: "finance.lead" }),
    ).toThrow(/more than the balance/);
  });

  it("balances every journal, the trial balance and the bank reconciliation", () => {
    for (const j of listJournals()) expect(isBalanced(j), j.number).toBe(true);
    const tb = trialBalance("2026-12-31");
    expect(tb.debit).toBe(tb.credit);
    const r = bankReconciliation();
    const unmatched = money.sum(r.lines.filter((l) => !l.matchedJournalId).map((l) => l.amount));
    const notOnStatement = money.sum(r.notOnStatement.map((l) => l.amount));
    expect(r.difference).toBe(money.minus(unmatched, notOnStatement));
  });

  it("rejects postings to a closed period and an unfinished close", () => {
    expect(() => postManualJournal({ date: "2026-09-15", memo: "late", lines: [{ account: "6100", costCentreId: null, debit: "1.000", credit: "0" }, { account: "2300", costCentreId: null, debit: "0", credit: "1.000" }], by: "finance.lead" })).toThrow(/closed/);
    expect(() => closePeriod("2026-10", "finance.lead")).toThrow(/checklist/);
  });
});
