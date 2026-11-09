/**
 * The status system (Design Brief "Status system"): one badge, the same everywhere a record
 * appears. Colour is never the only signal — every badge has an icon and a word.
 *
 * `tone` picks the look; `children` is the word, which should come from the API (or the demo
 * layer standing in for it) so the same word appears on every screen and in reports.
 * The `tag` class is kept so the first slice's e2e journeys still find status words.
 */
import type { ComponentType } from "react";
import { BanIcon, CheckIcon, CircleDashedIcon, ClockIcon, LockIcon, PencilIcon, SendIcon, TriangleAlertIcon, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "ok" | "due" | "expired" | "blocked" | "incomplete" | "draft" | "locked" | "released" | "info";

const TONES: Record<StatusTone, { icon: ComponentType<LucideProps>; className: string }> = {
  ok: { icon: CheckIcon, className: "bg-success/12 text-success border-success/25 dark:bg-success/15" },
  due: { icon: ClockIcon, className: "bg-warning/18 text-warning-foreground border-warning/40 dark:text-warning dark:bg-warning/12" },
  expired: { icon: TriangleAlertIcon, className: "bg-destructive/10 text-destructive border-destructive/25 dark:bg-destructive/15" },
  blocked: { icon: BanIcon, className: "bg-transparent text-destructive border-destructive" },
  incomplete: { icon: CircleDashedIcon, className: "bg-muted text-muted-foreground border-border border-dashed" },
  draft: { icon: PencilIcon, className: "bg-secondary text-secondary-foreground border-border" },
  locked: { icon: LockIcon, className: "bg-primary/10 text-primary border-primary/25 dark:bg-primary/15" },
  released: { icon: SendIcon, className: "bg-success/12 text-success border-success/25 dark:bg-success/15" },
  info: { icon: ClockIcon, className: "bg-primary/8 text-primary border-primary/20" },
};

export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: React.ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <span
      data-tone={tone}
      className={cn(
        "tag inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        toneClass,
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {children}
    </span>
  );
}

/** Worker compliance state → badge (words match the first slice: "In order", "Renewal due", "Expired", "Papers missing"). */
export function ComplianceBadge({ state, daysLeft }: { state: "ok" | "due" | "expired" | "incomplete"; daysLeft?: number | null }) {
  switch (state) {
    case "ok":
      return <StatusBadge tone="ok">In order</StatusBadge>;
    case "due":
      // Within 30 days the brief treats a renewal as urgent; still "due", never colour alone.
      return <StatusBadge tone={daysLeft != null && daysLeft <= 30 ? "expired" : "due"}>Renewal due</StatusBadge>;
    case "expired":
      return <StatusBadge tone="expired">Expired</StatusBadge>;
    case "incomplete":
      return <StatusBadge tone="incomplete">Papers missing</StatusBadge>;
  }
}
