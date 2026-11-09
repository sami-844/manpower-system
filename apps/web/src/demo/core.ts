/**
 * DEMO DATA LAYER — fictional, deterministic sample data for modules whose API is not built yet
 * (Implementation Plan S6 onwards). Every screen that reads from `src/demo/` shows the
 * "Sample data" badge (PageHeader `sample`). Nothing here is real personal data (CLAUDE.md rule 11):
 * names are generated, IDs are obviously fake, no IBANs.
 *
 * Shapes follow docs/spec/07-Backend-Schema.md (camelCase, money as strings, dates as
 * YYYY-MM-DD) so each module can swap `src/demo/<module>.ts` for real `/api/v1/...` calls in its
 * sprint without touching the screens.
 *
 * Workers are NOT faked: the demo modules derive from the real `/api/workers` list, so a name in
 * the roster, a payslip or a timesheet opens the real worker file.
 */
import { addDays, omr, roundBaisa, type Omr } from "@mms/core";

/** Today in Oman (YYYY-MM-DD), the same rule as the API clock. */
export const todayOman = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Muscat" }).format(new Date());

/** Stable 32-bit hash of a string (FNV-1a), so the same worker always gets the same demo facts. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32). `rng("payroll")` gives the same sequence on every load. */
export function rng(seed: string | number) {
  let a = typeof seed === "number" ? seed : hash(seed);
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
  };
}

/** Money helpers for demo figures: always strings with 3 decimals, computed with decimal.js. */
export const money = {
  /** "123.450" from a decimal. */
  str: (d: Omr): string => roundBaisa(d).toFixed(3),
  /** Random amount between min and max (strings), rounded to `step` baisa-multiples. */
  between: (r: ReturnType<typeof rng>, min: string, max: string, step = "0.500"): string => {
    const lo = omr(min);
    const span = omr(max).minus(lo);
    const raw = lo.plus(span.times(r.next()));
    const s = omr(step);
    return raw.div(s).floor().times(s).toFixed(3);
  },
  sum: (xs: readonly string[]): string => xs.reduce((acc, x) => acc.plus(omr(x)), omr("0")).toFixed(3),
  times: (a: string, b: string | number): string => roundBaisa(omr(a).times(String(b))).toFixed(3),
  minus: (a: string, b: string): string => omr(a).minus(omr(b)).toFixed(3),
};

/** Calendar helpers on YYYY-MM-DD strings. */
export const dates = {
  addDays,
  monthStart: (d: string) => `${d.slice(0, 7)}-01`,
  monthEnd: (d: string) => {
    const [y, m] = d.split("-").map(Number) as [number, number];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${d.slice(0, 7)}-${String(last).padStart(2, "0")}`;
  },
  addMonths: (d: string, n: number) => {
    const [y, m] = d.split("-").map(Number) as [number, number];
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`;
  },
  /** "November 2026" */
  monthName: (d: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 7)}-01T00:00:00Z`)),
  /** Days from a to b inclusive. */
  range: (from: string, to: string): string[] => {
    const out: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  },
  /** 0 = Sunday … 6 = Saturday. Oman's weekend is Friday and Saturday. */
  weekday: (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay(),
  isWeekend: (d: string) => [5, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()),
};

/** Simulated network latency so loading states (skeletons) are real in the demo. */
export const delay = <T>(value: T, ms = 250): Promise<T> => new Promise((r) => setTimeout(() => r(value), ms));
