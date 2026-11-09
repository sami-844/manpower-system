/**
 * Money on screen (Design Brief "Do and don't"): right-aligned, tabular figures, OMR with three
 * decimals. Amounts are strings end to end ("123.450") and formatted by `@mms/core` (decimal.js),
 * never a JavaScript number (CLAUDE.md rule 2).
 */
import { formatOmr, omr } from "@mms/core";
import { cn } from "@/lib/utils";

/** "OMR 1,234.500" — or "1,234.500" with `bare`. */
export function formatMoney(value: string, { bare = false } = {}): string {
  const s = formatOmr(omr(value));
  return bare ? s.replace("OMR ", "") : s;
}

export function Money({ value, bare = false, className, align = "end" }: { value: string; bare?: boolean; className?: string; align?: "start" | "end" }) {
  const negative = value.trim().startsWith("-");
  return (
    <span className={cn("block tabular-nums whitespace-nowrap", align === "end" ? "text-end" : "text-start", negative && "text-destructive", className)}>
      {formatMoney(value, { bare })}
    </span>
  );
}
