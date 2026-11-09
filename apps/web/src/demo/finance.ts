/**
 * DEMO DATA — finance ledger (S-30 Ledger and close, S-31 Supplier bills): chart of accounts,
 * cost centres, journals and journal lines, suppliers, supplier bills, the company bank account
 * and its statement lines (Backend Schema "Billing and ledger", PRD 4.17). Fictional and
 * deterministic (see ./core.ts); the bank account number is masked, never real.
 *
 * Journals are derived from the source records (invoices, credit notes, payments, payroll, bills)
 * plus stored manual journals, so they always agree with the screens that own those records.
 * Every journal balances (debits = credits) and nothing posts to a closed period.
 */
import { omr } from "@mms/core";
import { dates, money, rng } from "./core";
import { CLIENTS, clientById, SITES } from "./reference";
import {
  allInvoices,
  assertPeriodOpen,
  buildInvoice,
  DATA_DATE,
  isGenerated,
  listAllocations,
  listCreditNotes,
  listPayments,
  periodName,
  periodOf,
  recordPayment,
  vatCodeOn,
  vatOf,
  type VatKey,
} from "./billing";

export { listPeriods, periodName, periodOf, VAT_CODES, vatCodeOn, vatRef } from "./billing";

// ---------------------------------------------------------------------------------------------
// Chart of accounts and cost centres
// ---------------------------------------------------------------------------------------------
export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export interface Account {
  code: string;
  name: string;
  type: AccountType;
}
export const ACCOUNTS: Account[] = [
  { code: "1000", name: "Bank Muscat current ••••0172", type: "asset" },
  { code: "1100", name: "Trade receivables", type: "asset" },
  { code: "1200", name: "VAT input recoverable", type: "asset" },
  { code: "2000", name: "Trade payables", type: "liability" },
  { code: "2100", name: "VAT output payable", type: "liability" },
  { code: "2150", name: "Unapplied receipts", type: "liability" },
  { code: "2200", name: "Salaries payable", type: "liability" },
  { code: "2300", name: "Accrued expenses", type: "liability" },
  { code: "3000", name: "Retained earnings", type: "equity" },
  { code: "3100", name: "Owner's capital", type: "equity" },
  { code: "4000", name: "Manpower supply revenue", type: "income" },
  { code: "4100", name: "Recharged accommodation and transport", type: "income" },
  { code: "5000", name: "Direct wages", type: "expense" },
  { code: "5100", name: "Overtime and rest-day pay", type: "expense" },
  { code: "5200", name: "Camp accommodation", type: "expense" },
  { code: "5300", name: "Bus fuel and maintenance", type: "expense" },
  { code: "5400", name: "Visa and permit fees", type: "expense" },
  { code: "5500", name: "Recruitment agency fees", type: "expense" },
  { code: "6100", name: "Office rent and utilities", type: "expense" },
  { code: "6200", name: "Bank charges", type: "expense" },
];
export const accountByCode = (code: string) => ACCOUNTS.find((a) => a.code === code)!;
export const BANK_ACCOUNT = { bank: "Bank Muscat", masked: "••••0172", currency: "OMR", ledgerAccount: "1000" };

export type CostCentreKind = "client" | "site" | "camp" | "office";
export interface CostCentre {
  id: string;
  code: string;
  name: string;
  kind: CostCentreKind;
}
export const COST_CENTRES: CostCentre[] = [
  ...CLIENTS.map((c) => ({ id: `cc-${c.id}`, code: `CC-${c.code}`, name: c.legalName, kind: "client" as const })),
  ...SITES.map((s) => ({ id: `cc-${s.id}`, code: `CC-${s.code}`, name: s.name, kind: "site" as const })),
  { id: "cc-camp-soh", code: "CC-CAMP-SOH", name: "Sohar labour camp", kind: "camp" },
  { id: "cc-camp-nzw", code: "CC-CAMP-NZW", name: "Nizwa labour camp", kind: "camp" },
  { id: "cc-office", code: "CC-OFFICE", name: "Head office, Muscat", kind: "office" },
];
export const costCentreById = (id: string | null) => (id ? COST_CENTRES.find((c) => c.id === id) : undefined);

// ---------------------------------------------------------------------------------------------
// Suppliers and bills
// ---------------------------------------------------------------------------------------------
export type BillCategory = "camp_rent" | "bus_fuel" | "bus_maintenance" | "visa_fees" | "agency_fees" | "office_rent";
export const CATEGORY_LABEL: Record<BillCategory, string> = {
  camp_rent: "Camp rent",
  bus_fuel: "Bus fuel",
  bus_maintenance: "Bus maintenance",
  visa_fees: "Visa and permit fees",
  agency_fees: "Agency fees",
  office_rent: "Office rent",
};
const CATEGORY_ACCOUNT: Record<BillCategory, string> = { camp_rent: "5200", bus_fuel: "5300", bus_maintenance: "5300", visa_fees: "5400", agency_fees: "5500", office_rent: "6100" };

export interface Supplier {
  id: string;
  name: string;
  vatNumber: string | null;
  paymentTermsDays: number;
  category: BillCategory;
  vatCode: VatKey;
  costCentreId: string;
  prefix: string;
}
export const SUPPLIERS: Supplier[] = [
  { id: "sp-01", name: "Falaj Camp Properties LLC", vatNumber: "VAT-DEMO-7102", paymentTermsDays: 5, category: "camp_rent", vatCode: "exempt", costCentreId: "cc-camp-soh", prefix: "FCP" },
  { id: "sp-02", name: "Nizwa Workers Housing Co.", vatNumber: "VAT-DEMO-7215", paymentTermsDays: 5, category: "camp_rent", vatCode: "exempt", costCentreId: "cc-camp-nzw", prefix: "NWH" },
  { id: "sp-03", name: "Batinah Fuel Services", vatNumber: "VAT-DEMO-7340", paymentTermsDays: 15, category: "bus_fuel", vatCode: "standard", costCentreId: "cc-camp-soh", prefix: "BFS" },
  { id: "sp-04", name: "Rusayl Fleet Workshop", vatNumber: "VAT-DEMO-7488", paymentTermsDays: 20, category: "bus_maintenance", vatCode: "standard", costCentreId: "cc-office", prefix: "RFW" },
  { id: "sp-05", name: "Government services (ROP and Ministry of Labour)", vatNumber: null, paymentTermsDays: 0, category: "visa_fees", vatCode: "out_of_scope", costCentreId: "cc-office", prefix: "GOV" },
  { id: "sp-06", name: "Himalaya Overseas Recruitment (demo)", vatNumber: null, paymentTermsDays: 30, category: "agency_fees", vatCode: "out_of_scope", costCentreId: "cc-office", prefix: "HOR" },
  { id: "sp-07", name: "Ruwi Business Centre", vatNumber: "VAT-DEMO-7561", paymentTermsDays: 7, category: "office_rent", vatCode: "standard", costCentreId: "cc-office", prefix: "RBC" },
];
export const supplierById = (id: string) => SUPPLIERS.find((s) => s.id === id)!;

export type BillStatus = "draft" | "approved" | "paid";
export interface SupplierBill {
  id: string;
  supplierId: string;
  number: string;
  date: string;
  dueDate: string;
  category: BillCategory;
  description: string;
  amount: string;
  vatCode: VatKey;
  vat: string;
  total: string;
  costCentreId: string;
  status: BillStatus;
  createdBy: string;
  approvedBy: string | null;
  paidOn: string | null;
  attachments: string[];
}

export interface JournalLine {
  account: string;
  costCentreId: string | null;
  debit: string;
  credit: string;
}
export type JournalSource = "payroll" | "invoice" | "payment" | "bill" | "manual" | "opening";
export interface Journal {
  id: string;
  number: string;
  date: string;
  source: JournalSource;
  memo: string;
  link: string | null;
  linkLabel: string | null;
  postedBy: string;
  tag?: string;
  /** Service month (YYYY-MM) for invoice and payroll journals, so the P&L matches revenue to the hours it bills. */
  period?: string;
  lines: JournalLine[];
}
export interface StatementLine {
  id: string;
  date: string;
  amount: string;
  description: string;
  reference: string;
  /** Journal this line is matched to; null when unmatched. */
  matchedJournalId: string | null;
}

// ---------------------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------------------
const db = { bills: [] as SupplierBill[], manual: [] as Journal[], statement: [] as StatementLine[], seq: { manual: 41, bill: 1 } };
const OPENING_BANK = "280000.000";
const MONTHS = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"];
const cmp = (a: string, b: string) => omr(a).cmp(omr(b));
const dr = (account: string, amount: string, cc: string | null = null): JournalLine => ({ account, costCentreId: cc, debit: amount, credit: "0.000" });
const cr = (account: string, amount: string, cc: string | null = null): JournalLine => ({ account, costCentreId: cc, debit: "0.000", credit: amount });

/** Payroll comes from the same locked hours as invoices (App Flow "Lock"); wages ≈ 70% of billed hours. */
// Same dates as demo/payroll.ts: regular runs are released the day after the period ends.
export const PAYROLL_RELEASED: Record<string, { on: string; by: string }> = {
  "2026-05": { on: "2026-06-01", by: "finance.lead" },
  "2026-06": { on: "2026-07-01", by: "finance.lead" },
  "2026-07": { on: "2026-08-01", by: "finance.lead" },
  "2026-08": { on: "2026-09-01", by: "finance.lead" },
  "2026-09": { on: "2026-10-01", by: "finance.lead" },
  "2026-10": { on: "2026-11-01", by: "finance.lead" },
};
const payrollCache = new Map<string, ReturnType<typeof computePayroll>>();
const payrollOf = (month: string) => payrollCache.get(month) ?? payrollCache.set(month, computePayroll(month)).get(month)!;
function computePayroll(month: string) {
  const bySite = SITES.map((s) => {
    const lines = buildInvoice(s.id, month, "system").lines.filter((l) => l.kind === "hours" && l.rate);
    const normal = money.times(money.sum(lines.filter((l) => l.hourType === "normal").map((l) => l.amount)), "0.70");
    const extra = money.times(money.sum(lines.filter((l) => l.hourType !== "normal").map((l) => l.amount)), "0.70");
    return { siteId: s.id, normal, extra };
  });
  const bench = money.between(rng(`bench:${month}`), "8200.000", "9400.000", "0.250");
  const total = money.sum([...bySite.flatMap((s) => [s.normal, s.extra]), bench]);
  return { bySite, bench, total };
}

(function seed() {
  const r = rng("finance:bills");
  const clerk = "accounts.clerk";
  const monthly: { sp: string; day: number | "end"; lo: string; hi: string; every?: number }[] = [
    { sp: "sp-01", day: 1, lo: "6840.000", hi: "6840.000" },
    { sp: "sp-02", day: 1, lo: "2150.000", hi: "2150.000" },
    { sp: "sp-03", day: "end", lo: "2380.000", hi: "3120.000" },
    { sp: "sp-04", day: 18, lo: "420.000", hi: "1680.000" },
    { sp: "sp-05", day: 4, lo: "640.000", hi: "2860.000" },
    { sp: "sp-06", day: 22, lo: "1800.000", hi: "3600.000", every: 2 },
    { sp: "sp-07", day: 1, lo: "1150.000", hi: "1150.000" },
  ];
  [...MONTHS, "2026-11-01"].forEach((m, mi) => {
    for (const b of monthly) {
      if (b.every && mi % b.every) continue;
      const date = b.day === "end" ? dates.monthEnd(m) : `${m.slice(0, 8)}${String(b.day).padStart(2, "0")}`;
      if (date > DATA_DATE) continue;
      const sp = supplierById(b.sp);
      const amount = money.between(r, b.lo, b.hi, "0.250");
      const vat = vatOf(amount, vatCodeOn(sp.vatCode, date));
      const paidOn = dates.addDays(date, Math.max(sp.paymentTermsDays, 2));
      const nov = m === "2026-11-01";
      const status: BillStatus = nov && b.sp !== "sp-07" ? "draft" : paidOn <= "2026-11-06" ? "paid" : "approved";
      db.bills.push({
        id: `bill-${db.seq.bill++}`,
        supplierId: sp.id,
        number: `${sp.prefix}/${m.slice(0, 4)}/${String(100 + r.int(1, 899)).padStart(4, "0")}`,
        date,
        dueDate: dates.addDays(date, sp.paymentTermsDays),
        category: sp.category,
        description: `${CATEGORY_LABEL[sp.category]} · ${dates.monthName(m)}`,
        amount,
        vatCode: sp.vatCode,
        vat,
        total: money.sum([amount, vat]),
        costCentreId: sp.costCentreId,
        status,
        createdBy: nov && b.sp === "sp-02" ? "finance.lead" : clerk,
        approvedBy: status === "draft" ? null : "finance.lead",
        paidOn: status === "paid" ? paidOn : null,
        attachments: nov && b.sp === "sp-05" ? [] : [`${sp.prefix}-${m.slice(0, 7)}.pdf`],
      });
    }
  });
  // Rusayl's October repair was paid on 8 Nov; the transfer is not on the statement yet.
  const rusaylOct = db.bills.find((b) => b.supplierId === "sp-04" && b.date.startsWith("2026-10"))!;
  rusaylOct.status = "paid";
  rusaylOct.paidOn = "2026-11-08";

  // Manual journals: September utilities accrual and its reversal.
  db.manual.push(
    { id: "jnl-man-39", number: "JNL-MAN-2026-0039", date: "2026-09-30", source: "manual", memo: "Accrue September camp electricity and water", link: null, linkLabel: null, postedBy: "finance.lead", tag: "accrual-2026-09", lines: [dr("5200", "1720.000", "cc-camp-soh"), cr("2300", "1720.000")] },
    { id: "jnl-man-40", number: "JNL-MAN-2026-0040", date: "2026-10-01", source: "manual", memo: "Reverse September camp utilities accrual", link: null, linkLabel: null, postedBy: "finance.lead", lines: [dr("2300", "1720.000"), cr("5200", "1720.000", "cc-camp-soh")] },
  );

  // Bank statement: every bank movement the ledger knows, then the lines nobody has matched yet.
  for (const j of derivedJournals()) {
    const bank = j.lines.find((l) => l.account === "1000");
    if (!bank || j.source === "opening") continue;
    const when = j.date;
    if (when > "2026-11-07") continue; // not cleared yet
    const amount = cmp(bank.debit, "0") > 0 ? bank.debit : `-${bank.credit}`;
    db.statement.push({ id: `bsl-${j.id}`, date: when, amount, description: statementText(j), reference: j.number.replace("JNL-", ""), matchedJournalId: j.id });
  }
  db.statement.push(
    { id: "bsl-u1", date: "2026-10-31", amount: "-18.750", description: "ACCOUNT MAINTENANCE AND WPS FEES OCT", reference: "CHG-2026-10", matchedJournalId: null },
    { id: "bsl-u2", date: "2026-11-06", amount: "1250.000", description: "INWARD TRF REF 7781 · NO REMITTER NAME", reference: "TRF 7781", matchedJournalId: null },
    { id: "bsl-u3", date: "2026-11-07", amount: "30000.000", description: "GULF BUILD LLC · TRF 88213 SEP INVOICES", reference: "TRF 88213", matchedJournalId: null },
    { id: "bsl-u4", date: "2026-11-08", amount: "5000.000", description: "WADI INFRASTRUCTURE CO · CHQ 004512", reference: "CHQ 004512", matchedJournalId: null },
  );
  db.statement.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
})();

function statementText(j: Journal): string {
  if (j.source === "payroll") return `WPS SALARY TRANSFER · ${j.memo.replace("WPS salary transfer · ", "").toUpperCase()}`;
  if (j.source === "bill") return `TRF TO ${j.memo.replace(/^Pay /, "").split(" · ")[0]!.toUpperCase()}`;
  if (j.source === "payment") return j.memo.replace(/^Receipt · /, "").toUpperCase();
  return j.memo.toUpperCase();
}

// ---------------------------------------------------------------------------------------------
// Journals (derived + manual)
// ---------------------------------------------------------------------------------------------
function derivedJournals(): Journal[] {
  const out: Journal[] = [];
  out.push({ id: "jnl-opening", number: "JNL-OPEN-2026", date: "2026-05-01", source: "opening", memo: "Opening balances migrated from the Excel books", link: null, linkLabel: null, postedBy: "finance.lead", lines: [dr("1000", OPENING_BANK), cr("3100", "100000.000"), cr("3000", "180000.000")] });

  for (const inv of allInvoices()) {
    if (!inv.issuedOn) continue;
    const hours = money.sum(inv.lines.filter((l) => l.kind === "hours").map((l) => l.amount));
    const charges = money.sum(inv.lines.filter((l) => l.kind === "charge").map((l) => l.amount));
    out.push({
      id: `jnl-inv-${inv.id}`,
      number: `JNL-${inv.number}`,
      date: inv.issuedOn,
      source: "invoice",
      memo: `Invoice ${inv.number} · ${clientById(inv.clientId)!.legalName} · ${dates.monthName(inv.periodStart)}`,
      link: `/invoices/${inv.id}`,
      linkLabel: inv.number,
      postedBy: inv.issuedBy ?? "finance.lead",
      period: inv.periodStart.slice(0, 7),
      lines: [dr("1100", inv.total, `cc-${inv.clientId}`), cr("4000", hours, `cc-${inv.siteId}`), cr("4100", charges, `cc-${inv.siteId}`), cr("2100", inv.vat)],
    });
  }
  const invoices = new Map(allInvoices().map((i) => [i.id, i]));
  for (const cn of listCreditNotes()) {
    if (cn.status !== "issued") continue;
    const inv = invoices.get(cn.invoiceId)!;
    out.push({
      id: `jnl-cn-${cn.id}`,
      number: `JNL-${cn.number}`,
      date: cn.issuedOn!,
      source: "invoice",
      memo: `Credit note ${cn.number} on ${inv.number}`,
      link: `/invoices/${inv.id}`,
      linkLabel: cn.number,
      postedBy: cn.approvedBy!,
      period: inv.periodStart.slice(0, 7),
      lines: [dr("4000", cn.amount, `cc-${inv.siteId}`), dr("2100", cn.vat), cr("1100", cn.total, `cc-${inv.clientId}`)],
    });
  }
  const allocations = listAllocations();
  for (const p of listPayments()) {
    const allocs = allocations.filter((a) => a.paymentId === p.id);
    const applied = money.sum(allocs.map((a) => a.amount));
    const unapplied = money.minus(p.amount, applied);
    const first = allocs[0] && invoices.get(allocs[0].invoiceId);
    out.push({
      id: `jnl-pay-${p.id}`,
      number: `JNL-${p.number}`,
      date: p.receivedOn,
      source: "payment",
      memo: `Receipt · ${clientById(p.clientId)!.legalName} · ${p.reference}`,
      link: first ? `/invoices/${first.id}` : "/receivables",
      linkLabel: p.number,
      postedBy: p.recordedBy,
      lines: [dr("1000", p.amount), ...(cmp(applied, "0") > 0 ? [cr("1100", applied, `cc-${p.clientId}`)] : []), ...(cmp(unapplied, "0") > 0 ? [cr("2150", unapplied, `cc-${p.clientId}`)] : [])],
    });
  }
  for (const m of MONTHS) {
    const key = m.slice(0, 7);
    const pay = payrollOf(m);
    out.push({
      id: `jnl-payroll-${key}`,
      number: `JNL-PAY-${key}`,
      date: dates.monthEnd(m),
      source: "payroll",
      memo: `Payroll ${dates.monthName(m)} · gross wages from locked timesheets`,
      link: "/payroll",
      linkLabel: `Payroll ${dates.monthName(m)}`,
      postedBy: "payroll.officer",
      period: key,
      lines: [...pay.bySite.flatMap((s) => [dr("5000", s.normal, `cc-${s.siteId}`), dr("5100", s.extra, `cc-${s.siteId}`)]), dr("5000", pay.bench, "cc-office"), cr("2200", pay.total)],
    });
    const rel = PAYROLL_RELEASED[key];
    if (rel)
      out.push({ id: `jnl-wps-${key}`, number: `JNL-WPS-${key}`, date: rel.on, source: "payroll", memo: `WPS salary transfer · ${dates.monthName(m)}`, link: "/wps", linkLabel: `WPS ${dates.monthName(m)}`, postedBy: rel.by, lines: [dr("2200", pay.total), cr("1000", pay.total)] });
    if (key < "2026-10")
      out.push({ id: `jnl-bank-${key}`, number: `JNL-BANK-${key}`, date: dates.monthEnd(m), source: "manual", memo: `Bank charges ${dates.monthName(m)} · account maintenance and WPS fees`, link: null, linkLabel: null, postedBy: "finance.lead", lines: [dr("6200", "18.750"), cr("1000", "18.750")] });
  }
  for (const b of db.bills) {
    if (b.status === "draft") continue;
    const sp = supplierById(b.supplierId);
    out.push({
      id: `jnl-bill-${b.id}`,
      number: `JNL-BILL-${b.number}`,
      date: b.date,
      source: "bill",
      memo: `${sp.name} · ${b.description}`,
      link: "/supplier-bills",
      linkLabel: b.number,
      postedBy: b.approvedBy!,
      lines: [dr(CATEGORY_ACCOUNT[b.category], b.amount, b.costCentreId), ...(cmp(b.vat, "0") > 0 ? [dr("1200", b.vat)] : []), cr("2000", b.total)],
    });
    if (b.paidOn)
      out.push({ id: `jnl-billpay-${b.id}`, number: `JNL-BPAY-${b.number}`, date: b.paidOn, source: "bill", memo: `Pay ${sp.name} · ${b.number}`, link: "/supplier-bills", linkLabel: b.number, postedBy: b.approvedBy!, lines: [dr("2000", b.total), cr("1000", b.total)] });
  }
  return out;
}

export function listJournals(): Journal[] {
  return [...derivedJournals(), ...db.manual].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
}
export const journalTotals = (j: Pick<Journal, "lines">) => ({ debit: money.sum(j.lines.map((l) => l.debit)), credit: money.sum(j.lines.map((l) => l.credit)) });
export const isBalanced = (j: Pick<Journal, "lines">) => {
  const t = journalTotals(j);
  return t.debit === t.credit && j.lines.every((l) => (cmp(l.debit, "0") > 0) !== (cmp(l.credit, "0") > 0));
};

export function postManualJournal(input: { date: string; memo: string; lines: JournalLine[]; by: string; tag?: string }): Journal {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Pick the journal date.");
  assertPeriodOpen(input.date);
  if (!input.memo.trim()) throw new Error("Say what the journal is for.");
  const lines = input.lines.map((l) => ({ ...l, debit: money.str(omr(l.debit || "0")), credit: money.str(omr(l.credit || "0")) }));
  const j: Journal = { id: `jnl-man-${db.seq.manual}`, number: `JNL-MAN-2026-${String(db.seq.manual).padStart(4, "0")}`, date: input.date, source: "manual", memo: input.memo.trim(), link: null, linkLabel: null, postedBy: input.by, tag: input.tag, lines };
  if (lines.length < 2 || !isBalanced(j)) throw new Error("A journal needs debits equal to credits, and each line is either a debit or a credit.");
  db.seq.manual++;
  db.manual.push(j);
  return j;
}

// ---------------------------------------------------------------------------------------------
// Trial balance, P&L, bank reconciliation
// ---------------------------------------------------------------------------------------------
export interface TrialBalanceRow extends Account {
  debit: string;
  credit: string;
}
export function trialBalance(asAt: string) {
  const sums = new Map<string, { d: string[]; c: string[] }>();
  for (const j of listJournals()) {
    if (j.date > asAt) continue;
    for (const l of j.lines) {
      const s = sums.get(l.account) ?? { d: [], c: [] };
      s.d.push(l.debit);
      s.c.push(l.credit);
      sums.set(l.account, s);
    }
  }
  const rows: TrialBalanceRow[] = ACCOUNTS.filter((a) => sums.has(a.code)).map((a) => {
    const net = omr(money.sum(sums.get(a.code)!.d)).minus(omr(money.sum(sums.get(a.code)!.c)));
    return { ...a, debit: net.gt(0) ? money.str(net) : "0.000", credit: net.lt(0) ? money.str(net.abs()) : "0.000" };
  });
  const debit = money.sum(rows.map((r) => r.debit));
  const credit = money.sum(rows.map((r) => r.credit));
  return { rows, debit, credit, balanced: debit === credit };
}

export interface PnlMonth {
  month: string;
  revenue: string;
  directCosts: string;
  overheads: string;
  profit: string;
}
/** Profit and loss per service month, May–October 2026. */
export function pnlByMonth(): PnlMonth[] {
  const js = listJournals();
  return MONTHS.map((m) => {
    const key = m.slice(0, 7);
    const ls = js.filter((j) => (j.period ?? j.date.slice(0, 7)) === key).flatMap((j) => j.lines);
    const net = (pred: (code: string) => boolean, sign: 1 | -1) =>
      money.str(ls.filter((l) => pred(l.account)).reduce((acc, l) => acc.plus(omr(l.debit).minus(omr(l.credit)).times(sign)), omr("0")));
    const revenue = net((c) => accountByCode(c).type === "income", -1);
    const directCosts = net((c) => c.startsWith("5"), 1);
    const overheads = net((c) => c.startsWith("6"), 1);
    return { month: m, revenue, directCosts, overheads, profit: money.minus(money.minus(revenue, directCosts), overheads) };
  });
}

export interface ReconRow extends StatementLine {
  journal: Pick<Journal, "id" | "number" | "memo" | "link" | "linkLabel"> | null;
  kind: "receipt" | "charge" | "payment";
}
export function bankReconciliation() {
  const journals = listJournals();
  const byId = new Map(journals.map((j) => [j.id, j]));
  const matched = new Set(db.statement.map((s) => s.matchedJournalId).filter(Boolean));
  const statementBalance = money.sum([OPENING_BANK, ...db.statement.map((s) => s.amount)]);
  const bankLines = journals.flatMap((j) => j.lines.filter((l) => l.account === "1000").map((l) => ({ j, l })));
  const ledgerBalance = money.str(bankLines.reduce((acc, { l }) => acc.plus(omr(l.debit)).minus(omr(l.credit)), omr("0")));
  const notOnStatement = bankLines
    .filter(({ j }) => j.source !== "opening" && !matched.has(j.id))
    .map(({ j, l }) => ({ id: j.id, number: j.number, date: j.date, memo: j.memo, link: j.link, amount: cmp(l.debit, "0") > 0 ? l.debit : `-${l.credit}` }));
  const lines: ReconRow[] = db.statement.map((s) => {
    const j = s.matchedJournalId ? byId.get(s.matchedJournalId) : undefined;
    return { ...s, journal: j ? { id: j.id, number: j.number, memo: j.memo, link: j.link, linkLabel: j.linkLabel } : null, kind: s.amount.startsWith("-") ? (s.description.includes("FEES") ? "charge" : "payment") : "receipt" };
  });
  return { openingBalance: OPENING_BANK, statementBalance, ledgerBalance, difference: money.minus(statementBalance, ledgerBalance), lines, notOnStatement, account: BANK_ACCOUNT };
}

export const unmatchedReceipts = () => db.statement.filter((s) => !s.matchedJournalId && !s.amount.startsWith("-"));

/** S-29: match a bank receipt to one or more invoices (partial allocation allowed). */
export function matchReceipt(input: { lineId: string; clientId: string; allocations: { invoiceId: string; amount: string }[]; by: string }) {
  const line = db.statement.find((s) => s.id === input.lineId);
  if (!line || line.matchedJournalId) throw new Error("This statement line is already matched.");
  if (!input.clientId) throw new Error("Pick the client who paid.");
  const p = recordPayment({ clientId: input.clientId, receivedOn: line.date, amount: line.amount, method: "bank_transfer", reference: line.reference, allocations: input.allocations, bankStatementLineId: line.id, by: input.by });
  line.matchedJournalId = `jnl-pay-${p.id}`;
  return p;
}

/** S-30: book an unmatched bank charge and match it in one step. */
export function postBankCharge(lineId: string, by: string) {
  const line = db.statement.find((s) => s.id === lineId);
  if (!line || line.matchedJournalId || !line.amount.startsWith("-")) throw new Error("Only unmatched bank charges can be posted here.");
  const amount = line.amount.slice(1);
  const j = postManualJournal({ date: line.date, memo: `Bank charges ${periodName(line.date.slice(0, 7))} · ${line.description.toLowerCase()}`, lines: [dr("6200", amount), cr("1000", amount)], by });
  line.matchedJournalId = j.id;
  return j;
}

// ---------------------------------------------------------------------------------------------
// Month-end close (S-30)
// ---------------------------------------------------------------------------------------------
export interface CloseItem {
  key: "timesheets" | "payroll" | "invoices" | "bank" | "accruals";
  label: string;
  done: boolean;
  detail: string;
  to?: string;
}
export function closeChecklist(periodKey: string): CloseItem[] {
  const month = `${periodKey}-01`;
  const name = periodName(periodKey);
  const invs = allInvoices().filter((i) => i.periodStart === month);
  const drafts = invs.filter((i) => i.status === "draft");
  const blocked = drafts.filter((i) => i.exceptions.length);
  const unmatched = db.statement.filter((s) => s.date.startsWith(periodKey) && !s.matchedJournalId);
  const accrual = db.manual.find((j) => j.tag === `accrual-${periodKey}`);
  const pay = PAYROLL_RELEASED[periodKey];
  return [
    { key: "timesheets", label: "Timesheets locked", done: true, detail: `All ${SITES.length} site timesheets for ${name} are signed by clients and locked.`, to: "/timesheets" },
    { key: "payroll", label: "Payroll released", done: !!pay, detail: pay ? `Released on ${pay.on} by ${pay.by}; WPS file accepted.` : "Payroll for the period is not released yet.", to: "/payroll" },
    {
      key: "invoices",
      label: "Invoices issued",
      done: isGenerated(month) && drafts.length === 0,
      detail: !isGenerated(month)
        ? `Invoices for ${name} are not generated yet.`
        : drafts.length
          ? `${invs.length - drafts.length} of ${invs.length} issued${blocked.length ? ` · ${blocked.length} blocked by an unmatched rate` : ""}.`
          : `All ${invs.length} invoices issued and locked.`,
      to: "/invoices",
    },
    { key: "bank", label: "Bank reconciled", done: unmatched.length === 0, detail: unmatched.length ? `${unmatched.length} statement line${unmatched.length > 1 ? "s" : ""} dated in ${name} not matched.` : `Every ${name} statement line is matched to the ledger.` },
    { key: "accruals", label: "Accruals posted", done: !!accrual, detail: accrual ? `${accrual.number}: ${accrual.memo}.` : "Camp electricity and water for the month are not accrued yet." },
  ];
}

export function postAccruals(periodKey: string, by: string) {
  if (db.manual.some((j) => j.tag === `accrual-${periodKey}`)) throw new Error("Accruals for this period are already posted.");
  const amount = money.between(rng(`accrual:${periodKey}`), "1690.000", "1840.000", "0.250");
  return postManualJournal({ date: dates.monthEnd(`${periodKey}-01`), memo: `Accrue ${periodName(periodKey)} camp electricity and water`, lines: [dr("5200", amount, "cc-camp-soh"), cr("2300", amount)], by, tag: `accrual-${periodKey}` });
}

export function closePeriod(periodKey: string, by: string) {
  const p = periodOf(`${periodKey}-01`);
  if (!p || p.status === "closed") throw new Error("This period is already closed.");
  const open = closeChecklist(periodKey).filter((i) => !i.done);
  if (open.length) throw new Error(`Finish the checklist first: ${open.map((i) => i.label.toLowerCase()).join(", ")}.`);
  p.status = "closed";
  p.closedBy = by;
  p.closedAt = new Date().toISOString();
  return p;
}

// ---------------------------------------------------------------------------------------------
// Supplier bill actions (S-31)
// ---------------------------------------------------------------------------------------------
export const listBills = () => [...db.bills].sort((a, b) => b.date.localeCompare(a.date) || a.supplierId.localeCompare(b.supplierId));

export function addBill(input: { supplierId: string; number: string; date: string; amount: string; vatCode: VatKey; costCentreId: string; description: string; attachments: string[]; by: string }) {
  const sp = SUPPLIERS.find((s) => s.id === input.supplierId);
  if (!sp) throw new Error("Pick the supplier.");
  if (!input.number.trim()) throw new Error("Enter the supplier's bill number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Enter the bill date.");
  if (!/^\d+(\.\d{1,3})?$/.test(input.amount) || cmp(input.amount, "0") <= 0) throw new Error("Enter the amount before VAT, above zero, up to 3 decimals.");
  if (db.bills.some((b) => b.supplierId === sp.id && b.number === input.number.trim())) throw new Error(`${sp.name} bill ${input.number.trim()} is already recorded.`);
  const amount = money.str(omr(input.amount));
  const vat = vatOf(amount, vatCodeOn(input.vatCode, input.date));
  const bill: SupplierBill = {
    id: `bill-${db.seq.bill++}`,
    supplierId: sp.id,
    number: input.number.trim(),
    date: input.date,
    dueDate: dates.addDays(input.date, sp.paymentTermsDays),
    category: sp.category,
    description: input.description.trim() || `${CATEGORY_LABEL[sp.category]} · ${dates.monthName(input.date)}`,
    amount,
    vatCode: input.vatCode,
    vat,
    total: money.sum([amount, vat]),
    costCentreId: input.costCentreId,
    status: "draft",
    createdBy: input.by,
    approvedBy: null,
    paidOn: null,
    attachments: input.attachments,
  };
  db.bills.push(bill);
  return bill;
}

export function approveBill(id: string, by: string) {
  const b = db.bills.find((x) => x.id === id)!;
  if (b.status !== "draft") throw new Error("Only draft bills are approved.");
  if (b.createdBy === by) throw new Error("Needs a second approver: the person who entered a bill cannot approve it.");
  assertPeriodOpen(b.date);
  b.status = "approved";
  b.approvedBy = by;
  return b;
}

export function payBill(id: string, on: string) {
  const b = db.bills.find((x) => x.id === id)!;
  if (b.status !== "approved") throw new Error("Approve the bill before paying it.");
  assertPeriodOpen(on);
  b.status = "paid";
  b.paidOn = on;
  return b;
}

export const financeKeys = {
  journals: ["finance", "journals"] as const,
  trial: (asAt: string) => ["finance", "trial", asAt] as const,
  recon: ["finance", "recon"] as const,
  close: (key: string) => ["finance", "close", key] as const,
  pnl: ["finance", "pnl"] as const,
  periods: ["finance", "periods"] as const,
  bills: ["finance", "bills"] as const,
  receipts: ["finance", "receipts"] as const,
};
