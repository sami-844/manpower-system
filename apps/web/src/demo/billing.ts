/**
 * DEMO DATA — billing and receivables (S-28 Invoices, S-29 Receivables): invoices, invoice lines,
 * credit notes, payments, payment allocations, VAT codes and fiscal periods (Backend Schema
 * "Billing and ledger"). Fictional and deterministic (see ./core.ts).
 *
 * Invoices are priced the way the billing engine will (Technical Spec §4.4): locked timesheet
 * hours per trade × hour type × the contract's rate card in force for the period, plus the
 * contract's fixed charges, plus VAT from the dated `vat_codes`. A line with no matching rate
 * blocks its invoice and lands in the exceptions queue; nothing is skipped silently.
 *
 * Story kept in step with other screens: Wadi Infrastructure Co. (cl-05) owes exactly
 * OMR 27,410.250 against a 25,000.000 credit limit.
 *
 * State is an in-memory store so actions (generate, issue, pay, credit) are real for the session.
 * Fiscal periods live here (not in finance.ts) because every posting module checks them first:
 * nothing posts to a closed period (CLAUDE.md rule 7).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatOmr, omr } from "@mms/core";
import { dates, delay, money, rng, todayOman } from "./core";
import { clientById, contractOf, SITES, siteById, type Contract, type HourType, type RateCard } from "./reference";

/** The date the seeded history runs to. Ageing on screen uses the live clock (`todayOman()`). */
export const DATA_DATE = "2026-11-09";

// ---------------------------------------------------------------------------------------------
// VAT codes (rule 3: legal values come from dated rules, never a bare constant)
// ---------------------------------------------------------------------------------------------
export type VatKey = "standard" | "exempt" | "out_of_scope";
export interface VatCode {
  key: VatKey;
  label: string;
  rate: string;
  validFrom: string;
  validTo: string | null;
}
export const VAT_CODES: VatCode[] = [
  { key: "standard", label: "Standard rate", rate: "0.05", validFrom: "2021-04-16", validTo: null },
  { key: "exempt", label: "Exempt", rate: "0.00", validFrom: "2021-04-16", validTo: null },
  { key: "out_of_scope", label: "Out of scope", rate: "0.00", validFrom: "2021-04-16", validTo: null },
];
export function vatCodeOn(key: VatKey, on: string): VatCode {
  const c = VAT_CODES.find((v) => v.key === key && v.validFrom <= on && (!v.validTo || v.validTo >= on));
  if (!c) throw new Error(`No ${key} VAT code in force on ${on}`);
  return c;
}
export const vatPercent = (c: VatCode) => omr(c.rate).times(100).toString();
/** "VAT 5% · vat_codes.standard v2021-04-16" */
export const vatRef = (c: VatCode) => `VAT ${vatPercent(c)}% · vat_codes.${c.key} v${c.validFrom}`;
export const vatOf = (amount: string, c: VatCode) => money.str(omr(amount).times(c.rate));

// ---------------------------------------------------------------------------------------------
// Fiscal periods (Backend Schema `fiscal_periods`)
// ---------------------------------------------------------------------------------------------
export type PeriodStatus = "open" | "closing" | "closed";
export interface FiscalPeriod {
  key: string; // "2026-10"
  year: number;
  month: number;
  status: PeriodStatus;
  closedBy: string | null;
  closedAt: string | null;
}
const periods: FiscalPeriod[] = Array.from({ length: 12 }, (_, i) => {
  const month = i + 1;
  const closed = month <= 9;
  return {
    key: `2026-${String(month).padStart(2, "0")}`,
    year: 2026,
    month,
    status: closed ? "closed" : "open",
    closedBy: closed ? "finance.lead" : null,
    closedAt: closed ? `${dates.addMonths(`2026-${String(month).padStart(2, "0")}-01`, 1).slice(0, 8)}08T14:30:00Z` : null,
  } satisfies FiscalPeriod;
});
export const periodOf = (date: string) => periods.find((p) => p.key === date.slice(0, 7));
export const listPeriods = () => periods;
export const periodName = (key: string) => dates.monthName(`${key}-01`);
/** Throws when the date falls in a closed period. Every posting calls this first. */
export function assertPeriodOpen(date: string) {
  const p = periodOf(date);
  if (!p) throw new Error(`No fiscal period for ${date}.`);
  if (p.status === "closed") throw new Error(`${periodName(p.key)} is closed. Nothing posts to a closed period; date it in an open period.`);
}

// ---------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------
export type InvoiceStatus = "draft" | "issued" | "part_paid" | "paid" | "disputed" | "written_off";
export type InvoiceView = InvoiceStatus | "overdue" | "blocked";

export interface InvoiceLine {
  id: string;
  kind: "hours" | "charge";
  description: string;
  trade: string | null;
  hourType: HourType | null;
  /** Hours for `hours` lines, workers for `charge` lines. Not money, so a number. */
  quantity: number;
  /** null when no rate line matches: the invoice is blocked. */
  rate: string | null;
  amount: string;
  timesheetRef: string | null;
  rateRef: string | null;
  vatCode: VatKey;
}
export interface InvoiceException {
  lineId: string;
  message: string;
}
export interface LineDispute {
  lineId: string;
  reason: string;
  raisedBy: string;
  raisedOn: string;
  resolved: boolean;
}
export interface Invoice {
  id: string;
  number: string | null;
  clientId: string;
  contractId: string;
  siteId: string;
  periodStart: string;
  periodEnd: string;
  issuedOn: string | null;
  dueDate: string | null;
  subtotal: string;
  vat: string;
  total: string;
  vatCode: VatKey;
  status: InvoiceStatus;
  timesheetRef: string;
  rateCardRef: string;
  lines: InvoiceLine[];
  exceptions: InvoiceException[];
  disputes: LineDispute[];
  createdBy: string;
  issuedBy: string | null;
}
export interface CreditNote {
  id: string;
  number: string | null;
  invoiceId: string;
  lineId: string | null;
  reason: string;
  amount: string;
  vat: string;
  total: string;
  status: "pending_approval" | "issued";
  requestedBy: string;
  requestedOn: string;
  approvedBy: string | null;
  issuedOn: string | null;
}
export type PaymentMethod = "bank_transfer" | "cheque" | "cash";
export interface Payment {
  id: string;
  number: string;
  clientId: string;
  receivedOn: string;
  amount: string;
  method: PaymentMethod;
  reference: string;
  bankStatementLineId: string | null;
  recordedBy: string;
}
export interface PaymentAllocation {
  paymentId: string;
  invoiceId: string;
  amount: string;
}
export interface HeldLine {
  id: string;
  invoiceId: string;
  siteId: string;
  line: InvoiceLine;
  reason: string;
  heldBy: string;
  heldOn: string;
}
export interface Reminder {
  invoiceId: string;
  step: number;
  sentOn: string;
  sentBy: string;
}

export const HOUR_LABEL: Record<HourType, string> = { normal: "Normal", overtime: "Overtime", rest_day: "Rest day", holiday: "Public holiday", night: "Night" };
const CHARGE_LABEL: Record<Contract["charges"][number]["kind"], string> = { accommodation: "Accommodation", transport: "Transport", mobilisation: "Mobilisation", other: "Other charge" };

// ---------------------------------------------------------------------------------------------
// Locked timesheet hours (the same hours payroll reads)
// ---------------------------------------------------------------------------------------------
const CREWS: Record<string, [string, number][]> = {
  "st-01": [["General labourer", 32], ["Mason", 17], ["Steel fixer", 18], ["Carpenter", 13], ["Scaffolder", 7], ["Equipment operator", 3]],
  "st-02": [["General labourer", 24], ["Mason", 15], ["Steel fixer", 13], ["Electrician", 10], ["Plumber", 8], ["Carpenter", 7]],
  "st-03": [["Welder", 17], ["Steel fixer", 13], ["General labourer", 14], ["Equipment operator", 4], ["Driver", 4]],
  "st-04": [["General labourer", 14], ["Mason", 9], ["Scaffolder", 6], ["Carpenter", 7]],
  "st-05": [["General labourer", 18], ["Equipment operator", 7], ["Welder", 8], ["Driver", 6]],
  "st-06": [["General labourer", 18], ["Equipment operator", 8], ["Driver", 8], ["Mason", 6]],
  "st-07": [["Electrician", 4], ["Plumber", 3], ["Carpenter", 3]],
  "st-08": [["General labourer", 5], ["Electrician", 2], ["Plumber", 2]],
};
/** Four riggers joined Duqm Breakwater on 12 Oct; the Coastal Marine rate card has no Rigger rate. */
const crewOf = (siteId: string, month: string): [string, number][] =>
  siteId === "st-05" && month >= "2026-10-01" ? [...CREWS[siteId]!, ["Rigger", 4]] : CREWS[siteId]!;

export const headcountOf = (siteId: string, month: string) => crewOf(siteId, month).reduce((n, [, c]) => n + c, 0);
export const timesheetRefOf = (siteId: string, month: string) => `TS-${month.slice(0, 4)}-${month.slice(5, 7)}-${siteById(siteId)!.code}`;

export interface TimesheetHours {
  trade: string;
  hourType: HourType;
  hours: number;
}
export function timesheetHours(siteId: string, month: string): TimesheetHours[] {
  const r = rng(`ts:${siteId}:${month}`);
  const workDays = dates.range(month, dates.monthEnd(month)).filter((d) => dates.weekday(d) !== 5).length;
  const out: TimesheetHours[] = [];
  for (const [trade, hc] of crewOf(siteId, month)) {
    const days = trade === "Rigger" ? 16 : workDays;
    out.push({ trade, hourType: "normal", hours: Math.round(hc * days * 8 * (0.94 + r.next() * 0.05)) });
    out.push({ trade, hourType: "overtime", hours: hc * r.int(trade === "Rigger" ? 2 : 8, trade === "Rigger" ? 4 : 26) });
    if (trade !== "Rigger" && r.chance(0.4)) out.push({ trade, hourType: "rest_day", hours: hc * r.int(2, 8) });
  }
  return out;
}

const cardFor = (contract: Contract, periodStart: string): RateCard => {
  const card = contract.rateCards.find((c) => c.validFrom <= periodStart && (!c.validTo || c.validTo >= periodStart));
  if (!card) throw new Error(`No rate card for ${contract.reference} on ${periodStart}`);
  return card;
};

function recompute(inv: Invoice) {
  inv.subtotal = money.sum(inv.lines.map((l) => l.amount));
  inv.vat = vatOf(inv.subtotal, vatCodeOn(inv.vatCode, inv.periodEnd));
  inv.total = money.sum([inv.subtotal, inv.vat]);
}

/** Price one site's locked hours for a month (draft). */
export function buildInvoice(siteId: string, month: string, createdBy: string): Invoice {
  const site = siteById(siteId)!;
  const contract = contractOf(site.clientId)!;
  const card = cardFor(contract, month);
  const id = `inv-${month.slice(0, 7)}-${siteId}`;
  const tsRef = timesheetRefOf(siteId, month);
  const lines: InvoiceLine[] = [];
  const exceptions: InvoiceException[] = [];
  for (const t of timesheetHours(siteId, month)) {
    const rl = card.lines.find((l) => l.trade === t.trade && l.hourType === t.hourType);
    const lineId = `${id}-l${lines.length + 1}`;
    lines.push({
      id: lineId,
      kind: "hours",
      description: `${t.trade} · ${HOUR_LABEL[t.hourType]}`,
      trade: t.trade,
      hourType: t.hourType,
      quantity: t.hours,
      rate: rl?.rate ?? null,
      amount: rl ? money.times(rl.rate, t.hours) : "0.000",
      timesheetRef: tsRef,
      rateRef: rl ? `${card.id} v${card.version}` : null,
      vatCode: "standard",
    });
    if (!rl) exceptions.push({ lineId, message: `No rate for ${t.trade} · ${HOUR_LABEL[t.hourType].toLowerCase()} hours on rate card v${card.version} (${card.id})` });
  }
  const hc = headcountOf(siteId, month);
  for (const ch of contract.charges) {
    lines.push({
      id: `${id}-l${lines.length + 1}`,
      kind: "charge",
      description: `${CHARGE_LABEL[ch.kind]} · ${hc} workers × OMR ${ch.amount} / month`,
      trade: null,
      hourType: null,
      quantity: hc,
      rate: ch.amount,
      amount: money.times(ch.amount, hc),
      timesheetRef: null,
      rateRef: contract.reference,
      vatCode: "standard",
    });
  }
  const inv: Invoice = {
    id,
    number: null,
    clientId: site.clientId,
    contractId: contract.id,
    siteId,
    periodStart: month,
    periodEnd: dates.monthEnd(month),
    issuedOn: null,
    dueDate: null,
    subtotal: "0.000",
    vat: "0.000",
    total: "0.000",
    vatCode: "standard",
    status: "draft",
    timesheetRef: tsRef,
    rateCardRef: `${card.id} v${card.version}`,
    lines,
    exceptions,
    disputes: [],
    createdBy,
    issuedBy: null,
  };
  recompute(inv);
  return inv;
}

// ---------------------------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------------------------
interface BillingDb {
  invoices: Invoice[];
  creditNotes: CreditNote[];
  payments: Payment[];
  allocations: PaymentAllocation[];
  heldLines: HeldLine[];
  reminders: Reminder[];
  seq: { invoice: number; credit: number; payment: number };
  generated: Set<string>;
}

const db: BillingDb = { invoices: [], creditNotes: [], payments: [], allocations: [], heldLines: [], reminders: [], seq: { invoice: 361, credit: 17, payment: 101 }, generated: new Set() };

const cmp = (a: string, b: string) => omr(a).cmp(omr(b));
const fmt = (s: string) => formatOmr(omr(s));

export function balanceOf(inv: Pick<Invoice, "id" | "total">): string {
  const paid = db.allocations.filter((a) => a.invoiceId === inv.id).map((a) => a.amount);
  const credited = db.creditNotes.filter((c) => c.invoiceId === inv.id && c.status === "issued").map((c) => c.total);
  return money.minus(inv.total, money.sum([...paid, ...credited]));
}

function refreshStatus(inv: Invoice) {
  if (inv.status === "draft" || inv.status === "written_off") return;
  const bal = balanceOf(inv);
  if (inv.disputes.some((d) => !d.resolved)) inv.status = "disputed";
  else if (cmp(bal, "0") <= 0) inv.status = "paid";
  else if (cmp(bal, inv.total) < 0) inv.status = "part_paid";
  else inv.status = "issued";
}

function issue(inv: Invoice, on: string, by: string) {
  const client = clientById(inv.clientId)!;
  inv.number = `INV-2026-${String(db.seq.invoice++).padStart(5, "0")}`;
  inv.issuedOn = on;
  inv.dueDate = dates.addDays(on, client.paymentTermsDays);
  inv.issuedBy = by;
  inv.status = "issued";
}

function addPayment(p: Omit<Payment, "id" | "number">, allocs: { invoiceId: string; amount: string }[]): Payment {
  const n = db.seq.payment++;
  const payment: Payment = { ...p, id: `pay-${n}`, number: `RCP-2026-${String(n).padStart(4, "0")}` };
  db.payments.push(payment);
  for (const a of allocs) db.allocations.push({ paymentId: payment.id, invoiceId: a.invoiceId, amount: a.amount });
  for (const a of allocs) refreshStatus(db.invoices.find((i) => i.id === a.invoiceId)!);
  return payment;
}

/** Reminder schedule (PRD 4.8: automated reminders), days from the due date. */
/** Days after the due date each client usually pays (Wadi is handled separately). */
const PAY_DELAY: Record<string, number> = { "cl-01": 8, "cl-02": 3, "cl-03": 1, "cl-04": 20, "cl-06": 45 };
const ref = (r: ReturnType<typeof rng>) => `TRF ${r.int(10000, 99999)}`;

export const REMINDER_STEPS = [
  { days: -5, label: "Upcoming payment" },
  { days: 1, label: "Overdue notice" },
  { days: 14, label: "Second notice" },
  { days: 30, label: "Final notice · copy to owner" },
  { days: 60, label: "Supply review with operations" },
] as const;

/** History: May–September issued on the 3rd of the next month, then payments, credits, reminders. */
(function seed() {
  for (const m of ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"]) {
    for (const s of SITES) {
      const inv = buildInvoice(s.id, m, "finance.lead");
      issue(inv, dates.addDays(dates.monthEnd(m), 3), "finance.lead");
      db.invoices.push(inv);
    }
  }
  const inv = (id: string) => db.invoices.find((i) => i.id === id)!;
  const r = rng("billing:payments");

  // Batinah Steel: credit note for driver hours billed at overtime (approved, before payment).
  const steelAug = inv("inv-2026-08-st-03");
  const card = cardFor(contractOf("cl-03")!, "2026-08-01");
  const rate = (h: HourType) => card.lines.find((l) => l.trade === "Driver" && l.hourType === h)!.rate;
  const cnAmount = money.times(money.minus(rate("overtime"), rate("normal")), 144);
  const otLine = steelAug.lines.find((l) => l.trade === "Driver" && l.hourType === "overtime")!;
  db.creditNotes.push({
    id: "cn-16",
    number: "CN-2026-00016",
    invoiceId: steelAug.id,
    lineId: otLine.id,
    reason: "Driver hours on 4–6 Aug were charged at overtime; the client's signed sheet shows normal hours.",
    amount: cnAmount,
    vat: vatOf(cnAmount, vatCodeOn("standard", "2026-09-18")),
    total: money.sum([cnAmount, vatOf(cnAmount, vatCodeOn("standard", "2026-09-18"))]),
    status: "issued",
    requestedBy: "finance.lead",
    requestedOn: "2026-09-16",
    approvedBy: "owner.gm",
    issuedOn: "2026-09-18",
  });

  // Al Noor: September overtime line disputed; credit note waits for a second approver.
  const noorSep = inv("inv-2026-09-st-02");
  const disputed = noorSep.lines.find((l) => l.trade === "Steel fixer" && l.hourType === "overtime")!;
  noorSep.disputes.push({ lineId: disputed.id, reason: "Client says 64 overtime hours on 14–15 Sep were not authorised by their site manager.", raisedBy: "finance.lead", raisedOn: "2026-11-03", resolved: false });
  const noorCn = money.times(disputed.rate!, 64);
  db.creditNotes.push({
    id: "cn-pending-1",
    number: null,
    invoiceId: noorSep.id,
    lineId: disputed.id,
    reason: "Credit 64 unauthorised overtime hours (Steel fixer, 14–15 Sep).",
    amount: noorCn,
    vat: vatOf(noorCn, vatCodeOn("standard", DATA_DATE)),
    total: money.sum([noorCn, vatOf(noorCn, vatCodeOn("standard", DATA_DATE))]),
    status: "pending_approval",
    requestedBy: "finance.lead",
    requestedOn: "2026-11-05",
    approvedBy: null,
    issuedOn: null,
  });
  refreshStatus(noorSep);

  // Regular payers: whole balance a few days after the due date, if that day has passed.
  for (const i of db.invoices) {
    if (i.clientId === "cl-05" || i.id === noorSep.id || i.id === "inv-2026-05-st-08") continue;
    const receivedOn = dates.addDays(i.dueDate!, PAY_DELAY[i.clientId]! + r.int(0, 3));
    if (receivedOn > "2026-11-06") continue;
    addPayment({ clientId: i.clientId, receivedOn, amount: balanceOf(i), method: "bank_transfer", reference: ref(r), bankStatementLineId: null, recordedBy: "finance.lead" }, [{ invoiceId: i.id, amount: balanceOf(i) }]);
  }

  // Crescent Facilities: May invoice for Qurum Mall only part paid (now 90+ days).
  const qurumMay = inv("inv-2026-05-st-08");
  const part = money.times(qurumMay.total, "0.6");
  addPayment({ clientId: "cl-06", receivedOn: "2026-07-25", amount: part, method: "cheque", reference: "CHQ 001187", bankStatementLineId: null, recordedBy: "finance.lead" }, [{ invoiceId: qurumMay.id, amount: part }]);

  // Wadi Infrastructure: pays the invoices its remittances name, leaving June part paid and
  // September open, so the balance is exactly OMR 27,410.250 against a 25,000.000 limit.
  const w = (m: string) => inv(`inv-2026-${m}-st-06`);
  addPayment({ clientId: "cl-05", receivedOn: "2026-07-28", amount: w("05").total, method: "bank_transfer", reference: "TRF 40712", bankStatementLineId: null, recordedBy: "finance.lead" }, [{ invoiceId: w("05").id, amount: w("05").total }]);
  addPayment({ clientId: "cl-05", receivedOn: "2026-09-24", amount: w("07").total, method: "bank_transfer", reference: "TRF 41958", bankStatementLineId: null, recordedBy: "finance.lead" }, [{ invoiceId: w("07").id, amount: w("07").total }]);
  const junePart = money.minus(money.sum([w("06").total, w("09").total]), "27410.250");
  addPayment(
    { clientId: "cl-05", receivedOn: "2026-10-22", amount: money.sum([w("08").total, junePart]), method: "bank_transfer", reference: "TRF 43307", bankStatementLineId: null, recordedBy: "finance.lead" },
    [
      { invoiceId: w("08").id, amount: w("08").total },
      { invoiceId: w("06").id, amount: junePart },
    ],
  );

  // Automatic reminders already sent (older than three days); recent steps wait for a person.
  for (const i of db.invoices) {
    if (cmp(balanceOf(i), "0") <= 0 || i.status === "disputed") continue;
    REMINDER_STEPS.forEach((s, step) => {
      const on = dates.addDays(i.dueDate!, s.days);
      if (on <= dates.addDays(DATA_DATE, -3)) db.reminders.push({ invoiceId: i.id, step, sentOn: on, sentBy: "system" });
    });
  }
})();

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------
export const isOverdue = (inv: Pick<Invoice, "status" | "dueDate">, today: string) => (inv.status === "issued" || inv.status === "part_paid") && !!inv.dueDate && inv.dueDate < today;
export function viewOf(inv: Invoice, today: string): InvoiceView {
  if (inv.status === "draft" && inv.exceptions.length) return "blocked";
  return isOverdue(inv, today) ? "overdue" : inv.status;
}

export interface InvoiceRow extends Omit<Invoice, "lines" | "disputes"> {
  clientName: string;
  siteName: string;
  contractRef: string;
  balance: string;
  view: InvoiceView;
}
export function listInvoices(today = todayOman()): InvoiceRow[] {
  return db.invoices
    .map((i) => {
      const { lines: _lines, disputes: _disputes, ...rest } = i;
      return {
        ...rest,
        clientName: clientById(i.clientId)!.legalName,
        siteName: siteById(i.siteId)!.name,
        contractRef: contractOf(i.clientId)!.reference,
        balance: i.status === "draft" ? i.total : balanceOf(i),
        view: viewOf(i, today),
      };
    })
    .sort((a, b) => (b.periodStart.localeCompare(a.periodStart) || (a.number ?? "").localeCompare(b.number ?? "") || a.siteId.localeCompare(b.siteId)));
}

export interface InvoiceDetail {
  invoice: Invoice;
  balance: string;
  view: InvoiceView;
  payments: (PaymentAllocation & { payment: Payment })[];
  creditNotes: CreditNote[];
  reminders: Reminder[];
  held: HeldLine[];
}
export function getInvoice(id: string, today = todayOman()): InvoiceDetail | null {
  const invoice = db.invoices.find((i) => i.id === id);
  if (!invoice) return null;
  return {
    invoice,
    balance: invoice.status === "draft" ? invoice.total : balanceOf(invoice),
    view: viewOf(invoice, today),
    payments: db.allocations.filter((a) => a.invoiceId === id).map((a) => ({ ...a, payment: db.payments.find((p) => p.id === a.paymentId)! })),
    creditNotes: db.creditNotes.filter((c) => c.invoiceId === id),
    reminders: db.reminders.filter((r) => r.invoiceId === id),
    held: db.heldLines.filter((h) => h.invoiceId === id),
  };
}

export const listPayments = () => db.payments;
export const listAllocations = () => db.allocations;
export const listCreditNotes = () => db.creditNotes;
export const listHeldLines = () => db.heldLines;
export const allInvoices = () => db.invoices;
export const isGenerated = (month: string) => db.generated.has(month);

export interface Exception {
  invoiceId: string;
  siteName: string;
  clientName: string;
  contractId: string;
  line: InvoiceLine;
  message: string;
}
export function listExceptions(): Exception[] {
  return db.invoices.flatMap((i) =>
    i.exceptions.map((e) => ({
      invoiceId: i.id,
      siteName: siteById(i.siteId)!.name,
      clientName: clientById(i.clientId)!.legalName,
      contractId: i.contractId,
      line: i.lines.find((l) => l.id === e.lineId)!,
      message: e.message,
    })),
  );
}

export type AgeBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90";
export const AGE_BUCKETS: { key: AgeBucket; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "d1_30", label: "1–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90", label: "90+ days" },
];
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
export const daysOverdue = (due: string, today: string) => daysBetween(due, today);
const bucketOf = (due: string, today: string): AgeBucket => {
  const d = daysBetween(due, today);
  return d <= 0 ? "current" : d <= 30 ? "d1_30" : d <= 60 ? "d31_60" : d <= 90 ? "d61_90" : "d90";
};

export interface AgeingRow {
  clientId: string;
  clientName: string;
  creditLimit: string;
  buckets: Record<AgeBucket, string>;
  total: string;
  overLimit: boolean;
  /** Share of the limit used, whole percent (display only). */
  usedPct: number;
}
export interface ReminderRow {
  invoiceId: string;
  number: string;
  clientId: string;
  clientName: string;
  dueDate: string;
  daysOverdue: number;
  balance: string;
  lastSent: Reminder | null;
  nextStep: number | null;
  nextOn: string | null;
}
export interface ReceivablesSummary {
  outstanding: string;
  overdue: string;
  overdueCount: number;
  dso: number;
  collectedThisMonth: string;
  collectedCount: number;
  ageing: AgeingRow[];
  bucketTotals: Record<AgeBucket, string>;
  reminders: ReminderRow[];
}
export function receivablesSummary(today = todayOman()): ReceivablesSummary {
  const open = db.invoices.filter((i) => i.status !== "draft" && i.status !== "written_off" && cmp(balanceOf(i), "0") > 0);
  const zero = (): Record<AgeBucket, string> => ({ current: "0.000", d1_30: "0.000", d31_60: "0.000", d61_90: "0.000", d90: "0.000" });
  const byClient = new Map<string, Record<AgeBucket, string>>();
  const totals = zero();
  for (const i of open) {
    const b = bucketOf(i.dueDate!, today);
    const bal = balanceOf(i);
    const row = byClient.get(i.clientId) ?? zero();
    row[b] = money.sum([row[b], bal]);
    totals[b] = money.sum([totals[b], bal]);
    byClient.set(i.clientId, row);
  }
  const ageing = [...byClient.entries()].map(([clientId, buckets]) => {
    const c = clientById(clientId)!;
    const total = money.sum(Object.values(buckets));
    return { clientId, clientName: c.legalName, creditLimit: c.creditLimit, buckets, total, overLimit: cmp(total, c.creditLimit) > 0, usedPct: Number(omr(total).div(omr(c.creditLimit)).times(100).toFixed(0)) };
  }).sort((a, b) => cmp(b.total, a.total));

  const outstanding = money.sum(open.map(balanceOf));
  const overdueInv = open.filter((i) => i.dueDate! < today && i.status !== "disputed");
  const overdue = money.sum(overdueInv.map(balanceOf));
  const since = dates.addDays(today, -90);
  const billed90 = money.sum(db.invoices.filter((i) => i.issuedOn && i.issuedOn > since && i.issuedOn <= today).map((i) => i.total));
  const dso = cmp(billed90, "0") > 0 ? Number(omr(outstanding).div(omr(billed90)).times(90).toFixed(0)) : 0;
  const month = today.slice(0, 7);
  const collected = db.payments.filter((p) => p.receivedOn.slice(0, 7) === month);

  const reminders: ReminderRow[] = open
    .filter((i) => i.status !== "disputed")
    .map((i) => {
      const sent = db.reminders.filter((r) => r.invoiceId === i.id).sort((a, b) => a.step - b.step);
      const last = sent.at(-1) ?? null;
      const nextStep = last ? (last.step + 1 < REMINDER_STEPS.length ? last.step + 1 : null) : 0;
      return {
        invoiceId: i.id,
        number: i.number!,
        clientId: i.clientId,
        clientName: clientById(i.clientId)!.legalName,
        dueDate: i.dueDate!,
        daysOverdue: daysBetween(i.dueDate!, today),
        balance: balanceOf(i),
        lastSent: last,
        nextStep,
        nextOn: nextStep == null ? null : dates.addDays(i.dueDate!, REMINDER_STEPS[nextStep]!.days),
      };
    })
    .sort((a, b) => (a.nextOn ?? "9").localeCompare(b.nextOn ?? "9"));

  return { outstanding, overdue, overdueCount: overdueInv.length, dso, collectedThisMonth: money.sum(collected.map((p) => p.amount)), collectedCount: collected.length, ageing, bucketTotals: totals, reminders };
}

export const outstandingFor = (clientId: string) =>
  money.sum(db.invoices.filter((i) => i.clientId === clientId && i.status !== "draft" && i.status !== "written_off").map(balanceOf));

export const openInvoicesFor = (clientId: string) =>
  db.invoices
    .filter((i) => i.clientId === clientId && i.status !== "draft" && i.status !== "written_off" && cmp(balanceOf(i), "0") > 0)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .map((i) => ({ id: i.id, number: i.number!, siteName: siteById(i.siteId)!.name, periodStart: i.periodStart, dueDate: i.dueDate!, total: i.total, balance: balanceOf(i), status: i.status }));

// ---------------------------------------------------------------------------------------------
// Actions (each validates like the API will, then mutates the session store)
// ---------------------------------------------------------------------------------------------
export function generateInvoices(month: string, by: string) {
  if (db.generated.has(month)) throw new Error(`Invoices for ${dates.monthName(month)} are already generated.`);
  const created = SITES.map((s) => buildInvoice(s.id, month, by));
  db.invoices.push(...created);
  db.generated.add(month);
  return { created: created.length, blocked: created.filter((i) => i.exceptions.length).length, total: money.sum(created.map((i) => i.total)) };
}

export function issueInvoices(ids: string[], by: string, on = todayOman()) {
  assertPeriodOpen(on);
  const targets = ids.map((id) => db.invoices.find((i) => i.id === id)!);
  const blocked = targets.filter((i) => i.exceptions.length);
  if (blocked.length) throw new Error(`${blocked.length} selected invoice${blocked.length > 1 ? "s are" : " is"} blocked by an unmatched rate. Fix or hold the line first.`);
  if (targets.some((i) => i.status !== "draft")) throw new Error("Only drafts can be issued. Issued invoices are locked.");
  for (const i of targets) issue(i, on, by);
  return { count: targets.length, total: money.sum(targets.map((i) => i.total)), numbers: targets.map((i) => i.number!) };
}

/** Takes an unpriced line off a draft so the rest can be issued; it stays visible as held. */
export function holdLine(invoiceId: string, lineId: string, by: string) {
  const inv = db.invoices.find((i) => i.id === invoiceId)!;
  if (inv.status !== "draft") throw new Error("Only draft lines can be held.");
  const line = inv.lines.find((l) => l.id === lineId)!;
  inv.lines = inv.lines.filter((l) => l.id !== lineId);
  inv.exceptions = inv.exceptions.filter((e) => e.lineId !== lineId);
  recompute(inv);
  db.heldLines.push({ id: `held-${db.heldLines.length + 1}`, invoiceId, siteId: inv.siteId, line, reason: "Awaiting a rate on the rate card; bills on the next run once approved.", heldBy: by, heldOn: todayOman() });
  return line;
}

export function disputeLine(invoiceId: string, lineId: string, reason: string, by: string) {
  const inv = db.invoices.find((i) => i.id === invoiceId)!;
  if (inv.status === "draft") throw new Error("Drafts are not disputed; edit or regenerate the draft.");
  if (!reason.trim()) throw new Error("Say what the client disputes.");
  if (inv.disputes.some((d) => d.lineId === lineId && !d.resolved)) throw new Error("This line is already disputed.");
  inv.disputes.push({ lineId, reason: reason.trim(), raisedBy: by, raisedOn: todayOman(), resolved: false });
  refreshStatus(inv);
}

export function raiseCreditNote(input: { invoiceId: string; lineId: string | null; amount: string; reason: string; by: string }) {
  const inv = db.invoices.find((i) => i.id === input.invoiceId)!;
  if (inv.status === "draft") throw new Error("Drafts are corrected directly; credit notes are for issued invoices.");
  if (!/^\d+(\.\d{1,3})?$/.test(input.amount) || cmp(input.amount, "0") <= 0) throw new Error("Enter an amount above zero, up to 3 decimals.");
  if (!input.reason.trim()) throw new Error("Give the reason the client will see on the credit note.");
  const vat = vatOf(input.amount, vatCodeOn(inv.vatCode, todayOman()));
  const total = money.sum([input.amount, vat]);
  const pending = money.sum(db.creditNotes.filter((c) => c.invoiceId === inv.id && c.status === "pending_approval").map((c) => c.total));
  const room = money.minus(balanceOf(inv), pending);
  if (cmp(total, room) > 0) throw new Error(`Credit with VAT (${fmt(total)}) is more than the open balance not already being credited (${fmt(room)}).`);
  const cn: CreditNote = { id: `cn-pending-${db.creditNotes.length + 1}`, number: null, invoiceId: inv.id, lineId: input.lineId, reason: input.reason.trim(), amount: money.str(omr(input.amount)), vat, total, status: "pending_approval", requestedBy: input.by, requestedOn: todayOman(), approvedBy: null, issuedOn: null };
  db.creditNotes.push(cn);
  return cn;
}

export function approveCreditNote(id: string, by: string) {
  const cn = db.creditNotes.find((c) => c.id === id)!;
  if (cn.status !== "pending_approval") throw new Error("Already issued.");
  if (cn.requestedBy === by) throw new Error("Needs a second approver: the person who raised a credit note cannot approve it.");
  const on = todayOman();
  assertPeriodOpen(on);
  cn.status = "issued";
  cn.approvedBy = by;
  cn.issuedOn = on;
  cn.number = `CN-2026-${String(db.seq.credit++).padStart(5, "0")}`;
  const inv = db.invoices.find((i) => i.id === cn.invoiceId)!;
  for (const d of inv.disputes) if (d.lineId === cn.lineId) d.resolved = true;
  refreshStatus(inv);
  return cn;
}

export function recordPayment(input: { clientId: string; receivedOn: string; amount: string; method: PaymentMethod; reference: string; allocations: { invoiceId: string; amount: string }[]; bankStatementLineId?: string | null; by: string }) {
  if (!/^\d+(\.\d{1,3})?$/.test(input.amount) || cmp(input.amount, "0") <= 0) throw new Error("Enter the amount received, above zero, up to 3 decimals.");
  assertPeriodOpen(input.receivedOn);
  const allocs = input.allocations.filter((a) => cmp(a.amount || "0", "0") > 0);
  for (const a of allocs) {
    if (!/^\d+(\.\d{1,3})?$/.test(a.amount)) throw new Error("Allocations are amounts with up to 3 decimals.");
    const inv = db.invoices.find((i) => i.id === a.invoiceId)!;
    if (inv.clientId !== input.clientId) throw new Error(`${inv.number} belongs to another client.`);
    if (inv.status === "draft") throw new Error("Payments are allocated to issued invoices only.");
    if (cmp(a.amount, balanceOf(inv)) > 0) throw new Error(`${fmt(a.amount)} is more than the balance on ${inv.number} (${fmt(balanceOf(inv))}).`);
  }
  if (cmp(money.sum(allocs.map((a) => a.amount)), input.amount) > 0) throw new Error("Allocations add up to more than the payment.");
  return addPayment(
    { clientId: input.clientId, receivedOn: input.receivedOn, amount: money.str(omr(input.amount)), method: input.method, reference: input.reference.trim() || "—", bankStatementLineId: input.bankStatementLineId ?? null, recordedBy: input.by },
    allocs.map((a) => ({ invoiceId: a.invoiceId, amount: money.str(omr(a.amount)) })),
  );
}

export function sendReminder(invoiceId: string, by: string) {
  const sent = db.reminders.filter((r) => r.invoiceId === invoiceId);
  const step = Math.min(sent.length ? Math.max(...sent.map((r) => r.step)) + 1 : 0, REMINDER_STEPS.length - 1);
  const r: Reminder = { invoiceId, step, sentOn: todayOman(), sentBy: by };
  db.reminders.push(r);
  return { ...r, label: REMINDER_STEPS[step]!.label };
}

// ---------------------------------------------------------------------------------------------
// React Query wiring: reads behind `delay()` (skeletons are real), actions invalidate both
// money modules so every screen agrees.
// ---------------------------------------------------------------------------------------------
/** Deep copy so React Query sees new data after an in-place store change. */
export const read = <T>(f: () => T, ms?: number) => delay(structuredClone(f()), ms);

export const billingKeys = {
  invoices: ["billing", "invoices"] as const,
  invoice: (id: string) => ["billing", "invoice", id] as const,
  exceptions: ["billing", "exceptions"] as const,
  receivables: ["billing", "receivables"] as const,
};

export function useDemoMutation<A, R>(fn: (a: A) => R, onDone?: (r: R, a: A) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: A) => delay(fn(a), 300),
    onSuccess: (r, a) => {
      void qc.invalidateQueries({ queryKey: ["billing"] });
      void qc.invalidateQueries({ queryKey: ["finance"] });
      onDone?.(r, a);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "That didn't work. Try again."),
  });
}
