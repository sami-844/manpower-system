import { describe, expect, it } from "vitest";
import { describeExpiry, displayDate, humaniseDates, maskTail, statusTone, tagFor, userLabel, workerTag } from "./format";

describe("displayDate", () => {
  it("shows dates the way Oman offices write them", () => {
    expect(displayDate("2027-03-12")).toBe("12 Mar 2027");
    expect(displayDate(null)).toBe("—");
  });
});

describe("describeExpiry", () => {
  it.each([
    [-40, "Expired 40 days ago"],
    [-1, "Expired yesterday"],
    [0, "Expires today"],
    [1, "Expires tomorrow"],
    [6, "Expires in 6 days"],
    [120, "Expires in 120 days"],
  ])("%i days left reads %j", (daysLeft, text) => {
    expect(describeExpiry(daysLeft)).toBe(text);
  });
});

describe("tagFor", () => {
  it("maps compliance states to scaffold-tag colours and plain words", () => {
    expect(tagFor("ok")).toEqual({ tone: "green", label: "In order" });
    expect(tagFor("due")).toEqual({ tone: "yellow", label: "Renewal due" });
    expect(tagFor("expired")).toEqual({ tone: "red", label: "Expired" });
    expect(tagFor("incomplete")).toEqual({ tone: "none", label: "Papers missing" });
  });
});

describe("workerTag", () => {
  it("uses red for a renewal due within 30 days, matching document tags", () => {
    expect(workerTag({ state: "due", nextExpiry: { daysLeft: 1 } })).toEqual({ tone: "red", label: "Renewal due" });
    expect(workerTag({ state: "due", nextExpiry: { daysLeft: 30 } }).tone).toBe("red");
    expect(workerTag({ state: "due", nextExpiry: { daysLeft: 31 } }).tone).toBe("yellow");
    expect(workerTag({ state: "ok", nextExpiry: { daysLeft: 200 } }).tone).toBe("green");
  });
});

describe("humaniseDates", () => {
  it("rewrites ISO dates inside engine messages", () => {
    expect(humaniseDates("Residence visa expired on 2026-09-04")).toBe("Residence visa expired on 4 Sept 2026");
    expect(humaniseDates("Approved leave 2026-11-10 → 2026-11-12 overlaps the period")).toBe(
      "Approved leave 10 Nov 2026 → 12 Nov 2026 overlaps the period",
    );
  });
});

describe("maskTail", () => {
  it("keeps only the last four characters and passes masked values through", () => {
    expect(maskTail("P1234567")).toBe("••••4567");
    expect(maskTail("123")).toBe("••••");
    expect(maskTail("••••1234")).toBe("••••1234");
    expect(maskTail(null)).toBe("—");
  });
});

describe("statusTone and userLabel", () => {
  it("maps tag tones to status tones and usernames to people", () => {
    expect(statusTone("red")).toBe("expired");
    expect(statusTone("none")).toBe("incomplete");
    expect(userLabel("hr.officer")).toBe("Fatima Al Balushi");
    expect(userLabel("someone.else")).toBe("someone.else");
  });
});
