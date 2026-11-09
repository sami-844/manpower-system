/**
 * S-41 Client timesheet packs (TR-CLI-15, App Flow step 6): the emailed PDF pack per client, site
 * and period, its signature status, the contract's auto-approve countdown, chasing late ones and
 * recording the signed copy (the file is required evidence).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRingIcon, FileCheck2Icon, MailIcon, PenLineIcon, TimerIcon } from "lucide-react";
import { daysBetween } from "@mms/core";
import { Page, PageHeader } from "@/components/page-header";
import { DataTable, createColumns } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { displayDate } from "@/lib/format";
import { todayOman } from "@/demo/core";
import { clientById, siteById } from "@/demo/reference";
import { chaseTimesheet, clientContact, getTimesheets, packStatus, periods, resendPack, totalHours, type PackStatus, type TimesheetRow } from "@/demo/time";
import { LoadError, PackBadge, fmtNumber, fmtTime, useTimeQuery } from "./shared";
import { RecordApprovalDialog } from "./record-approval";

type Row = TimesheetRow & { pack: PackStatus };
const col = createColumns<Row>();
const OPEN: PackStatus[] = ["sent", "awaiting", "late"];

export function TimesheetPacks() {
  const qc = useQueryClient();
  const q = useTimeQuery(["timesheets"], getTimesheets);
  const [view, setView] = useState<"all" | "open" | "late" | "approved">("all");
  const current = periods()[0]!.start;
  // Packs exist for closed periods; the running month has none yet.
  const rows: Row[] = (q.data ?? []).filter((t) => t.period.start !== current).map((t) => ({ ...t, pack: packStatus(t) }));
  const shown = rows.filter((r) => view === "all" || (view === "open" ? OPEN.includes(r.pack) : view === "late" ? r.pack === "late" : r.pack === "signed" || r.pack === "auto_approved"));
  const done = () => qc.invalidateQueries({ queryKey: ["time"] });

  const email = useMutation({
    mutationFn: (t: Row) => resendPack(t.id),
    onSuccess: (_, t) => {
      void done();
      const c = clientContact(t.clientId);
      toast.success(`Pack emailed to ${c?.name}`, { description: `${c?.email} · PDF with summary and daily lines, ${t.workers} workers, ${fmtNumber(totalHours(t.totals))} h` });
    },
  });
  const chase = useMutation({
    mutationFn: (t: Row) => chaseTimesheet(t.id),
    onSuccess: (_, t) => {
      void done();
      const c = clientContact(t.clientId);
      toast.success(`Reminder sent to ${c?.name}`, { description: `${siteById(t.siteId)?.name} · ${t.period.label}${t.pack === "late" ? " · asks them to close the disputed lines" : ""}` });
    },
  });

  const columns = col.columns([
    col.accessor("siteId", {
      header: "Pack",
      cell: (c) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{siteById(c.getValue())?.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {clientById(c.row.original.clientId)?.legalName} · {clientContact(c.row.original.clientId)?.name}
          </div>
        </div>
      ),
    }),
    col.accessor((r) => r.period.start, {
      id: "period",
      header: "Period",
      cell: (c) => (
        <div className="whitespace-nowrap">
          <Link to={`/timesheets/${c.row.original.id}`} className="hover:underline">
            {c.row.original.period.label}
          </Link>
          <div className="text-xs text-muted-foreground tabular-nums">{c.row.original.packSentAt ? `Sent ${displayDate(c.row.original.packSentAt.slice(0, 10))}` : "Not sent"}</div>
        </div>
      ),
    }),
    col.accessor("pack", { header: "Status", cell: (c) => <PackBadge status={c.getValue()} /> }),
    col.display({
      id: "auto",
      header: "Auto-approve",
      cell: ({ row }) => {
        const r = row.original;
        if (r.pack === "late") return <span className="text-xs font-medium text-destructive">Paused: {r.openDisputes} disputed line{r.openDisputes === 1 ? "" : "s"}</span>;
        if (r.pack === "auto_approved") return <span className="text-xs text-muted-foreground">Approved by the {r.autoApproveDays}-day rule</span>;
        if (!r.autoApproveOn) return <span className="text-xs text-muted-foreground">{r.pack === "not_sent" ? "Starts when sent" : "—"}</span>;
        const left = daysBetween(todayOman(), r.autoApproveOn);
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-flex items-center gap-1 text-xs whitespace-nowrap tabular-nums">
                <TimerIcon aria-hidden className="size-3.5 text-muted-foreground" />
                {left <= 0 ? "Today" : left === 1 ? "Tomorrow" : `In ${left} days`} · {displayDate(r.autoApproveOn)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Contract {r.contractRef}: unsigned packs auto-approve {r.autoApproveDays} days after sending, unless a line is disputed.
            </TooltipContent>
          </Tooltip>
        );
      },
    }),
    col.display({
      id: "evidence",
      header: "Evidence",
      cell: ({ row }) => {
        const a = row.original.approval;
        if (!a) return <span className="text-xs text-muted-foreground">—</span>;
        return a.method === "signed_pack" ? (
          <span className="inline-flex max-w-36 items-center gap-1 text-xs" title={a.fileName ?? undefined}>
            <FileCheck2Icon aria-hidden className="size-3.5 shrink-0 text-success" />
            <span className="truncate">{a.fileName}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Contract rule (no file)</span>
        );
      },
    }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const r = row.original;
        if (r.pack === "not_sent")
          return (
            <div className="flex justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button size="xs" variant="outline" disabled>
                      <MailIcon data-icon="inline-start" />
                      Email pack
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">The timesheet has not been reviewed and submitted by operations yet. Submitting it emails the pack.</TooltipContent>
              </Tooltip>
            </div>
          );
        if (!OPEN.includes(r.pack)) return null;
        return (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {r.chasedAt ? (
              <span className="self-center px-1 text-xs whitespace-nowrap text-muted-foreground">Chased {fmtTime(r.chasedAt)}</span>
            ) : (
              <Button size="xs" variant={r.pack === "late" ? "destructive" : "ghost"} onClick={() => chase.mutate(r)}>
                <BellRingIcon data-icon="inline-start" />
                Chase
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" variant="ghost" onClick={() => email.mutate(r)} aria-label={`Email the ${siteById(r.siteId)?.name} pack again`}>
                  <MailIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Email the pack again</TooltipContent>
            </Tooltip>
            <RecordApprovalDialog
              sheet={r}
              trigger={
                <Button size="xs" variant="outline">
                  <PenLineIcon data-icon="inline-start" />
                  Record signed
                </Button>
              }
            />
          </div>
        );
      },
    }),
  ]);

  const count = (s: PackStatus[]) => rows.filter((r) => s.includes(r.pack)).length;
  const approved = count(["signed", "auto_approved"]);
  return (
    <Page>
      <PageHeader
        screen="S-41"
        sample
        title="Client timesheet packs"
        description="Each submitted timesheet goes to the client as a PDF pack (summary and daily lines). Record the signed copy when it comes back; unsigned packs auto-approve after the contract's agreed days unless a line is disputed."
      />
      <LoadError error={q.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Awaiting signature" value={q.loading ? "…" : count(["sent", "awaiting"])} hint="Auto-approve countdown running" />
        <KpiCard label="Late" value={q.loading ? "…" : count(["late"])} hint="Disputed, auto-approval paused" className={count(["late"]) ? "border-destructive/30" : undefined} />
        <KpiCard label="Signed" value={q.loading ? "…" : count(["signed"])} hint="Signed copy filed as evidence" />
        <KpiCard label="Auto-approved" value={q.loading ? "…" : `${count(["auto_approved"])} of ${approved}`} hint="Approved by the contract rule" />
      </div>
      <DataTable
        label="Client timesheet packs"
        columns={columns}
        data={shown}
        loading={q.loading}
        getRowId={(r) => r.id}
        search={(r, s) => `${clientById(r.clientId)?.legalName} ${siteById(r.siteId)?.name} ${r.period.label} ${clientContact(r.clientId)?.name}`.toLowerCase().includes(s)}
        searchPlaceholder="Filter by client, site or period…"
        toolbar={
          <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as typeof view)} aria-label="Pack status">
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="open">Open {count(OPEN) > 0 && <span className="tabular-nums text-muted-foreground">{count(OPEN)}</span>}</ToggleGroupItem>
            <ToggleGroupItem value="late">Late {count(["late"]) > 0 && <span className="tabular-nums text-destructive">{count(["late"])}</span>}</ToggleGroupItem>
            <ToggleGroupItem value="approved">Approved</ToggleGroupItem>
          </ToggleGroup>
        }
        empty="No packs here. A pack is emailed when operations submit a site's timesheet for the period."
      />
    </Page>
  );
}
