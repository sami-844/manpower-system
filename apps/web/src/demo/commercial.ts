/**
 * DEMO DATA — commercial module (S-12 clients, S-13 client file, S-14 contracts and rate cards).
 * Fictional balances and rate card versions until the `/clients` and `/contracts` API lands
 * (Implementation Plan, Phase 3). Shapes follow Backend Schema `clients`, `client_contracts`,
 * `rate_cards`, `rate_lines` (camelCase, money strings, YYYY-MM-DD dates).
 *
 * Rate cards keep the four-eyes rule from the schema ("changes need a second person to approve"):
 * a new version starts pending, its maker can never approve it, and approving it closes the
 * previous version the day before — old versions are never edited.
 */
import { omr, roundBaisa, sumOmr } from "@mms/core";
import type { WorkerListItem } from "@/lib/api";
import { dates, delay, money, rng, todayOman } from "./core";
import { CLIENTS, CONTRACTS, TRADES, clientById, type Client, type Contract, type HourType, type RateCard, type Trade } from "./reference";
import { basicWage, siteOf } from "./workforce";

export const HOUR_TYPES: { key: HourType; label: string }[] = [
  { key: "normal", label: "Normal" },
  { key: "overtime", label: "Overtime" },
  { key: "rest_day", label: "Rest day" },
  { key: "holiday", label: "Holiday" },
  { key: "night", label: "Night" },
];

// ── Client balances (the billing agent owns invoices; these are summary figures only) ──

export interface ClientBalance {
  clientId: string;
  outstanding: string;
  overdue: string;
  openInvoices: number;
  dsoDays: number;
  lastPaymentOn: string | null;
  lastPaymentAmount: string | null;
}

function balanceOf(c: Client): ClientBalance {
  if (c.status === "prospect") return { clientId: c.id, outstanding: "0.000", overdue: "0.000", openInvoices: 0, dsoDays: 0, lastPaymentOn: null, lastPaymentAmount: null };
  // Wadi Infrastructure Co. is the demo's over-limit client; the figure matches the notification.
  if (c.id === "cl-05") return { clientId: c.id, outstanding: "27410.250", overdue: "11862.400", openInvoices: 4, dsoDays: 81, lastPaymentOn: dates.addDays(todayOman(), -52), lastPaymentAmount: "6200.000" };
  const r = rng(`balance:${c.id}`);
  const outstanding = money.between(r, money.times(c.creditLimit, "0.32"), money.times(c.creditLimit, "0.78"), "0.250");
  const overdue = money.between(r, "0.000", money.times(outstanding, "0.18"), "0.250");
  return {
    clientId: c.id,
    outstanding,
    overdue,
    openInvoices: r.int(2, 3),
    dsoDays: c.paymentTermsDays + r.int(-6, 9),
    lastPaymentOn: dates.addDays(todayOman(), -r.int(4, 21)),
    lastPaymentAmount: money.between(r, "4000.000", "16000.000", "0.500"),
  };
}

export const overLimit = (b: ClientBalance, c: Client) => omr(b.outstanding).gt(omr(c.creditLimit));
/** Share of the credit limit in use, 0–1+ (a ratio for the bar, not money). */
export const creditUsed = (b: ClientBalance, c: Client) => (omr(c.creditLimit).isZero() ? 0 : omr(b.outstanding).div(omr(c.creditLimit)).toNumber());

// ── Client edits made in this session (in-memory) ──

const clientEdits = new Map<string, Partial<Pick<Client, "city" | "paymentTermsDays" | "creditLimit">>>();
const clientNow = (c: Client): Client => ({ ...c, ...clientEdits.get(c.id) });

export interface ClientRow extends Client {
  balance: ClientBalance;
}

export const fetchClients = () => delay<ClientRow[]>(CLIENTS.map((c) => ({ ...clientNow(c), balance: balanceOf(c) })));
export const fetchClient = (id: string) => {
  const c = clientById(id);
  return delay<ClientRow | null>(c ? { ...clientNow(c), balance: balanceOf(c) } : null);
};
export const updateClient = (id: string, patch: Partial<Pick<Client, "city" | "paymentTermsDays" | "creditLimit">>) => {
  clientEdits.set(id, { ...clientEdits.get(id), ...patch });
  return delay(true, 300);
};

/** Real workers deployed at any of the client's sites. */
export const deployedFor = (clientId: string, workers: readonly WorkerListItem[]) => workers.filter((w) => siteOf(w)?.clientId === clientId);

/** Hours a month used for the run-rate and the loaded-cost estimate (26 days × 8 h; an assumption, not a rule value). */
export const MONTH_HOURS = 208;

/** Monthly billing run-rate estimate: each deployed worker's normal rate on the current card × 208 h, plus fixed charges. */
export function runRate(contract: Contract | undefined, deployed: readonly WorkerListItem[]): string {
  if (!contract) return "0.000";
  const card = currentCard(contract.id);
  const rate = new Map(card?.lines.filter((l) => l.hourType === "normal").map((l) => [l.trade as string, l.rate]));
  const labour = deployed.map((w) => money.times(rate.get(w.trade) ?? rate.get("General labourer") ?? "0.000", MONTH_HOURS));
  const charges = contract.charges.filter((c) => c.frequency === "monthly").map((c) => money.times(c.amount, deployed.length));
  return money.sum([...labour, ...charges]);
}

// ── Rate card versions ──

export type RateCardStatus = "approved" | "pending";
export interface RateCardView extends RateCard {
  status: RateCardStatus;
  requestedBy: string;
  requestedOn: string;
  reason: string;
  /** Uplift against the version it replaced, e.g. "4.0". */
  upliftPct: string | null;
}

const seeded = (ct: Contract): RateCardView[] =>
  ct.rateCards.map((rc, i) => ({
    ...rc,
    status: "approved",
    requestedBy: rc.approvedBy === "owner.gm" ? "finance.lead" : "ops.manager",
    requestedOn: dates.addDays(rc.validFrom, -21),
    reason: i === 0 ? "Rates agreed at contract signature" : "Mid-year review agreed with the client",
    upliftPct: i === 0 ? null : omr(rc.lines[0]!.rate).div(omr(ct.rateCards[i - 1]!.lines[0]!.rate)).minus(1).times(100).toFixed(1),
  }));

/** Versions created in this session, plus one pending version so the four-eyes flow is visible on load. */
const extraCards = new Map<string, RateCardView[]>([
  [
    "ct-04",
    [
      {
        id: "rc-04-3",
        version: 3,
        validFrom: "2027-01-01",
        validTo: null,
        approvedBy: null,
        status: "pending",
        requestedBy: "finance.lead",
        requestedOn: "2026-11-08",
        reason: "Annual escalation from 1 Jan 2027 under the contract's escalation clause",
        upliftPct: "3.5",
        lines: upliftLines(CONTRACTS.find((c) => c.id === "ct-04")!.rateCards[1]!.lines, "3.5"),
      },
    ],
  ],
]);

function upliftLines(lines: RateCard["lines"], pct: string): RateCard["lines"] {
  const f = omr("1").plus(omr(pct).div(100));
  return lines.map((l) => ({ ...l, rate: roundBaisa(omr(l.rate).times(f)).toFixed(3) }));
}

/** All versions in order; an approved version's end date is derived from the next approved one. */
export function rateCardsOf(contractId: string): RateCardView[] {
  const ct = CONTRACTS.find((c) => c.id === contractId);
  if (!ct) return [];
  const all = [...seeded(ct), ...(extraCards.get(contractId) ?? [])].sort((a, b) => a.version - b.version);
  const approved = all.filter((c) => c.status === "approved");
  return all.map((c) => {
    if (c.status !== "approved" || c.validTo) return c;
    const next = approved.find((n) => n.version > c.version);
    return next ? { ...c, validTo: dates.addDays(next.validFrom, -1) } : c;
  });
}

/** The approved version in force today (or the latest approved one). */
export function currentCard(contractId: string): RateCardView | undefined {
  const today = todayOman();
  const approved = rateCardsOf(contractId).filter((c) => c.status === "approved");
  return approved.find((c) => c.validFrom <= today && (!c.validTo || c.validTo >= today)) ?? approved.at(-1);
}

export interface ContractRow extends Contract {
  client: Client;
  current: RateCardView | undefined;
  pending: RateCardView | undefined;
  versions: number;
}

const contractRow = (ct: Contract): ContractRow => {
  const cards = rateCardsOf(ct.id);
  return { ...ct, client: clientById(ct.clientId)!, current: currentCard(ct.id), pending: cards.find((c) => c.status === "pending"), versions: cards.length };
};

export const fetchContracts = () => delay(CONTRACTS.map(contractRow));
export const fetchContract = (id: string) => {
  const ct = CONTRACTS.find((c) => c.id === id);
  return delay(ct ? { contract: contractRow(ct), cards: rateCardsOf(ct.id) } : null);
};

export function proposeRateCard(input: { contractId: string; upliftPct: string; validFrom: string; reason: string; by: string }) {
  const cards = rateCardsOf(input.contractId);
  if (cards.some((c) => c.status === "pending")) throw new Error("This contract already has a version waiting for approval.");
  const base = cards.filter((c) => c.status === "approved").at(-1);
  if (!base) throw new Error("No approved rate card to start from.");
  if (input.validFrom <= base.validFrom) throw new Error(`The new version must start after v${base.version} (from ${base.validFrom}).`);
  const version = Math.max(...cards.map((c) => c.version)) + 1;
  const card: RateCardView = {
    id: `rc-${input.contractId.slice(3)}-${version}`,
    version,
    validFrom: input.validFrom,
    validTo: null,
    approvedBy: null,
    status: "pending",
    requestedBy: input.by,
    requestedOn: todayOman(),
    reason: input.reason,
    upliftPct: input.upliftPct,
    lines: upliftLines(base.lines, input.upliftPct),
  };
  extraCards.set(input.contractId, [...(extraCards.get(input.contractId) ?? []), card]);
  return delay(card, 400);
}

/** Roles allowed to approve a rate card. The maker is always refused, whatever the role. */
export const RATE_APPROVER_ROLES = ["owner", "finance"] as const;

export function approveRateCard(input: { contractId: string; cardId: string; by: string }) {
  const list = extraCards.get(input.contractId) ?? [];
  const card = list.find((c) => c.id === input.cardId);
  if (!card || card.status !== "pending") throw new Error("This version is not waiting for approval.");
  if (card.requestedBy === input.by) throw new Error("The person who created a rate card cannot approve it.");
  extraCards.set(
    input.contractId,
    list.map((c) => (c.id === card.id ? { ...c, status: "approved" as const, approvedBy: input.by } : c)),
  );
  return delay(true, 400);
}

// ── Margin preview (estimate) ──

/** Loading on basic wage for allowances, visa amortisation, insurance, camp, transport and EOSB accrual. A costing assumption, not a legal value. */
export const COST_LOADING = "1.62";

/** Average monthly basic wage by trade across the real workforce. */
export function averageBasicByTrade(workers: readonly WorkerListItem[]): Map<Trade, string> {
  const out = new Map<Trade, string>();
  for (const trade of TRADES) {
    const wages = workers.filter((w) => w.trade === trade).map(basicWage);
    if (wages.length) out.set(trade, roundBaisa(sumOmr(wages).div(wages.length)).toFixed(3));
  }
  return out;
}

/** Fully loaded hourly cost estimate from an average basic wage. */
export const loadedHourly = (avgBasic: string) => roundBaisa(omr(avgBasic).times(COST_LOADING).div(MONTH_HOURS)).toFixed(3);

/** Margin on the normal rate as a percentage string ("23.4"), or null when the rate is zero. */
export function marginPct(rate: string, cost: string): string | null {
  const r = omr(rate);
  if (r.isZero()) return null;
  return r.minus(omr(cost)).div(r).times(100).toFixed(1);
}
