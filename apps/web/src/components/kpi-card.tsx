/**
 * Number card (Design Brief "Dashboards: row of four number cards"), adapted from the
 * dashboard-01 block's SectionCards. Tap-through via `to` (PRD 4.16: every number drills down).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRightIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  trend,
  footer,
  hint,
  to,
  className,
}: {
  label: string;
  value: ReactNode;
  /** e.g. { direction: "up", text: "+4.2%", good: true } */
  trend?: { direction: "up" | "down"; text: string; good: boolean };
  footer?: ReactNode;
  hint?: ReactNode;
  to?: string;
  className?: string;
}) {
  const body = (
    <Card className={cn("@container/card h-full gap-3 bg-gradient-to-t from-primary/[0.04] to-card shadow-xs transition-colors", to && "group-hover/kpi:border-primary/40", className)}>
      <CardHeader>
        <CardDescription className="flex items-center gap-1">
          {label}
          {to && <ArrowUpRightIcon aria-hidden className="size-3 opacity-0 transition-opacity group-hover/kpi:opacity-100" />}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        {trend && (
          <CardAction>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
                trend.good ? "border-success/25 bg-success/10 text-success" : "border-destructive/25 bg-destructive/10 text-destructive",
              )}
            >
              {trend.direction === "up" ? <TrendingUpIcon aria-hidden className="size-3" /> : <TrendingDownIcon aria-hidden className="size-3" />}
              {trend.text}
            </span>
          </CardAction>
        )}
      </CardHeader>
      {(footer || hint) && (
        <CardFooter className="flex-col items-start gap-1 text-sm">
          {footer && <div className="line-clamp-1 font-medium">{footer}</div>}
          {hint && <div className="text-muted-foreground">{hint}</div>}
        </CardFooter>
      )}
    </Card>
  );
  return to ? (
    <Link to={to} className="group/kpi block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
