/**
 * S-02 Today: the office user's work queue (App Flow "front doors": office roles open on Today).
 * Numbers and urgent renewals are LIVE (`/api/dashboard/summary`, `/api/compliance/renewals`);
 * the role queue mixes live counts with demo tasks from modules whose API comes later.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { documentLabel } from "@mms/core";
import { ArrowRightIcon, CheckCheckIcon, ChevronRightIcon, ListTodoIcon, TriangleAlertIcon } from "lucide-react";
import { api, type DashboardSummary, type RenewalItem } from "@/lib/api";
import { describeExpiry, displayDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { todayOman } from "@/demo/core";
import { fetchApprovals, queueFor, type QueueKind } from "@/demo/insight";
import { Page, PageHeader, SampleDataBadge } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { createColumns, DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LONG_DATE = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const KIND_ICON: Record<QueueKind, typeof ListTodoIcon> = { task: ListTodoIcon, approval: CheckCheckIcon, alert: TriangleAlertIcon };
const KIND_STYLE: Record<QueueKind, string> = {
  task: "bg-primary/10 text-primary",
  approval: "bg-highlight/15 text-highlight-foreground dark:text-highlight",
  alert: "bg-destructive/10 text-destructive",
};

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Muscat" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export function Today() {
  const { account } = useSession();
  const summary = useQuery({ queryKey: ["summary"], queryFn: () => api.get<DashboardSummary>("/api/dashboard/summary") });
  const renewals = useQuery({ queryKey: ["renewals"], queryFn: () => api.get<{ items: RenewalItem[] }>("/api/compliance/renewals") });
  const approvals = useQuery({ queryKey: ["approvals"], queryFn: fetchApprovals });

  const s = summary.data;
  const today = s?.today ?? todayOman();
  const urgent = renewals.data?.items.filter((r) => r.daysLeft <= 30) ?? [];
  const queue = queueFor(account?.role ?? "hr_pro", s, approvals.data?.pending.length ?? 0);
  const firstName = account?.displayName.split(" ")[0];
  const deployed = s?.byStatus.deployed ?? 0;
  const available = s?.byStatus.available ?? 0;

  return (
    <Page>
      <PageHeader
        screen="S-02"
        title={`Today, ${LONG_DATE.format(new Date(`${today}T00:00:00Z`))}`}
        description={`${greeting()}${firstName ? `, ${firstName}` : ""}. ${queue.length} things need you today, most urgent first.`}
      />

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Headcount" to="/workers" value={s ? s.headcount.toLocaleString("en-GB") : <Skeleton className="h-8 w-16" />} hint="Workers on the books today" />
        <KpiCard
          label="Deployed"
          to="/roster"
          value={s ? deployed.toLocaleString("en-GB") : <Skeleton className="h-8 w-16" />}
          hint={s ? `${available} available on the bench` : "On client sites"}
        />
        <KpiCard
          label="Expiring in 30 days"
          to="/renewals"
          value={s ? s.expiringIn30Days.toLocaleString("en-GB") : <Skeleton className="h-8 w-16" />}
          hint="Documents to renew now"
        />
        <KpiCard
          label="Expired papers"
          to="/workers?compliance=expired"
          value={s ? s.byCompliance.expired.toLocaleString("en-GB") : <Skeleton className="h-8 w-16" />}
          hint="Cannot be deployed or paid"
        />
      </section>
      {summary.isError && <p className="text-sm text-destructive">Couldn't load today's numbers. Check the API is running, then refresh.</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Needs your action <SampleDataBadge />
            </CardTitle>
            <CardDescription>Tasks, approvals and alerts for your role. Each opens the screen that fixes it.</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            <ItemGroup className="gap-1">
              {queue.map((q) => {
                const Icon = KIND_ICON[q.kind];
                return (
                  <Item key={q.id} asChild size="sm">
                    <Link to={q.to}>
                      <ItemMedia className={cn("size-8 rounded-md", KIND_STYLE[q.kind])}>
                        <Icon aria-hidden className="size-4" />
                      </ItemMedia>
                      <ItemContent className="min-w-0">
                        <ItemTitle>{q.title}</ItemTitle>
                        <ItemDescription className="line-clamp-2">{q.detail}</ItemDescription>
                      </ItemContent>
                      <ItemActions className="max-sm:hidden">
                        <StatusBadge tone={q.badge.tone}>{q.badge.text}</StatusBadge>
                        <ChevronRightIcon aria-hidden className="size-4 text-muted-foreground rtl:rotate-180" />
                      </ItemActions>
                    </Link>
                  </Item>
                );
              })}
            </ItemGroup>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle>Urgent renewals</CardTitle>
            <CardDescription>
              {renewals.data
                ? urgent.length === 0
                  ? "Nothing expires in the next 30 days."
                  : `${urgent.length} documents expire within 30 days or have already expired.`
                : "Documents expiring within 30 days."}
            </CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link to="/renewals">
                  All renewals <ArrowRightIcon aria-hidden className="rtl:rotate-180" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {renewals.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Couldn't load renewals. Check the API is running, then refresh.
              </p>
            ) : (
              <RenewalTable items={urgent} label="Urgent renewals" loading={renewals.isPending} pageSize={8} />
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

function renewalBadge(r: Pick<RenewalItem, "state" | "daysLeft">): StatusTone {
  if (r.state === "expired" || r.daysLeft < 0) return "expired";
  return r.daysLeft <= 30 ? "due" : "info";
}

const col = createColumns<RenewalItem>();
const renewalColumns = col.columns([
  col.accessor("workerName", {
    header: "Worker",
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <Link to={`/workers/${row.original.workerId}`} className="truncate font-medium hover:underline focus-visible:underline" onClick={(e) => e.stopPropagation()}>
          {row.original.workerName}
        </Link>
        <span className="font-mono text-xs text-muted-foreground">{row.original.workerCode}</span>
      </div>
    ),
  }),
  col.accessor("type", { header: "Document", cell: (c) => documentLabel(c.getValue()) }),
  col.accessor("expiryDate", { header: "Expiry", cell: (c) => <span className="tabular-nums">{displayDate(c.getValue())}</span> }),
  col.accessor("daysLeft", {
    header: "Status",
    cell: ({ row }) => <StatusBadge tone={renewalBadge(row.original)}>{describeExpiry(row.original.daysLeft)}</StatusBadge>,
  }),
]);

/** Renewal list shared with S-09 Renewals. Each worker name links to the worker file. */
export function RenewalTable({ items, label, loading = false, pageSize = 25 }: { items: RenewalItem[]; label: string; loading?: boolean; pageSize?: number }) {
  return (
    <DataTable
      label={label}
      columns={renewalColumns}
      data={items}
      loading={loading}
      getRowId={(r) => r.id}
      pageSize={pageSize}
      search={(r, q) => r.workerName.toLowerCase().includes(q) || r.workerCode.toLowerCase().includes(q)}
      searchPlaceholder="Filter by worker or code…"
      empty="Nothing expires in the next 30 days."
    />
  );
}
