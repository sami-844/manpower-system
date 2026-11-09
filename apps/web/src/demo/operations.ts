/**
 * DEMO DATA — operations module (S-15 requests, S-16 matching, S-17 roster, S-18 bench).
 * Fictional requests and an in-memory assignment store until `/requests`, `/assignments`,
 * `/roster` and `/bench` land (Implementation Plan, Phase 4). Shapes follow Backend Schema
 * `manpower_requests`, `request_lines` and `assignments`.
 *
 * People are the REAL workers from `/api/workers`: filled positions are seeded from workers the
 * API already shows as deployed on that site, so every name opens the real worker file. The
 * filled count is calculated from assignments, as the schema says. Camp distance, skill level and
 * leave are demo facts derived deterministically from the worker code.
 */
import { useQuery } from "@tanstack/react-query";
import { documentLabel, omr, rangesOverlap } from "@mms/core";
import type { WorkerListItem } from "@/lib/api";
import { displayDate } from "@/lib/format";
import { dates, delay, hash, todayOman } from "./core";
import { clientById, siteById, type Trade } from "./reference";
import { basicWage, siteOf, useWorkforce } from "./workforce";

export type Shift = "day" | "night";
export type RequestStatus = "open" | "partly_filled" | "filled" | "cancelled";

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: "info" | "due" | "ok" | "draft" }> = {
  open: { label: "Open", tone: "info" },
  partly_filled: { label: "Partly filled", tone: "due" },
  filled: { label: "Filled", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "draft" },
};

export interface RequestLine {
  id: string;
  trade: Trade;
  quantity: number;
  startDate: string;
  endDate: string;
  shift: Shift;
  skillLevelMin: 1 | 2 | 3;
}

export interface ManpowerRequest {
  id: string;
  reference: string;
  clientId: string;
  siteId: string;
  requestedBy: string;
  receivedVia: "email" | "phone";
  receivedOn: string;
  cancelled: boolean;
  notes: string;
  lines: RequestLine[];
}

export interface Assignment {
  id: string;
  workerId: string;
  workerCode: string;
  workerName: string;
  trade: string;
  siteId: string;
  requestId: string | null;
  lineId: string | null;
  startDate: string;
  endDate: string;
  createdBy: string;
  createdOn: string;
}

const T = todayOman();
const d = (offset: number) => dates.addDays(T, offset);

// Hand-written so the list reads like a real order book. Offsets are from today.
type Seed = [trade: Trade, qty: number, start: number, days: number, shift: Shift, alreadyFilled: number, skill?: 1 | 2 | 3];
const SEED: { client: string; site: string; via: "email" | "phone"; received: number; notes: string; lines: Seed[]; cancelled?: boolean }[] = [
  { client: "cl-01", site: "st-01", via: "email", received: -24, notes: "Quay wall rebar, second shift crew follows in December.", lines: [["Steel fixer", 12, -10, 120, "day", 12, 2], ["Scaffolder", 6, 6, 90, "day", 2]] },
  { client: "cl-01", site: "st-04", via: "phone", received: -3, notes: "Wharf extension piling support.", lines: [["Welder", 4, 3, 60, "day", 0, 2], ["Equipment operator", 2, 3, 60, "day", 0]] },
  { client: "cl-02", site: "st-02", via: "email", received: -12, notes: "Block B floors 9–14 blockwork.", lines: [["Mason", 10, 5, 150, "day", 7], ["Electrician", 4, 12, 120, "day", 0, 2]] },
  { client: "cl-02", site: "st-02", via: "email", received: -41, notes: "Formwork crew for the core walls.", lines: [["Carpenter", 6, -30, 90, "day", 6]] },
  { client: "cl-03", site: "st-03", via: "phone", received: -6, notes: "Yard drivers. Site requires a valid driving licence.", lines: [["Driver", 3, 2, 60, "day", 1]] },
  { client: "cl-03", site: "st-03", via: "email", received: -2, notes: "Night welding on the fabrication line.", lines: [["Welder", 5, 14, 120, "night", 0]] },
  { client: "cl-04", site: "st-05", via: "email", received: -15, notes: "Breakwater armour placement, long-term.", lines: [["General labourer", 20, 7, 180, "day", 9]] },
  { client: "cl-04", site: "st-05", via: "phone", received: -9, notes: "Crane and loader operators for night pours.", lines: [["Equipment operator", 3, -5, 60, "night", 3, 2]] },
  { client: "cl-05", site: "st-06", via: "email", received: -4, notes: "Road 7 resurfacing support.", lines: [["Driver", 4, 10, 90, "day", 0]] },
  { client: "cl-06", site: "st-07", via: "email", received: -1, notes: "Clinic fit-out MEP works.", lines: [["Electrician", 3, 4, 45, "day", 0], ["Plumber", 2, 4, 45, "day", 0]] },
  { client: "cl-06", site: "st-08", via: "phone", received: -18, notes: "Cancelled by the client: maintenance contract re-scoped.", cancelled: true, lines: [["General labourer", 6, 1, 30, "day", 0]] },
  { client: "cl-02", site: "st-02", via: "email", received: 0, notes: "Slab reinforcement for the podium.", lines: [["Steel fixer", 8, 20, 120, "day", 0]] },
];

const requests: ManpowerRequest[] = SEED.map((s, i) => ({
  id: `mr-${String(i + 1).padStart(2, "0")}`,
  reference: `MR-2026-${String(131 + i)}`,
  clientId: s.client,
  siteId: s.site,
  requestedBy: clientById(s.client)?.contacts[0]?.name ?? "Client contact",
  receivedVia: s.via,
  receivedOn: d(s.received),
  cancelled: !!s.cancelled,
  notes: s.notes,
  lines: s.lines.map(([trade, quantity, start, days, shift, , skill], j) => ({
    id: `mr-${String(i + 1).padStart(2, "0")}-${j + 1}`,
    trade,
    quantity,
    startDate: d(start),
    endDate: d(start + days),
    shift,
    skillLevelMin: skill ?? 1,
  })),
}));

let assignments: Assignment[] | null = null;

/** Seed filled positions once, from workers the API already shows deployed on that site and trade. */
function store(workers: readonly WorkerListItem[]): Assignment[] {
  if (assignments) return assignments;
  const used = new Set<string>();
  assignments = [];
  SEED.forEach((s, i) => {
    const req = requests[i]!;
    s.lines.forEach(([trade, , , , , filled], j) => {
      const line = req.lines[j]!;
      const pool = workers.filter((w) => w.trade === trade && siteOf(w)?.id === s.site && !used.has(w.id)).slice(0, filled);
      for (const w of pool) {
        used.add(w.id);
        assignments!.push({ id: `as-${line.id}-${w.code}`, workerId: w.id, workerCode: w.code, workerName: w.fullName, trade, siteId: s.site, requestId: req.id, lineId: line.id, startDate: line.startDate, endDate: line.endDate, createdBy: "ops.manager", createdOn: req.receivedOn });
      }
    });
  });
  return assignments;
}

export interface LineView extends RequestLine {
  filled: number;
}
export interface RequestView extends ManpowerRequest {
  lines: LineView[];
  status: RequestStatus;
  quantity: number;
  filled: number;
  startDate: string;
}

function view(r: ManpowerRequest, all: readonly Assignment[]): RequestView {
  const lines = r.lines.map((l) => ({ ...l, filled: all.filter((a) => a.lineId === l.id).length }));
  const quantity = lines.reduce((n, l) => n + l.quantity, 0);
  const filled = lines.reduce((n, l) => n + Math.min(l.filled, l.quantity), 0);
  const status: RequestStatus = r.cancelled ? "cancelled" : filled >= quantity ? "filled" : filled > 0 ? "partly_filled" : "open";
  return { ...r, lines, status, quantity, filled, startDate: lines.map((l) => l.startDate).sort()[0]! };
}

export const OPS_KEY = ["demo", "operations"] as const;

export const fetchRequests = (workers: readonly WorkerListItem[]) => {
  const all = store(workers);
  return delay(requests.map((r) => view(r, all)).sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)));
};
export const fetchRequest = (id: string, workers: readonly WorkerListItem[]) => {
  const r = requests.find((x) => x.id === id);
  return delay(r ? view(r, store(workers)) : null);
};
export const fetchAssignments = (workers: readonly WorkerListItem[]) => delay([...store(workers)]);

export interface NewRequestInput {
  clientId: string;
  siteId: string;
  trade: Trade;
  quantity: number;
  startDate: string;
  endDate: string;
  shift: Shift;
  notes: string;
  by: string;
}

export function createRequest(input: NewRequestInput) {
  const n = requests.length + 1;
  const id = `mr-${String(n).padStart(2, "0")}`;
  const req: ManpowerRequest = {
    id,
    reference: `MR-2026-${130 + n}`,
    clientId: input.clientId,
    siteId: input.siteId,
    requestedBy: clientById(input.clientId)?.contacts[0]?.name ?? "Client contact",
    receivedVia: "email",
    receivedOn: todayOman(),
    cancelled: false,
    notes: input.notes || `Entered by ${input.by}.`,
    lines: [{ id: `${id}-1`, trade: input.trade, quantity: input.quantity, startDate: input.startDate, endDate: input.endDate, shift: input.shift, skillLevelMin: 1 }],
  };
  requests.push(req);
  return delay(req, 350);
}

export interface AssignInput {
  worker: Pick<WorkerListItem, "id" | "code" | "fullName" | "trade">;
  siteId: string;
  requestId: string | null;
  lineId: string | null;
  startDate: string;
  endDate: string;
}

/** Save assignments (in-memory). Refuses a double booking even if a screen missed it. */
export function assignWorkers(items: readonly AssignInput[], by: string, workers: readonly WorkerListItem[]) {
  const all = store(workers);
  for (const it of items) {
    const clash = all.find((a) => a.workerId === it.worker.id && rangesOverlap({ from: a.startDate, to: a.endDate }, { from: it.startDate, to: it.endDate }));
    if (clash) throw new Error(`${it.worker.fullName} is already assigned to ${siteById(clash.siteId)?.name} from ${displayDate(clash.startDate)}.`);
  }
  for (const it of items) {
    all.push({ id: `as-${it.worker.code}-${it.startDate}`, workerId: it.worker.id, workerCode: it.worker.code, workerName: it.worker.fullName, trade: it.worker.trade, siteId: it.siteId, requestId: it.requestId, lineId: it.lineId, startDate: it.startDate, endDate: it.endDate, createdBy: by, createdOn: todayOman() });
  }
  return delay(items.length, 350);
}

// ── Demo worker facts ──

export const CAMPS = [
  { id: "camp-soh", name: "Sohar Falaj camp", city: "Sohar" },
  { id: "camp-mct", name: "Ghala camp", city: "Muscat" },
  { id: "camp-mis", name: "Misfah camp", city: "Muscat" },
  { id: "camp-nzw", name: "Firq camp", city: "Nizwa" },
  { id: "camp-dqm", name: "Duqm workers village", city: "Duqm" },
] as const;
export type Camp = (typeof CAMPS)[number];

/** Road distance in km between cities (approximate, for ranking only). */
const KM: Record<string, Record<string, number>> = {
  Sohar: { Sohar: 9, Muscat: 230, Seeb: 190, Nizwa: 290, Duqm: 760 },
  Muscat: { Sohar: 230, Muscat: 14, Seeb: 32, Nizwa: 165, Duqm: 560 },
  Nizwa: { Sohar: 290, Muscat: 165, Seeb: 150, Nizwa: 11, Duqm: 420 },
  Duqm: { Sohar: 760, Muscat: 560, Seeb: 540, Nizwa: 420, Duqm: 6 },
};

export const campOf = (w: Pick<WorkerListItem, "code">): Camp => CAMPS[hash(`camp:${w.code}`) % CAMPS.length]!;
export const distanceKm = (camp: Camp, siteCity: string) => (KM[camp.city]?.[siteCity] ?? 300) + (hash(`${camp.id}:${siteCity}`) % 7);
export const skillLevel = (w: Pick<WorkerListItem, "code">): 1 | 2 | 3 => ((hash(`skill:${w.code}`) % 3) + 1) as 1 | 2 | 3;

/** Approved leave in the demo window for about one worker in sixteen. */
export function demoLeave(w: Pick<WorkerListItem, "code">): { from: string; to: string } | null {
  const h = hash(`leave:${w.code}`);
  if (h % 16 !== 0) return null;
  const from = dates.addDays(T, ((h >>> 4) % 20) - 3);
  return { from, to: dates.addDays(from, 2 + ((h >>> 9) % 4)) };
}

/** Why a worker's papers do not cover a period, from the real compliance summary. null when they do. */
export function papersProblem(w: WorkerListItem, to: string): string | null {
  const c = w.compliance;
  if (c.missing.length) return `Missing ${c.missing.map(documentLabel).join(", ").toLowerCase()}`;
  if (c.nextExpiry && (c.state === "expired" || c.nextExpiry.daysLeft < 0)) return `${documentLabel(c.nextExpiry.type)} expired ${displayDate(c.nextExpiry.expiryDate)}`;
  if (c.nextExpiry && c.nextExpiry.expiryDate <= to) return `${documentLabel(c.nextExpiry.type)} expires ${displayDate(c.nextExpiry.expiryDate)}, before the period ends`;
  return null;
}

export interface Candidate {
  worker: WorkerListItem;
  eligible: boolean;
  reasons: string[];
  camp: Camp;
  km: number;
  skill: 1 | 2 | 3;
  wage: string;
}

/** Rank workers of the line's trade: eligible first, then skill (high first), camp distance, cost. */
export function rankCandidates(line: RequestLine, siteId: string, workers: readonly WorkerListItem[], all: readonly Assignment[]): Candidate[] {
  const site = siteById(siteId);
  const period = { from: line.startDate, to: line.endDate };
  const out = workers
    .filter((w) => w.trade === line.trade && w.status !== "exited" && !all.some((a) => a.workerId === w.id && a.lineId === line.id))
    .map((w): Candidate => {
      const reasons: string[] = [];
      if (w.status === "deployed") reasons.push(`Deployed at ${siteOf(w)?.name ?? "another site"}`);
      else if (w.status === "on_leave") reasons.push("On leave");
      else if (w.status === "in_recruitment") reasons.push("Still in recruitment");
      else if (w.status === "absconding_reported") reasons.push("Absconding reported");
      const booked = all.find((a) => a.workerId === w.id && rangesOverlap({ from: a.startDate, to: a.endDate }, period));
      if (booked && w.status !== "deployed") reasons.push(`Assigned to ${siteById(booked.siteId)?.name} from ${displayDate(booked.startDate)}`);
      const leave = demoLeave(w);
      if (leave && w.status !== "on_leave" && rangesOverlap(leave, period)) reasons.push(`Leave ${displayDate(leave.from)} – ${displayDate(leave.to)}`);
      const papers = papersProblem(w, line.endDate);
      if (papers) reasons.push(papers);
      const skill = skillLevel(w);
      if (skill < line.skillLevelMin) reasons.push(`Skill level ${skill}, request needs ${line.skillLevelMin}`);
      const camp = campOf(w);
      return { worker: w, eligible: reasons.length === 0, reasons, camp, km: distanceKm(camp, site?.city ?? "Muscat"), skill, wage: basicWage(w) };
    });
  return out.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.skill - a.skill || a.km - b.km || omr(a.wage).comparedTo(omr(b.wage)));
}

/** Bench: available workers not assigned for today or later in this session. */
export function benchOf(workers: readonly WorkerListItem[], all: readonly Assignment[]) {
  const today = todayOman();
  const booked = new Set(all.filter((a) => a.endDate >= today).map((a) => a.workerId));
  return workers.filter((w) => w.status === "available" && !booked.has(w.id));
}

// ── Hooks: read through React Query so skeletons show and mutations can invalidate ──

/** Requests with filled counts. Waits for the real workforce, which the filled positions come from. */
export function useRequests() {
  const wf = useWorkforce();
  const q = useQuery({ queryKey: [...OPS_KEY, "requests"], queryFn: () => fetchRequests(wf.data!), enabled: !!wf.data });
  return { data: q.data, isLoading: wf.isLoading || q.isLoading, error: wf.error ?? q.error, workers: wf.data };
}

export function useAssignments() {
  const wf = useWorkforce();
  const q = useQuery({ queryKey: [...OPS_KEY, "assignments"], queryFn: () => fetchAssignments(wf.data!), enabled: !!wf.data });
  return { data: q.data, isLoading: wf.isLoading || q.isLoading, error: wf.error ?? q.error, workers: wf.data };
}
