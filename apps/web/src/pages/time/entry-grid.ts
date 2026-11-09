/**
 * S-40 attendance entry grid — the keyboard model as a pure reducer (TR-CLI-13: works entirely
 * from the keyboard). Columns: 0 status mark, 1 overtime hours, 2 remarks (edited in an input).
 *
 *   ↑ ↓ / Enter     move along the column (Enter moves down)
 *   ← →             change column
 *   P or Space      present (the roster default)    A absent · S sick · L late
 *   digits and "."  overtime hours for the row (from any column but remarks)
 *   Backspace       clear the cell back to the roster value
 */
import type { EntryLine, Mark } from "@/demo/time";

export const COLS = 3;
export interface GridState {
  lines: EntryLine[];
  row: number;
  col: number;
  /** Digits typed into the overtime cell since the cursor last moved. */
  buffer: string;
}
export type GridAction = { type: "move"; dRow: number; dCol: number } | { type: "goto"; row: number; col: number } | { type: "mark"; mark: Mark } | { type: "digit"; ch: string } | { type: "clear" } | { type: "remarks"; value: string } | { type: "reset"; lines: EntryLine[] };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const patch = (s: GridState, p: Partial<EntryLine>): EntryLine[] => s.lines.map((l, i) => (i === s.row ? { ...l, ...p } : l));

export function gridReducer(s: GridState, a: GridAction): GridState {
  const last = s.lines.length - 1;
  switch (a.type) {
    case "reset":
      return { lines: a.lines, row: 0, col: 0, buffer: "" };
    case "move":
      return { ...s, row: clamp(s.row + a.dRow, 0, last), col: clamp(s.col + a.dCol, 0, COLS - 1), buffer: "" };
    case "goto":
      return { ...s, row: clamp(a.row, 0, last), col: clamp(a.col, 0, COLS - 1), buffer: "" };
    case "mark": {
      // Absent and sick carry no hours, so their overtime goes too.
      const off = a.mark === "A" || a.mark === "S";
      return { ...s, lines: patch(s, off ? { mark: a.mark, ot: 0 } : { mark: a.mark }), col: 0, buffer: "" };
    }
    case "digit": {
      const buffer = s.buffer + a.ch;
      if (!/^\d{0,2}(\.\d{0,2})?$/.test(buffer)) return s;
      const ot = Number(buffer) || 0;
      if (ot > 24) return s;
      const line = s.lines[s.row];
      // Overtime on an absent/sick line makes it present again.
      const mark: Mark = line && (line.mark === "A" || line.mark === "S") && ot > 0 ? "P" : (line?.mark ?? "P");
      return { ...s, lines: patch(s, { ot, mark }), col: 1, buffer };
    }
    case "clear":
      return { ...s, lines: patch(s, s.col === 0 ? { mark: "P" } : s.col === 1 ? { ot: 0 } : { remarks: "" }), buffer: "" };
    case "remarks":
      return { ...s, lines: patch(s, { remarks: a.value }) };
  }
}

/** Map a key press on the grid to an action; null when the key is not the grid's. */
export function keyToAction(key: string, col: number): GridAction | null {
  switch (key) {
    case "ArrowDown":
    case "Enter":
      return { type: "move", dRow: 1, dCol: 0 };
    case "ArrowUp":
      return { type: "move", dRow: -1, dCol: 0 };
    case "ArrowLeft":
      return { type: "move", dRow: 0, dCol: -1 };
    case "ArrowRight":
      return { type: "move", dRow: 0, dCol: 1 };
    case "Backspace":
    case "Delete":
      return { type: "clear" };
  }
  if (col === 2) return null;
  const k = key.toUpperCase();
  if (k === "P" || key === " ") return { type: "mark", mark: "P" };
  if (k === "A" || k === "S" || k === "L") return { type: "mark", mark: k };
  if (/^[\d.]$/.test(key)) return { type: "digit", ch: key };
  return null;
}
