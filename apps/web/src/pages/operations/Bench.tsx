/**
 * S-18 Bench (PRD 4.5: "who is idle, for how long, and what it costs per day").
 * REAL available workers from `/api/workers` (minus anyone assigned in this session), with their
 * real compliance state. Days idle and basic wage are demo facts; daily cost is basic wage ÷ 26.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { omr, roundBaisa, sumOmr } from "@mms/core";
import { ArrowRightIcon, SendIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { DataTable, createColumns } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { Money } from "@/components/money";
import { ComplianceBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WorkerListItem } from "@/lib/api";
import { benchOf, campOf, papersProblem, useAssignments, useRequests } from "@/demo/operations";
import { TRADES, clientById, siteById } from "@/demo/reference";
import { basicWage, daysIdle } from "@/demo/workforce";

/** Bench-rate target from the brief for this screen: under 5% of the active workforce. */
const TARGET_PCT = 5;

interface Row {
  w: WorkerListItem;
  idle: number;
  daily: string;
  camp: string;
}

const col = createColumns<Row>();

export function Bench() {
  const navigate = useNavigate();
  const asg = useAssignments();
  const requests = useRequests();
  const [trade, setTrade] = useState("all");
  const [proposing, setProposing] = useState<WorkerListItem | null>(null);

  const all = useMemo<Row[] | undefined>(() => {
    if (!asg.workers || !asg.data) return undefined;
    return benchOf(asg.workers, asg.data)
      .map((w) => ({ w, idle: daysIdle(w), daily: roundBaisa(omr(basicWage(w)).div(26)).toFixed(3), camp: campOf(w).name }))
      .sort((a, b) => b.idle - a.idle);
  }, [asg.workers, asg.data]);
  const rows = useMemo(() => (trade === "all" ? all : all?.filter((r) => r.w.trade === trade)), [all, trade]);

  const deployed = asg.workers?.filter((w) => w.status === "deployed").length ?? 0;
  const benchCount = all?.length ?? 0;
  const ratePct = benchCount + deployed ? (benchCount / (benchCount + deployed)) * 100 : 0;
  const dailyTotal = all ? sumOmr(all.map((r) => r.daily)).toFixed(3) : null;
  const ready = all?.filter((r) => r.w.compliance.state === "ok").length ?? 0;
  const avgIdle = all?.length ? Math.round(all.reduce((n, r) => n + r.idle, 0) / all.length) : 0;

  const columns = useMemo(
    () =>
      col.columns([
        col.display({
          id: "worker",
          header: "Worker",
          cell: ({ row }) => (
            <div className="flex flex-col">
              <Link to={`/workers/${row.original.w.id}`} className="font-medium underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
                {row.original.w.fullName}
              </Link>
              <span className="font-mono text-xs text-muted-foreground">
                {row.original.w.code} · {row.original.w.nationality}
              </span>
            </div>
          ),
        }),
        col.accessor((r) => r.w.trade, { id: "trade", header: "Trade" }),
        col.accessor("idle", {
          header: () => <div className="text-end">Days idle</div>,
          cell: (c) => <div className={cn("text-end tabular-nums", c.getValue() > 30 && "font-semibold text-destructive")}>{c.getValue()}</div>,
        }),
        col.display({ id: "papers", header: "Papers", cell: ({ row }) => <ComplianceBadge state={row.original.w.compliance.state} daysLeft={row.original.w.compliance.nextExpiry?.daysLeft} /> }),
        col.accessor("camp", { header: "Camp", cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span> }),
        col.accessor("daily", { header: () => <div className="text-end">Daily cost</div>, cell: (c) => <Money value={c.getValue()} /> }),
        col.display({
          id: "action",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <Button
              variant="outline"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                setProposing(row.original.w);
              }}
            >
              <SendIcon /> Propose for request
            </Button>
          ),
        }),
      ]),
    [],
  );

  return (
    <Page>
      <PageHeader screen="S-18" sample title="Bench" description="Available workers who are not on a site, how long they have waited and what they cost each day." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Workers on the bench" value={all ? benchCount : "—"} hint={all ? `${ready} with papers in order, ready to deploy` : undefined} />
        <KpiCard label="Daily bench cost" value={dailyTotal ? <Money align="start" value={dailyTotal} /> : "—"} hint="Basic wage ÷ 26, before allowances" />
        <KpiCard
          label="Bench rate"
          value={all ? `${ratePct.toFixed(1)}%` : "—"}
          trend={all ? { direction: ratePct > TARGET_PCT ? "up" : "down", text: `Target < ${TARGET_PCT}%`, good: ratePct <= TARGET_PCT } : undefined}
          hint="Bench as a share of deployed plus bench"
        />
        <KpiCard label="Average days idle" value={all ? avgIdle : "—"} hint={all ? `${all.filter((r) => r.idle > 30).length} idle more than 30 days` : undefined} />
      </div>

      <DataTable
        label="Bench"
        columns={columns}
        data={rows}
        loading={!rows}
        getRowId={(r) => r.w.id}
        pageSize={50}
        search={(r, q) => r.w.fullName.toLowerCase().includes(q) || r.w.code.toLowerCase().includes(q) || r.w.nationality.toLowerCase().includes(q)}
        searchPlaceholder="Filter by name, code or nationality…"
        onRowClick={(r) => navigate(`/workers/${r.w.id}`)}
        toolbar={
          <>
            <Select value={trade} onValueChange={setTrade}>
              <SelectTrigger className="w-44" aria-label="Trade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All trades</SelectItem>
                {TRADES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rows && dailyTotal && trade !== "all" && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {rows.length} {trade.toLowerCase()} · <Money className="inline" value={sumOmr(rows.map((r) => r.daily)).toFixed(3)} /> a day
              </span>
            )}
          </>
        }
        empty="Nobody is on the bench. Every available worker is assigned to a site."
      />

      <Dialog open={!!proposing} onOpenChange={(o) => !o && setProposing(null)}>
        <DialogContent className="sm:max-w-lg">
          {proposing && <Propose worker={proposing} requests={requests.data} onPick={(to) => navigate(to)} />}
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function Propose({ worker, requests, onPick }: { worker: WorkerListItem; requests: ReturnType<typeof useRequests>["data"]; onPick: (to: string) => void }) {
  const lines =
    requests?.flatMap((r) => (r.status === "open" || r.status === "partly_filled" ? r.lines.filter((l) => l.trade === worker.trade && l.filled < l.quantity).map((l) => ({ r, l })) : [])) ?? [];
  return (
    <>
      <DialogHeader>
        <DialogTitle>Propose {worker.fullName}</DialogTitle>
        <DialogDescription>
          Open requests that need a {worker.trade.toLowerCase()}. Choosing one opens matching with {worker.fullName.split(" ")[0]} picked; the compliance check runs before anything is saved.
        </DialogDescription>
      </DialogHeader>
      {lines.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No open request needs a {worker.trade.toLowerCase()} right now.
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <Link to="/requests?new=1">Enter a new request</Link>
            </Button>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map(({ r, l }) => {
            const papers = papersProblem(worker, l.endDate);
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onPick(`/requests/${r.id}/match?line=${l.id}&pick=${worker.id}`)}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-start transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {siteById(r.siteId)?.name} <span className="font-normal text-muted-foreground">· {clientById(r.clientId)?.legalName}</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {r.reference} · {l.quantity - l.filled} of {l.quantity} open · from {displayDate(l.startDate)}
                    </span>
                    {papers && <span className="text-xs text-destructive">{papers}: the check will block this</span>}
                  </div>
                  <ArrowRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
