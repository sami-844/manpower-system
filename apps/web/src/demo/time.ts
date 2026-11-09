/**
 * DEMO DATA — the Time module: daily sheets (S-39), attendance entry (S-40), timesheets
 * (S-19/S-20), client timesheet packs (S-41) and leave (S-21). Backend Schema tables
 * daily_sheets, attendance_events, timesheets, timesheet_lines, timesheet_approvals,
 * timesheet_disputes, timesheet_packs, leave_requests, leave_balances.
 *
 * Crews are the REAL deployed workers (`siteOf(worker)`), so every name opens the real worker
 * file. Everything else is fictional and deterministic (`rng`), and actions taken in the demo
 * (save a sheet, submit, record a signed pack, approve leave) live in an in-memory store until
 * the page reloads. Legal values (hours, leave days) are stand-ins for dated `rule_versions`
 * rows and are always shown with their rule key and version, never as law.
 */
import { daysBetween } from "@mms/core";
import type { WorkerListItem } from "@/lib/api";
import { displayDate } from "@/lib/format";
import { DEMO_ACCOUNTS } from "@/lib/roles";
import { dates, delay, hash, rng, todayOman } from "./core";
import { SITES, clientById, contractOf, siteById } from "./reference";
import { siteOf } from "./workforce";

// ---------------------------------------------------------------------------------------------
// Rule table stand-ins (Admin S-37 owns the real rule_versions).
// ---------------------------------------------------------------------------------------------
export interface RuleValue {
  key: string;
  version: string;
  value: number;
  unit: string;
}
export const RULES = {
  normalDaily: { key: "hours.normal_daily", version: "2026-01-01", value: 8, unit: "h" },
  maxDaily: { key: "hours.max_daily", version: "2026-01-01", value: 12, unit: "h" },
  annualLeave: { key: "leave.annual", version: "2026-01-01", value: 30, unit: "days" },
} satisfies Record<string, RuleValue>;
/** Public holidays from the calendar rule table (stand-in values). */
export const PUBLIC_HOLIDAYS = { key: "calendar.public_holidays", version: "2026-01-01", dates: ["2026-08-26"] };
export const ruleSource = (r: { key: string; version: string }) => `from rule table ${r.key} v${r.version}`;

// ---------------------------------------------------------------------------------------------
// People. The six demo accounts plus the operations timekeeper (no login in the demo).
// ---------------------------------------------------------------------------------------------
const TIMEKEEPER = "ops.timekeeper";
const NAMES: Record<string, string> = {
  ...Object.fromEntries(DEMO_ACCOUNTS.map((a) => [a.username, a.displayName])),
  [TIMEKEEPER]: "Rashid Al Amri",
  system: "System (contract rule)",
};
export const personName = (username: string | null | undefined) => (username ? (NAMES[username] ?? username) : "—");

/** Who usually types each site's sheets: the timekeeper or the operations manager. */
const ENTERER: Record<string, string> = { "st-01": TIMEKEEPER, "st-02": "ops.manager", "st-03": TIMEKEEPER, "st-04": "ops.manager", "st-05": TIMEKEEPER, "st-06": "ops.manager" };
/** Sites that also work Saturdays (rest-day hours). Friday is off everywhere. */
const SATURDAY_SITES = new Set(["st-01", "st-05"]);

export const isWorkDay = (siteId: string, date: string) => {
  const w = dates.weekday(date);
  return w !== 5 && (w !== 6 || SATURDAY_SITES.has(siteId));
};
export const isHoliday = (date: string) => PUBLIC_HOLIDAYS.dates.includes(date);
const today = () => todayOman();
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00+04:00`;

// ---------------------------------------------------------------------------------------------
// Crews and sheets
// ---------------------------------------------------------------------------------------------
export type Shift = "day" | "night";
export const SHIFT_LABEL: Record<Shift, string> = { day: "Day 07:00–16:00", night: "Night 19:00–04:00" };

export interface CrewMember {
  workerId: string;
  code: string;
  fullName: string;
  trade: string;
  shift: Shift;
  compliance: WorkerListItem["compliance"];
}

const crewCache = new WeakMap<readonly WorkerListItem[], Map<string, CrewMember[]>>();
/** The site's rostered crew: real deployed workers on that site, day shift first. */
export function crewOf(workers: readonly WorkerListItem[], siteId: string): CrewMember[] {
  let bySite = crewCache.get(workers);
  if (!bySite) {
    bySite = new Map();
    for (const w of workers) {
      const site = siteOf(w);
      if (!site) continue;
      const list = bySite.get(site.id) ?? [];
      list.push({ workerId: w.id, code: w.code, fullName: w.fullName, trade: w.trade, shift: hash(`shift:${w.code}`) % 5 === 0 ? "night" : "day", compliance: w.compliance });
      bySite.set(site.id, list);
    }
    for (const list of bySite.values()) list.sort((a, b) => (a.shift === b.shift ? a.code.localeCompare(b.code) : a.shift === "day" ? -1 : 1));
    crewCache.set(workers, bySite);
  }
  return bySite.get(siteId) ?? [];
}

export const staffedSites = (workers: readonly WorkerListItem[]) => SITES.filter((s) => crewOf(workers, s.id).length > 0);

export const sheetNo = (siteId: string, date: string) => `DS-${siteById(siteId)?.code ?? siteId}-${date.slice(2).replaceAll("-", "")}`;
export const qrToken = (siteId: string, date: string) => `mms:ds:${siteById(siteId)?.code}:${date}:${(hash(`qr:${siteId}:${date}`) % 0xfffff).toString(36).toUpperCase()}`;

// ---------------------------------------------------------------------------------------------
// Attendance lines
// ---------------------------------------------------------------------------------------------
/** P present (roster default), A absent, S sick, L late. */
export type Mark = "P" | "A" | "S" | "L";
export const MARK_LABEL: Record<Mark, string> = { P: "Present", A: "Absent", S: "Sick", L: "Late" };
export interface EntryLine {
  code: string;
  mark: Mark;
  ot: number;
  remarks: string;
}
export const rosterLines = (crew: readonly CrewMember[]): EntryLine[] => crew.map((m) => ({ code: m.code, mark: "P", ot: 0, remarks: "" }));
export const differsFromRoster = (l: EntryLine) => l.mark !== "P" || l.ot > 0 || l.remarks.trim() !== "";

/** What the supervisor wrote on the paper: the "truth" the scan shows (exceptions only). */
export function scanMarks(siteId: string, date: string, crew: readonly CrewMember[]): Map<string, EntryLine> {
  const out = new Map<string, EntryLine>();
  for (const m of crew) {
    const r = rng(`mk:${siteId}:${date}:${m.code}`);
    const x = r.next();
    const mark: Mark = x < 0.03 ? "A" : x < 0.05 ? "S" : x < 0.075 ? "L" : "P";
    let ot = mark !== "A" && mark !== "S" && r.chance(0.2) ? r.pick([1, 1.5, 2, 2, 3]) : 0;
    if (mark === "P" && r.chance(0.008)) ot = 5;
    const remarks = mark === "L" ? `In ${r.pick(["07:40", "08:05", "08:20", "09:10"])}` : mark === "S" ? r.pick(["Clinic", "Fever", "Back pain"]) : "";
    if (mark !== "P" || ot > 0) out.set(m.code, { code: m.code, mark, ot, remarks });
  }
  return out;
}

export interface Hours {
  normal: number;
  overtime: number;
  restDay: number;
  holiday: number;
}
export const zeroHours = (): Hours => ({ normal: 0, overtime: 0, restDay: 0, holiday: 0 });
export const totalHours = (h: Hours) => h.normal + h.overtime + h.restDay + h.holiday;
/** One line's hours by hour type (Backend Schema timesheet_lines.hour_type). */
export function lineHours(l: EntryLine, date: string): Hours {
  const h = zeroHours();
  if (l.mark === "A" || l.mark === "S") return h;
  const base = RULES.normalDaily.value;
  if (isHoliday(date)) h.holiday = base + l.ot;
  else if (dates.weekday(date) === 6) h.restDay = base + l.ot;
  else {
    h.normal = base;
    h.overtime = l.ot;
  }
  return h;
}
const addHours = (a: Hours, b: Hours) => {
  a.normal += b.normal;
  a.overtime += b.overtime;
  a.restDay += b.restDay;
  a.holiday += b.holiday;
};

export interface LineFlag {
  kind: "not_eligible" | "max_hours";
  reason: string;
}
/** Server-side checks on an entered line (App Flow step 4), mirrored for the demo. */
export function lineFlags(l: EntryLine, m: CrewMember, date: string): LineFlag[] {
  const flags: LineFlag[] = [];
  const working = l.mark === "P" || l.mark === "L";
  // Eligibility is per work date: a document that expired after this day does not flag it.
  if (working && m.compliance.nextExpiry && m.compliance.nextExpiry.expiryDate < date) {
    const type = m.compliance.nextExpiry.type.replaceAll("_", " ");
    flags.push({ kind: "not_eligible", reason: `Not eligible: ${type} expired ${displayDate(m.compliance.nextExpiry.expiryDate)}` });
  }
  const total = RULES.normalDaily.value + l.ot;
  if (working && total > RULES.maxDaily.value) flags.push({ kind: "max_hours", reason: `${total} h is over the ${RULES.maxDaily.value} h daily maximum (${ruleSource(RULES.maxDaily)})` });
  return flags;
}

// ---------------------------------------------------------------------------------------------
// Site-days (daily_sheets rows) and the session store
// ---------------------------------------------------------------------------------------------
export type SiteDayStatus = "entered" | "waiting" | "no_scan";
export interface SiteDay {
  id: string;
  siteId: string;
  date: string;
  sheetNo: string;
  qrToken: string;
  crewCount: number;
  scan: { filedAt: string; via: "WhatsApp" | "Office scanner" } | null;
  entry: { by: string; at: string; exceptions: number; seconds: number | null } | null;
  status: SiteDayStatus;
  /** A rostered site-day before today with no filed scan (TR-CLI-14, flagged next morning). */
  overdue: boolean;
}
interface SavedEntry {
  by: string;
  at: string;
  seconds: number;
  lines: EntryLine[];
}

const store = {
  entries: new Map<string, SavedEntry>(),
  printed: new Map<string, string>(),
  sent: new Map<string, string>(),
  ts: new Map<string, Partial<TimesheetState>>(),
  disputes: null as Dispute[] | null,
  corrections: null as Correction[] | null,
  leave: null as LeaveRequest[] | null,
};

export const siteDayId = (siteId: string, date: string) => `${siteId}:${date}`;

function baseSiteDay(siteId: string, date: string) {
  const ago = daysBetween(date, today());
  const r = rng(`sd:${siteId}:${date}`);
  const missingFixed = siteId === "st-05" && date === "2026-11-08"; // matches the S-04 notification
  const filed = !missingFixed && (ago >= 3 || (ago >= 1 ? r.chance(0.9) : ago === 0 ? r.chance(0.5) : false));
  const entered = filed && (ago >= 3 || (ago >= 1 && r.chance(0.55)));
  const next = dates.addDays(date, 1);
  return {
    scan: filed ? { filedAt: at(date, `${r.int(16, 19)}:${String(r.int(0, 59)).padStart(2, "0")}`), via: r.chance(0.8) ? ("WhatsApp" as const) : ("Office scanner" as const) } : null,
    entry: entered ? { by: ENTERER[siteId] ?? TIMEKEEPER, at: at(next, `0${r.int(8, 9)}:${String(r.int(0, 59)).padStart(2, "0")}`), seconds: r.int(70, 150) } : null,
  };
}

/** The lines on a site-day: what was saved, or null when nobody has entered it yet. */
export function enteredLines(siteId: string, date: string, crew: readonly CrewMember[]): EntryLine[] | null {
  const saved = store.entries.get(siteDayId(siteId, date));
  if (saved) return saved.lines;
  if (!baseSiteDay(siteId, date).entry) return null;
  const marks = scanMarks(siteId, date, crew);
  return crew.map((m) => marks.get(m.code) ?? { code: m.code, mark: "P", ot: 0, remarks: "" });
}

function siteDay(workers: readonly WorkerListItem[], siteId: string, date: string): SiteDay {
  const crew = crewOf(workers, siteId);
  const base = baseSiteDay(siteId, date);
  const saved = store.entries.get(siteDayId(siteId, date));
  const lines = enteredLines(siteId, date, crew);
  const entry = saved ? { by: saved.by, at: saved.at, seconds: saved.seconds } : base.entry;
  const status: SiteDayStatus = entry ? "entered" : base.scan ? "waiting" : "no_scan";
  return {
    id: siteDayId(siteId, date),
    siteId,
    date,
    sheetNo: sheetNo(siteId, date),
    qrToken: qrToken(siteId, date),
    crewCount: crew.length,
    scan: base.scan,
    entry: entry && lines ? { ...entry, exceptions: lines.filter(differsFromRoster).length } : null,
    status,
    overdue: !base.scan && date < today(),
  };
}

/** Site-days for the entry queue: the last `days` calendar days up to today, newest first. */
export function getSiteDays(workers: readonly WorkerListItem[], days = 6) {
  const out: SiteDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = dates.addDays(today(), -i);
    for (const s of staffedSites(workers)) if (isWorkDay(s.id, date)) out.push(siteDay(workers, s.id, date));
  }
  return delay(out, 200);
}

export function saveEntry(input: { siteId: string; date: string; lines: EntryLine[]; by: string; seconds: number }) {
  store.entries.set(siteDayId(input.siteId, input.date), { by: input.by, at: new Date().toISOString(), seconds: input.seconds, lines: input.lines.map((l) => ({ ...l })) });
  return delay({ ok: true }, 300);
}

/** Who entered any sheet of this site in [from, to] (four-eyes: they cannot review/submit it). */
export function enterersOf(siteId: string, from: string, to: string): string[] {
  const who = new Set<string>();
  for (const d of dates.range(from, to < today() ? to : today())) {
    if (!isWorkDay(siteId, d)) continue;
    const saved = store.entries.get(siteDayId(siteId, d));
    const e = saved ? saved.by : baseSiteDay(siteId, d).entry?.by;
    if (e) who.add(e);
  }
  return [...who];
}

// ---------------------------------------------------------------------------------------------
// Daily sheets (S-39)
// ---------------------------------------------------------------------------------------------
export type SheetStatus = "generated" | "printed" | "sent" | "scan_filed" | "missing";
export interface DailySheetRow {
  id: string;
  siteId: string;
  clientId: string;
  supervisor: string;
  date: string;
  sheetNo: string;
  qrToken: string;
  crewCount: number;
  dayShift: number;
  nightShift: number;
  status: SheetStatus;
  printedAt: string | null;
  sentAt: string | null;
  scanFiledAt: string | null;
}

function sheetRow(workers: readonly WorkerListItem[], siteId: string, date: string): DailySheetRow {
  const site = siteById(siteId)!;
  const crew = crewOf(workers, siteId);
  const id = siteDayId(siteId, date);
  const isPast = date <= today();
  const base = baseSiteDay(siteId, date);
  // Tomorrow's sheets: the remote sites already went out by WhatsApp; two were printed this afternoon.
  const printedAt = store.printed.get(id) ?? (isPast || ["st-01", "st-03"].includes(siteId) ? at(isPast ? dates.addDays(date, -1) : today(), "15:40") : null);
  const sentAt = store.sent.get(id) ?? (siteId === "st-05" || (isPast && siteId === "st-06") ? at(isPast ? dates.addDays(date, -1) : today(), "16:05") : null);
  const scanKnown = date < today() || (isPast && !!base.scan);
  const status: SheetStatus = scanKnown ? (base.scan ? "scan_filed" : "missing") : sentAt ? "sent" : printedAt ? "printed" : "generated";
  return {
    id,
    siteId,
    clientId: site.clientId,
    supervisor: site.supervisor,
    date,
    sheetNo: sheetNo(siteId, date),
    qrToken: qrToken(siteId, date),
    crewCount: crew.length,
    dayShift: crew.filter((m) => m.shift === "day").length,
    nightShift: crew.filter((m) => m.shift === "night").length,
    status,
    printedAt,
    sentAt,
    scanFiledAt: base.scan?.filedAt ?? null,
  };
}

export function getDailySheets(workers: readonly WorkerListItem[], date: string) {
  return delay(
    staffedSites(workers)
      .filter((s) => isWorkDay(s.id, date))
      .map((s) => sheetRow(workers, s.id, date)),
    220,
  );
}
/** Past site-days' sheets (scan filed or missing), newest first. */
export function getRecentSheets(workers: readonly WorkerListItem[], days = 7) {
  const rows: DailySheetRow[] = [];
  for (let i = 0; i < days; i++) {
    const d = dates.addDays(today(), -i);
    for (const s of staffedSites(workers)) if (isWorkDay(s.id, d)) rows.push(sheetRow(workers, s.id, d));
  }
  return delay(rows, 220);
}
export function markPrinted(ids: string[]) {
  const now = new Date().toISOString();
  for (const id of ids) store.printed.set(id, now);
  return delay({ ok: true }, 150);
}
export function markSent(ids: string[]) {
  const now = new Date().toISOString();
  for (const id of ids) store.sent.set(id, now);
  return delay({ ok: true }, 400);
}

// ---------------------------------------------------------------------------------------------
// Timesheets (S-19, S-20) and packs (S-41)
// ---------------------------------------------------------------------------------------------
export type TimesheetStatus = "draft" | "submitted" | "client_approved" | "locked";
export const TIMESHEET_STATUS_LABEL: Record<TimesheetStatus, string> = { draft: "Draft", submitted: "Submitted", client_approved: "Client approved", locked: "Locked" };

export interface Approval {
  method: "signed_pack" | "auto";
  fileName: string | null;
  by: string;
  at: string;
}
interface TimesheetState {
  status: TimesheetStatus;
  reviewedBy: string | null;
  submittedAt: string | null;
  approval: Approval | null;
  lockedAt: string | null;
  lockedBy: string | null;
  packSentAt: string | null;
  chasedAt: string | null;
}
export interface Period {
  start: string;
  end: string;
  label: string;
}
export interface TimesheetRow extends TimesheetState {
  id: string;
  siteId: string;
  clientId: string;
  period: Period;
  workers: number;
  daysExpected: number;
  daysEntered: number;
  daysMissingScan: number;
  totals: Hours;
  enteredBy: string[];
  openDisputes: number;
  autoApproveDays: number;
  /** Date the pack auto-approves (contract autoApproveDays after sending), when one is out. */
  autoApproveOn: string | null;
  contractRef: string;
}

/** Periods are calendar months (PRD §5: one locked timesheet per worker per month). Newest first. */
export function periods(count = 4): Period[] {
  return Array.from({ length: count }, (_, i) => {
    const start = dates.addMonths(today(), -i);
    return { start, end: dates.monthEnd(start), label: dates.monthName(start) };
  });
}
export const timesheetId = (siteId: string, periodStart: string) => `ts-${siteById(siteId)?.code.toLowerCase()}-${periodStart.slice(0, 7)}`;
export function parseTimesheetId(id: string): { siteId: string; periodStart: string } | null {
  const m = /^ts-(.+)-(\d{4}-\d{2})$/.exec(id);
  const site = m && SITES.find((s) => s.code.toLowerCase() === m[1]);
  return site && m ? { siteId: site.id, periodStart: `${m[2]}-01` } : null;
}

function baseTimesheet(siteId: string, p: Period): TimesheetState {
  const monthsAgo = periods(6).findIndex((x) => x.start === p.start);
  const r = rng(`ts:${siteId}:${p.start}`);
  const reviewer = ENTERER[siteId] === TIMEKEEPER ? "ops.manager" : "owner.gm";
  const empty: TimesheetState = { status: "draft", reviewedBy: null, submittedAt: null, approval: null, lockedAt: null, lockedBy: null, packSentAt: null, chasedAt: null };
  if (monthsAgo <= 0) return empty;
  const sent = dates.addDays(p.end, r.int(1, 2));
  const signed = (d: number): Approval => ({ method: "signed_pack", fileName: `${siteById(siteId)?.code}_${p.start.slice(0, 7)}_signed.pdf`, by: reviewer, at: at(dates.addDays(sent, d), "11:20") });
  const auto = (): Approval => ({ method: "auto", fileName: null, by: "system", at: at(dates.addDays(sent, contractOf(siteById(siteId)!.clientId)?.autoApproveDays ?? 5), "00:05") });
  const submitted = { ...empty, status: "submitted" as const, reviewedBy: reviewer, submittedAt: at(sent, "10:00"), packSentAt: at(sent, "10:02") };
  const locked = (a: Approval): TimesheetState => ({ ...submitted, status: "locked", approval: a, lockedAt: at(dates.addDays(p.end, 8), "14:30"), lockedBy: "payroll.officer" });
  if (monthsAgo >= 2) return locked(r.chance(0.25) ? auto() : signed(r.int(1, 3)));
  // Last month: one of each state, so every path through S-19/S-20/S-41 is visible.
  switch (siteId) {
    case "st-01":
      return locked(signed(2));
    case "st-02":
      return locked(auto());
    case "st-03":
      return { ...submitted, status: "client_approved", approval: signed(3) };
    case "st-04": {
      const s = dates.addDays(today(), -2);
      return { ...submitted, submittedAt: at(s, "09:30"), packSentAt: at(s, "09:32") };
    }
    case "st-05":
      return submitted;
    default:
      return empty; // operations review still missing
  }
}

export function getTimesheetsSync(workers: readonly WorkerListItem[]): TimesheetRow[] {
  ensureSeed(workers);
  const rows: TimesheetRow[] = [];
  for (const p of periods()) {
    for (const s of staffedSites(workers)) {
      const id = timesheetId(s.id, p.start);
      const crew = crewOf(workers, s.id);
      const state: TimesheetState = { ...baseTimesheet(s.id, p), ...store.ts.get(id) };
      const contract = contractOf(s.clientId);
      const autoDays = contract?.autoApproveDays ?? 5;
      const openDisputes = (store.disputes ?? []).filter((d) => d.timesheetId === id && d.status !== "resolved").length;
      // Contract auto-approve (paused while a line is disputed).
      const autoOn = state.packSentAt ? dates.addDays(state.packSentAt.slice(0, 10), autoDays) : null;
      if (state.status === "submitted" && autoOn && openDisputes === 0 && autoOn <= today()) {
        state.status = "client_approved";
        state.approval = { method: "auto", fileName: null, by: "system", at: at(autoOn, "00:05") };
      }
      const totals = zeroHours();
      let expected = 0;
      let entered = 0;
      let missing = 0;
      for (const d of dates.range(p.start, p.end < today() ? p.end : today())) {
        if (!isWorkDay(s.id, d)) continue;
        expected++;
        if (!baseSiteDay(s.id, d).scan) missing++;
        const lines = enteredLines(s.id, d, crew);
        if (!lines) continue;
        entered++;
        for (const l of lines) addHours(totals, lineHours(l, d));
      }
      rows.push({
        ...state,
        id,
        siteId: s.id,
        clientId: s.clientId,
        period: p,
        workers: crew.length,
        daysExpected: expected,
        daysEntered: entered,
        daysMissingScan: missing,
        totals,
        enteredBy: enterersOf(s.id, p.start, p.end),
        openDisputes,
        autoApproveDays: autoDays,
        autoApproveOn: state.status === "submitted" ? autoOn : null,
        contractRef: contract?.reference ?? "—",
      });
    }
  }
  return rows;
}
export const getTimesheets = (workers: readonly WorkerListItem[]) => delay(getTimesheetsSync(workers), 250);

export interface DayCell {
  date: string;
  line: EntryLine | null;
  hours: Hours;
  flags: LineFlag[];
}
export interface WorkerLines {
  member: CrewMember;
  days: DayCell[];
  totals: Hours;
}
export interface TimesheetDetailData {
  sheet: TimesheetRow;
  days: { date: string; workDay: boolean; siteDay: SiteDay | null }[];
  workers: WorkerLines[];
  disputes: Dispute[];
  corrections: Correction[];
}
export function getTimesheet(workers: readonly WorkerListItem[], id: string) {
  const sheet = getTimesheetsSync(workers).find((t) => t.id === id) ?? null;
  if (!sheet) return delay(null, 200);
  const crew = crewOf(workers, sheet.siteId);
  const range = dates.range(sheet.period.start, sheet.period.end);
  const byDay = new Map(range.map((d) => [d, d <= today() && isWorkDay(sheet.siteId, d) ? enteredLines(sheet.siteId, d, crew) : null]));
  const lines: WorkerLines[] = crew.map((m, i) => {
    const totals = zeroHours();
    const days = range.map((d) => {
      const line = byDay.get(d)?.[i] ?? null;
      const hours = line ? lineHours(line, d) : zeroHours();
      addHours(totals, hours);
      return { date: d, line, hours, flags: line ? lineFlags(line, m, d) : [] };
    });
    return { member: m, days, totals };
  });
  return delay<TimesheetDetailData>(
    {
      sheet,
      days: range.map((d) => ({ date: d, workDay: isWorkDay(sheet.siteId, d), siteDay: d <= today() && isWorkDay(sheet.siteId, d) ? siteDay(workers, sheet.siteId, d) : null })),
      workers: lines,
      disputes: (store.disputes ?? []).filter((d) => d.timesheetId === id),
      corrections: (store.corrections ?? []).filter((c) => c.timesheetId === id || c.targetTimesheetId === id),
    },
    250,
  );
}

const patchTs = (id: string, patch: Partial<TimesheetState>) => store.ts.set(id, { ...store.ts.get(id), ...patch });
export function submitTimesheet(id: string, by: string) {
  const now = new Date().toISOString();
  patchTs(id, { status: "submitted", reviewedBy: by, submittedAt: now, packSentAt: now });
  return delay({ ok: true }, 350);
}
export function recordSignedApproval(id: string, by: string, fileName: string) {
  if (!fileName) return Promise.reject(new Error("Attach the client's signed pack to record an approval."));
  patchTs(id, { status: "client_approved", approval: { method: "signed_pack", fileName, by, at: new Date().toISOString() } });
  for (const d of store.disputes ?? []) if (d.timesheetId === id && d.status !== "resolved") d.status = "resolved";
  return delay({ ok: true }, 400);
}
export function lockTimesheet(id: string, by: string) {
  patchTs(id, { status: "locked", lockedAt: new Date().toISOString(), lockedBy: by });
  return delay({ ok: true }, 300);
}
export function resendPack(id: string) {
  patchTs(id, { packSentAt: new Date().toISOString() });
  return delay({ ok: true }, 400);
}
export function chaseTimesheet(id: string) {
  patchTs(id, { chasedAt: new Date().toISOString() });
  return delay({ ok: true }, 300);
}

export type PackStatus = "not_sent" | "sent" | "awaiting" | "signed" | "auto_approved" | "late";
export const PACK_STATUS_LABEL: Record<PackStatus, string> = { not_sent: "Not sent", sent: "Sent", awaiting: "Awaiting signature", signed: "Signed", auto_approved: "Auto-approved", late: "Late" };
export function packStatus(t: TimesheetRow): PackStatus {
  if (!t.packSentAt) return "not_sent";
  if (t.approval) return t.approval.method === "auto" ? "auto_approved" : "signed";
  const sentDaysAgo = daysBetween(t.packSentAt.slice(0, 10), today());
  if (t.openDisputes > 0 && sentDaysAgo >= t.autoApproveDays) return "late";
  return sentDaysAgo <= 1 ? "sent" : "awaiting";
}
export const clientContact = (clientId: string) => {
  const c = clientById(clientId);
  return c?.contacts.find((x) => x.canApproveTimesheets) ?? c?.contacts[0] ?? null;
};

// Disputes and corrections -------------------------------------------------------------------
export interface Dispute {
  id: string;
  timesheetId: string;
  workerCode: string;
  workerName: string;
  workDate: string;
  raisedBy: string;
  raisedAt: string;
  reason: string;
  response: string | null;
  evidence: string | null;
  respondedBy: string | null;
  status: "open" | "responded" | "resolved";
}
export interface Correction {
  id: string;
  timesheetId: string;
  targetTimesheetId: string;
  targetPeriod: string;
  workerCode: string;
  workerName: string;
  workDate: string;
  hourType: keyof Hours;
  deltaHours: number;
  reason: string;
  by: string;
  at: string;
}

function ensureSeed(workers: readonly WorkerListItem[]) {
  if (store.disputes && store.corrections) return;
  const [last, prev] = [periods()[1]!, periods()[2]!];
  const pickLine = (siteId: string, p: Period, wantOt: boolean) => {
    const crew = crewOf(workers, siteId);
    for (const d of dates.range(p.start, p.end)) {
      if (!isWorkDay(siteId, d)) continue;
      for (const l of scanMarks(siteId, d, crew).values()) if (wantOt ? l.ot > 0 : l.mark === "P") return { d, m: crew.find((c) => c.code === l.code)! };
    }
    return crew[0] ? { d: p.start, m: crew[0] } : null;
  };
  const disputes: Dispute[] = [];
  const a = pickLine("st-05", last, true);
  if (a)
    disputes.push({ id: "dp-1", timesheetId: timesheetId("st-05", last.start), workerCode: a.m.code, workerName: a.m.fullName, workDate: a.d, raisedBy: clientContact("cl-04")?.name ?? "Client", raisedAt: at(dates.addDays(last.end, 4), "12:15"), reason: "Our gate log shows exit at 16:05. We do not accept the overtime on this day.", response: null, evidence: null, respondedBy: null, status: "open" });
  const b = pickLine("st-01", last, true);
  if (b)
    disputes.push({ id: "dp-2", timesheetId: timesheetId("st-01", last.start), workerCode: b.m.code, workerName: b.m.fullName, workDate: b.d, raisedBy: clientContact("cl-01")?.name ?? "Client", raisedAt: at(dates.addDays(last.end, 2), "09:40"), reason: "Overtime not pre-approved by our site engineer.", response: "Overtime was requested by your engineer for the crane lift; the signed sheet and supervisor statement are attached.", evidence: "Supervisor statement", respondedBy: "ops.manager", status: "resolved" });
  const c = pickLine("st-03", prev, false);
  const corrections: Correction[] = [];
  if (c)
    corrections.push({ id: "cr-1", timesheetId: timesheetId("st-03", prev.start), targetTimesheetId: timesheetId("st-03", last.start), targetPeriod: last.label, workerCode: c.m.code, workerName: c.m.fullName, workDate: c.d, hourType: "overtime", deltaHours: 2, reason: "Late sheet from the night shift showed 2 h overtime not on the original scan.", by: "ops.manager", at: at(dates.addDays(prev.end, 12), "10:10") });
  store.disputes = disputes;
  store.corrections = corrections;
}

export function raiseDispute(input: Omit<Dispute, "id" | "raisedAt" | "response" | "evidence" | "respondedBy" | "status">) {
  store.disputes = [...(store.disputes ?? []), { ...input, id: `dp-${Date.now()}`, raisedAt: new Date().toISOString(), response: null, evidence: null, respondedBy: null, status: "open" }];
  return delay({ ok: true }, 300);
}
export function respondDispute(id: string, response: string, evidence: string, by: string) {
  store.disputes = (store.disputes ?? []).map((d) => (d.id === id ? { ...d, response, evidence, respondedBy: by, status: "responded" } : d));
  return delay({ ok: true }, 300);
}
export function addCorrection(input: Omit<Correction, "id" | "at">) {
  store.corrections = [...(store.corrections ?? []), { ...input, id: `cr-${Date.now()}`, at: new Date().toISOString() }];
  return delay({ ok: true }, 300);
}

// ---------------------------------------------------------------------------------------------
// Leave (S-21)
// ---------------------------------------------------------------------------------------------
export type LeaveType = "annual" | "sick" | "emergency" | "unpaid";
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = { annual: "Annual", sick: "Sick", emergency: "Emergency", unpaid: "Unpaid" };
export type LeaveStatus = "pending_ops" | "pending_hr" | "approved" | "rejected" | "returned";
export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = { pending_ops: "Awaiting operations", pending_hr: "Awaiting HR", approved: "Approved", rejected: "Rejected", returned: "Returned" };

export interface LeaveRequest {
  id: string;
  workerId: string;
  workerCode: string;
  workerName: string;
  trade: string;
  /** Site the worker was deployed to when they asked (for the roster-gap hint). */
  siteId: string | null;
  type: LeaveType;
  fromDate: string;
  toDate: string;
  travelDate: string | null;
  returnDate: string | null;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  opsBy: string | null;
  hrBy: string | null;
  status: LeaveStatus;
}
export const leaveDays = (l: Pick<LeaveRequest, "fromDate" | "toDate">) => daysBetween(l.fromDate, l.toDate) + 1;

function seedLeave(workers: readonly WorkerListItem[]): LeaveRequest[] {
  const t = today();
  const out: LeaveRequest[] = [];
  const make = (w: WorkerListItem, i: number, kind: "away" | "pending" | "history" | "sick"): LeaveRequest => {
    const r = rng(`lv:${w.code}`);
    const site = siteOf(w);
    const base = { id: `lv-${w.code}`, workerId: w.id, workerCode: w.code, workerName: w.fullName, trade: w.trade, siteId: site?.id ?? null, requestedBy: r.chance(0.5) ? "hr.officer" : "ops.manager" };
    if (kind === "away") {
      // Real on_leave workers: approved home leave. Every seventh is past their return date.
      const overdue = i % 7 === 3;
      const from = dates.addDays(t, overdue ? -r.int(32, 40) : -r.int(3, 25));
      const to = overdue ? dates.addDays(t, -r.int(2, 6)) : dates.addDays(from, r.pick([21, 30, 30, 45]));
      const type: LeaveType = i % 9 === 4 ? "emergency" : "annual";
      return { ...base, siteId: null, type, fromDate: from, toDate: to, travelDate: from, returnDate: dates.addDays(to, 1), reason: type === "emergency" ? "Family emergency" : "Home leave", requestedAt: at(dates.addDays(from, -20), "10:00"), opsBy: "ops.manager", hrBy: "hr.officer", status: "approved" };
    }
    if (kind === "pending") {
      const from = dates.addDays(t, r.int(6, 40));
      const type: LeaveType = i % 5 === 2 ? "unpaid" : i % 6 === 5 ? "emergency" : "annual";
      const to = dates.addDays(from, type === "annual" ? r.pick([14, 21, 30]) : r.int(4, 10));
      return { ...base, type, fromDate: from, toDate: to, travelDate: type === "unpaid" ? null : from, returnDate: dates.addDays(to, 1), reason: type === "unpaid" ? "Wedding in family" : type === "emergency" ? "Parent in hospital" : "Home leave", requestedAt: at(dates.addDays(t, -r.int(0, 4)), "09:15"), opsBy: i % 3 === 0 ? "ops.manager" : null, hrBy: null, status: i % 3 === 0 ? "pending_hr" : "pending_ops" };
    }
    if (kind === "sick") {
      const from = dates.addDays(t, -r.int(3, 20));
      const to = dates.addDays(from, r.int(1, 3));
      return { ...base, type: "sick", fromDate: from, toDate: to, travelDate: null, returnDate: dates.addDays(to, 1), reason: "Medical certificate filed", requestedAt: at(from, "08:00"), opsBy: "ops.manager", hrBy: "hr.officer", status: "returned" };
    }
    const from = dates.addDays(t, -r.int(60, 200));
    const to = dates.addDays(from, r.pick([21, 30]));
    return { ...base, type: "annual", fromDate: from, toDate: to, travelDate: from, returnDate: dates.addDays(to, 1), reason: "Home leave", requestedAt: at(dates.addDays(from, -21), "11:00"), opsBy: "ops.manager", hrBy: "hr.officer", status: "returned" };
  };
  const away = workers.filter((w) => w.status === "on_leave");
  const deployed = workers.filter((w) => w.status === "deployed");
  away.forEach((w, i) => out.push(make(w, i, "away")));
  deployed.filter((w) => hash(`lvp:${w.code}`) % 40 === 0).slice(0, 12).forEach((w, i) => out.push(make(w, i, "pending")));
  deployed.filter((w) => hash(`lvs:${w.code}`) % 60 === 1).slice(0, 5).forEach((w, i) => out.push(make(w, i, "sick")));
  workers.filter((w) => w.status === "available" && hash(`lvh:${w.code}`) % 25 === 2).slice(0, 8).forEach((w, i) => out.push(make(w, i, "history")));
  return out;
}

function leaveList(workers: readonly WorkerListItem[]) {
  store.leave ??= seedLeave(workers);
  return store.leave;
}
export const getLeaveRequests = (workers: readonly WorkerListItem[]) => delay([...leaveList(workers)].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)), 220);

export interface LeaveBalance {
  workerId: string;
  workerCode: string;
  workerName: string;
  trade: string;
  status: string;
  entitlement: number;
  carriedOver: number;
  accrued: number;
  taken: number;
  booked: number;
  balance: number;
}
export function getLeaveBalances(workers: readonly WorkerListItem[]) {
  const requests = leaveList(workers);
  const year = today().slice(0, 4);
  const monthsDone = Number(today().slice(5, 7)) - 1;
  const ent = RULES.annualLeave.value;
  return delay(
    workers.map((w): LeaveBalance => {
      const r = rng(`bal:${w.code}`);
      const accrued = Math.round(((ent * monthsDone) / 12) * 10) / 10;
      const carriedOver = r.int(0, 12);
      const mine = requests.filter((l) => l.workerId === w.id && l.type === "annual" && l.fromDate.startsWith(year));
      const taken = mine.filter((l) => l.status === "approved" || l.status === "returned").filter((l) => l.fromDate <= today()).reduce((s, l) => s + leaveDays(l), 0) + (r.chance(0.3) ? r.int(2, 10) : 0);
      const booked = mine.filter((l) => l.status !== "rejected" && l.fromDate > today()).reduce((s, l) => s + leaveDays(l), 0);
      return { workerId: w.id, workerCode: w.code, workerName: w.fullName, trade: w.trade, status: w.status, entitlement: ent, carriedOver, accrued, taken, booked, balance: Math.round((carriedOver + accrued - taken) * 10) / 10 };
    }),
    250,
  );
}

export function addLeaveRequest(workers: readonly WorkerListItem[], input: Omit<LeaveRequest, "id" | "requestedAt" | "opsBy" | "hrBy" | "status">) {
  leaveList(workers).push({ ...input, id: `lv-new-${Date.now()}`, requestedAt: new Date().toISOString(), opsBy: null, hrBy: null, status: "pending_ops" });
  return delay({ ok: true }, 200);
}
export function decideLeave(id: string, by: string, approve: boolean) {
  const l = store.leave?.find((x) => x.id === id);
  if (l) {
    if (!approve) l.status = "rejected";
    else if (l.status === "pending_ops") Object.assign(l, { status: "pending_hr", opsBy: by });
    else if (l.status === "pending_hr") Object.assign(l, { status: "approved", hrBy: by });
  }
  return delay({ ok: true }, 300);
}

