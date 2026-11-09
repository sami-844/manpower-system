import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isValidDate, rangesOverlap } from "./dates";

describe("calendar dates", () => {
  it("counts days between two dates", () => {
    expect(daysBetween("2026-10-14", "2026-10-14")).toBe(0);
    expect(daysBetween("2026-10-14", "2026-10-15")).toBe(1);
    expect(daysBetween("2026-10-15", "2026-10-14")).toBe(-1);
  });

  it("handles month ends and leap years", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2027-02-28", "2027-03-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("adds days", () => {
    expect(addDays("2026-10-14", 30)).toBe("2026-11-13");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("validates YYYY-MM-DD dates", () => {
    expect(isValidDate("2026-10-14")).toBe(true);
    expect(isValidDate("2026-02-30")).toBe(false);
    expect(isValidDate("14/10/2026")).toBe(false);
    expect(isValidDate("2026-1-4")).toBe(false);
  });

  it("detects overlapping inclusive ranges", () => {
    const a = { from: "2026-10-01", to: "2026-10-10" };
    expect(rangesOverlap(a, { from: "2026-10-10", to: "2026-10-20" })).toBe(true);
    expect(rangesOverlap(a, { from: "2026-09-20", to: "2026-10-01" })).toBe(true);
    expect(rangesOverlap(a, { from: "2026-10-11", to: "2026-10-20" })).toBe(false);
    expect(rangesOverlap(a, { from: "2026-09-01", to: "2026-09-30" })).toBe(false);
  });
});

describe("date validation edge cases", () => {
  it.each(["2026-13-01", "2026-00-10", "2027-02-29", "x2026-10-14", "2026-10-14x"])("rejects %s", (d) => {
    expect(isValidDate(d)).toBe(false);
  });

  it("accepts a leap day", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
  });

  it("refuses to calculate with a malformed date", () => {
    expect(() => daysBetween("14/10/2026", "2026-10-14")).toThrow(/Invalid date "14\/10\/2026"/);
    expect(() => addDays("2026-10-14T00:00", 1)).toThrow(/YYYY-MM-DD/);
  });
});
