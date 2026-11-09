/**
 * S-19 Timesheets: status by site and period (draft → submitted → client approved → locked),
 * hours by type, and the approvals still missing with a Chase action (PRD §4.6, App Flow steps 5–7).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRingIcon, CheckIcon, ClockIcon, TriangleAlertIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { DataTable, createColumns } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { todayOman } from "@/demo/core";
import { clientById, siteById } from "@/demo/reference";
import { chaseTimesheet, clientContact, getTimesheets, packStatus, periods, personName, staffedSites, totalHours, TIMESHEET_STATUS_LABEL, type TimesheetRow, type TimesheetStatus } from "@/demo/time";
import { LoadError, TimesheetBadge, fmtHours, fmtNumber, fmtTime, useTimeQuery } from "./shared";
import { daysBetween } from "@mms/core";
import { displayDate } from "@/lib/format";

const col = createColumns<TimesheetRow>();
const num = (v: number, strong = false) => <div className={`text-end tabular-nums ${strong ? "font-medium" : ""}`}>{fmtHours(v)}</div>;
const head = (t: string) => () => <div className="text-end">{t}</div>;

/** What is holding this timesheet up, if anything. */
export function nextStep(t: TimesheetRow): { text: string; chase: "ops" | "client" | null; tone: "warn" | "muted" | "bad" } {
  const today = todayOman();
  if (t.status === "locked") return { text: `Locked ${displayDate(t.lockedAt?.slice(0, 10))} · feeds payroll and billing`, chase: null, tone: "muted" };
  if (t.status === "client_approved") return { text: t.approval?.method === "auto" ? `Auto-approved after ${t.autoApproveDays} days · ready to lock` : "Signed pack recorded · ready to lock", chase: null, tone: "muted" };
  if (t.status === "submitted") {
    if (packStatus(t) === "late") return { text: `Late: ${t.openDisputes} disputed line${t.openDisputes === 1 ? "" : "s"}, auto-approval paused`, chase: "client", tone: "bad" };
    const left = t.autoApproveOn ? daysBetween(today, t.autoApproveOn) : null;
    return { text: `Awaiting ${clientById(t.clientId)?.legalName}${left !== null ? ` · auto-approves ${left <= 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}` : ""}`, chase: "client", tone: "warn" };
  }
  if (t.period.end < today) return { text: `Operations review missing · not by ${t.enteredBy.map(personName).join(", ")}`, chase: "ops", tone: "bad" };
  return { text: `In progress · ${t.daysEntered} of ${t.daysExpected} site-days entered`, chase: null, tone: "muted" };
}

export function Timesheets() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useTimeQuery(["timesheets"], getTimesheets);
  const [period, setPeriod] = useState("all");
  const [site, setSite] = useState("all");
  const [status, setStatus] = useState<"all" | "attention" | TimesheetStatus>("all");

  const chase = useMutation({
    mutationFn: (t: TimesheetRow) => chaseTimesheet(t.id),
    onSuccess: (_, t) => {
      void qc.invalidateQueries({ queryKey: ["time"] });
      const s = siteById(t.siteId)?.name;
      if (nextStep(t).chase === "client") {
        const c = clientContact(t.clientId);
        toast.success(`Reminder emailed to ${c?.name ?? "the client"}`, { description: `${s} · ${t.period.label} pack, ${c?.email ?? ""}` });
      } else toast.success("Reminder sent to operations", { description: `Review and submit ${s} · ${t.period.label}. The person who entered the sheets cannot do it.` });
    },
  });

  const rows = q.data ?? [];
  const filtered = useMemo(
    () =>
      rows.filter(
        (t) =>
          (period === "all" || t.period.start === period) &&
          (site === "all" || t.siteId === site) &&
          (status === "all" || (status === "attention" ? nextStep(t).chase !== null : t.status === status)),
      ),
    [rows, period, site, status],
  );
  const current = periods()[0]!;
  const last = periods()[1]!;
  const attention = rows.filter((t) => nextStep(t).chase !== null);
  const thisMonth = rows.filter((t) => t.period.start === current.start);
  const lastMonth = rows.filter((t) => t.period.start === last.start);

  const columns = col.columns([
    col.accessor("siteId", {
      header: "Site",
      cell: (c) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{siteById(c.getValue())?.name}</div>
          <div className="truncate text-xs text-muted-foreground">{clientById(c.row.original.clientId)?.legalName}</div>
        </div>
      ),
    }),
    col.accessor((t) => t.period.start, { id: "period", header: "Period", cell: (c) => (
        <div className="whitespace-nowrap">
          {c.row.original.period.label}
          <div className="text-xs text-muted-foreground tabular-nums">{c.row.original.workers} workers</div>
        </div>
      ),
    }),
    col.accessor("status", { header: "Status", cell: (c) => <TimesheetBadge status={c.getValue()} /> }),
    col.accessor((t) => t.totals.normal, { id: "normal", header: head("Normal"), cell: (c) => num(c.getValue()) }),
    col.accessor((t) => t.totals.overtime, { id: "ot", header: head("OT"), cell: (c) => num(c.getValue()) }),
    col.accessor((t) => t.totals.restDay, { id: "rest", header: head("Rest day"), cell: (c) => num(c.getValue()) }),
    col.accessor((t) => t.totals.holiday, { id: "holiday", header: head("Holiday"), cell: (c) => num(c.getValue()) }),
    col.accessor((t) => totalHours(t.totals), { id: "total", header: head("Total h"), cell: (c) => num(c.getValue(), true) }),
    col.display({
      id: "next",
      header: "Next step",
      cell: ({ row }) => {
        const t = row.original;
        const n = nextStep(t);
        return (
          <div className="flex items-center justify-between gap-2">
            <span className={`flex min-w-0 items-center gap-1.5 text-xs ${n.tone === "bad" ? "font-medium text-destructive" : n.tone === "warn" ? "text-warning-foreground dark:text-warning" : "text-muted-foreground"}`}>
              {n.tone === "bad" ? <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" /> : n.tone === "warn" ? <ClockIcon aria-hidden className="size-3.5 shrink-0" /> : <CheckIcon aria-hidden className="size-3.5 shrink-0" />}
              <span className="max-w-60 truncate" title={n.text}>{n.text}</span>
            </span>
            {n.chase &&
              (t.chasedAt ? (
                <span className="shrink-0 text-xs text-muted-foreground">Chased {fmtTime(t.chasedAt)}</span>
              ) : (
                <Button
                  size="xs"
                  variant="outline"
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    chase.mutate(t);
                  }}
                >
                  <BellRingIcon data-icon="inline-start" />
                  Chase
                </Button>
              ))}
          </div>
        );
      },
    }),
  ]);

  return (
    <Page>
      <PageHeader
        screen="S-19"
        sample
        title="Timesheets"
        description="One timesheet per site and month, built from the entered daily sheets. Operations review it (not the person who entered it), the client signs the pack, then it locks for payroll and billing."
      />
      <LoadError error={q.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={`Hours so far · ${current.label}`} value={q.loading ? "…" : fmtNumber(thisMonth.reduce((s, t) => s + totalHours(t.totals), 0))} hint={`${thisMonth.reduce((s, t) => s + t.daysEntered, 0)} of ${thisMonth.reduce((s, t) => s + t.daysExpected, 0)} site-days entered`} />
        <KpiCard label="Awaiting client" value={q.loading ? "…" : rows.filter((t) => t.status === "submitted").length} hint="Signed pack or contract auto-approval" />
        <KpiCard label="Need chasing" value={q.loading ? "…" : attention.length} hint="Review missing, client late or awaiting" className={attention.length ? "border-warning/40" : undefined} />
        <KpiCard label={`Locked · ${last.label}`} value={q.loading ? "…" : `${lastMonth.filter((t) => t.status === "locked").length} of ${lastMonth.length}`} hint="Locked hours feed payroll and invoices" />
      </div>
      <DataTable
        label="Timesheets by site and period"
        columns={columns}
        data={filtered}
        loading={q.loading}
        getRowId={(t) => t.id}
        onRowClick={(t) => navigate(`/timesheets/${t.id}`)}
        search={(t, s) => `${siteById(t.siteId)?.name} ${clientById(t.clientId)?.legalName} ${t.period.label}`.toLowerCase().includes(s)}
        searchPlaceholder="Filter by site or client…"
        toolbar={
          <>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger size="sm" className="w-40" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All periods</SelectItem>
                {periods().map((p) => (
                  <SelectItem key={p.start} value={p.start}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={site} onValueChange={setSite}>
              <SelectTrigger size="sm" className="w-48" aria-label="Site">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {(q.workers ? staffedSites(q.workers) : []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup type="single" variant="outline" size="sm" value={status} onValueChange={(v) => v && setStatus(v as typeof status)} aria-label="Status">
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="attention">Needs chasing {attention.length > 0 && <span className="tabular-nums text-destructive">{attention.length}</span>}</ToggleGroupItem>
              {(Object.keys(TIMESHEET_STATUS_LABEL) as TimesheetStatus[]).map((s) => (
                <ToggleGroupItem key={s} value={s} className="max-lg:hidden">
                  {TIMESHEET_STATUS_LABEL[s]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        }
        empty="No timesheets match these filters. Timesheets appear once a site's daily sheets are entered."
      />
    </Page>
  );
}
