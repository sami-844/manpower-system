/**
 * Number Ticker (Design Brief "Aceternity UI: where it is allowed": owner dashboard headline
 * numbers only). Counts up once when the page loads, then sits still. With reduced
 * motion it renders the final value straight away. Screen readers only ever get the final text.
 *
 * `value` is a display number; money passes `finalText` (the exact decimal.js-formatted string),
 * so the last frame is always the exact amount, never a float (CLAUDE.md rule 2).
 */
import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function NumberTicker({
  value,
  format = (n) => Math.round(n).toLocaleString("en-GB"),
  finalText,
  duration = 1.1,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  finalText?: string;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const played = useRef(false);
  // Start at 0 so the first frame is not the final value flashing before the count.
  const [shown, setShown] = useState<number | null>(reduce ? null : 0);

  useEffect(() => {
    if (reduce || played.current) return;
    played.current = true;
    let completed = false;
    const controls = animate(0, value, {
      duration,
      ease: "easeOut",
      onUpdate: setShown,
      onComplete: () => {
        completed = true;
        setShown(null);
      },
    });
    return () => {
      controls.stop();
      // Interrupted (StrictMode remount, value arrived mid-count): let the next run play.
      if (!completed) played.current = false;
    };
  }, [reduce, value, duration]);

  const final = finalText ?? format(value);
  const animating = shown !== null && !reduce;
  return (
    <span className={cn("tabular-nums", className)}>
      <span aria-hidden>{animating ? format(shown) : final}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
