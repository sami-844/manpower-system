/**
 * Calendar dates as `YYYY-MM-DD` strings (Oman time). Documents, rosters and
 * leave are day-based, so we never use timestamps for them.
 */
export type CalendarDate = string;

export interface DateRange {
  from: CalendarDate;
  to: CalendarDate;
}

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function toUtcMs(date: CalendarDate): number {
  const m = PATTERN.exec(date);
  if (!m) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  const [, y, mo, d] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d));
}

export function isValidDate(value: string): boolean {
  const m = PATTERN.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    dt.getUTCFullYear() === Number(y) &&
    dt.getUTCMonth() === Number(mo) - 1 &&
    dt.getUTCDate() === Number(d)
  );
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: CalendarDate, b: CalendarDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return new Date(toUtcMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive ranges overlap when each starts on or before the other ends. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}
