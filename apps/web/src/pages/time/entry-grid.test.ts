import { describe, expect, it } from "vitest";
import { gridReducer, keyToAction, type GridState } from "./entry-grid";

const start = (): GridState => ({ lines: ["W-1", "W-2", "W-3"].map((code) => ({ code, mark: "P" as const, ot: 0, remarks: "" })), row: 0, col: 0, buffer: "" });
const press = (s: GridState, ...keys: string[]) => keys.reduce((acc, k) => { const a = keyToAction(k, acc.col); return a ? gridReducer(acc, a) : acc; }, s);

describe("attendance entry grid keyboard (S-40, TR-CLI-13)", () => {
  it("marks exceptions with single keys and Enter moves down the column", () => {
    const s = press(start(), "a", "Enter", "s", "Enter", "l");
    expect(s.lines.map((l) => l.mark)).toEqual(["A", "S", "L"]);
    expect(s.row).toBe(2);
  });

  it("digits type overtime, Backspace clears, and moves stay inside the grid", () => {
    let s = press(start(), "ArrowDown", "1", ".", "5");
    expect(s.lines[1]).toMatchObject({ ot: 1.5, mark: "P" });
    s = press(s, "Backspace");
    expect(s.lines[1]!.ot).toBe(0);
    s = press(s, "ArrowUp", "ArrowUp", "ArrowUp", "ArrowLeft", "ArrowLeft");
    expect([s.row, s.col]).toEqual([0, 0]);
  });

  it("absent clears overtime and rejects impossible hours", () => {
    let s = press(start(), "3", "a");
    expect(s.lines[0]).toMatchObject({ mark: "A", ot: 0 });
    s = press(start(), "2", "5");
    expect(s.lines[0]!.ot).toBe(2);
  });
});
