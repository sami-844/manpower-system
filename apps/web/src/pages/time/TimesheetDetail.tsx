/**
 * S-20 Timesheet detail: one site and period. Header with status and the approval trail
 * (entered → operations review → client sign-off → lock), per-worker per-day lines with their
 * evidence (the filed sheet scan), client disputes with the operations response, and
 * corrections. Locked lines are final: a correction is a new adjustment in the next period,
 * never an edit (CLAUDE.md rule 7). Four eyes: whoever entered the site's sheets cannot submit
 * it (TR-CLI-15).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftIcon, BanIcon, CheckIcon, FileTextIcon, LockIcon, MessageSquareWarningIcon, ScanIcon, SearchIcon, SendIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react";
import { daysBetween } from "@mms/core";
import { Page, PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { displayDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { dates, todayOman } from "@/demo/core";
import { clientById, siteById } from "@/demo/reference";
import {
  MARK_LABEL,
  addCorrection,
  clientContact,
  crewOf,
  getTimesheet,
  packStatus,
  lockTimesheet,
  personName,
  raiseDispute,
  respondDispute,
  scanMarks,
  submitTimesheet,
  timesheetId,
  totalHours,
  type DayCell,
  type Dispute,
  type Hours,
  type SiteDay,
  type TimesheetDetailData,
  type TimesheetRow,
} from "@/demo/time";
import { LoadError, PackBadge, PaperScan, ScanViewer, TimesheetBadge, dayLabel, fmtDateTime, fmtHours, fmtNumber, useTimeQuery } from "./shared";
import { RecordApprovalDialog } from "./record-approval";

const HOUR_TYPE: Record<keyof Hours, string> = { normal: "Normal", overtime: "Overtime", restDay: "Rest day", holiday: "Holiday" };

export function TimesheetDetail() {
  const { id = "" } = useParams();
  const q = useTimeQuery(["timesheet", id], (w) => getTimesheet(w, id));
  const [cell, setCell] = useState<{ w: number; d: number } | null>(null);
  const [scan, setScan] = useState<SiteDay | null>(null);

  if (q.loading)
    return (
      <Page>
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </Page>
    );
  if (!q.data)
    return (
      <Page>
        <LoadError error={q.error} />
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Timesheet not found</EmptyTitle>
            <EmptyDescription>There is no timesheet "{id}". It may belong to a site without a crew.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link to="/timesheets">Back to timesheets</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  const data = q.data;
  const t = data.sheet;
  const site = siteById(t.siteId)!;
  const client = clientById(t.clientId);

  return (
    <Page>
      <div className="flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit text-muted-foreground">
          <Link to="/timesheets">
            <ArrowLeftIcon data-icon="inline-start" className="rtl:rotate-180" />
            Timesheets
          </Link>
        </Button>
        <PageHeader
          screen="S-20"
          sample
          title={`${site.name} · ${t.period.label}`}
          description={`${client?.legalName} · contract ${t.contractRef} · client sign-off by signed pack, or auto-approval ${t.autoApproveDays} days after sending.`}
          meta={
            <>
              <TimesheetBadge status={t.status} />
              {t.packSentAt && <PackBadge status={packStatus(t)} />}
              <span className="text-xs text-muted-foreground tabular-nums">
                {t.workers} workers · {t.daysEntered} of {t.daysExpected} site-days entered
              </span>
            </>
          }
          actions={<Actions sheet={t} />}
        />
      </div>
      <LoadError error={q.error} />
      <Trail sheet={t} />
      <Totals totals={t.totals} />

      <Tabs defaultValue="lines">
        <TabsList>
          <TabsTrigger value="lines">Lines</TabsTrigger>
          <TabsTrigger value="disputes">
            Disputes{data.disputes.length > 0 && <span className="ms-1 tabular-nums text-muted-foreground">{data.disputes.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="corrections">
            Corrections{data.corrections.length > 0 && <span className="ms-1 tabular-nums text-muted-foreground">{data.corrections.length}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lines" className="mt-3">
          <LinesMatrix data={data} onCell={(w, d) => setCell({ w, d })} onScan={setScan} />
        </TabsContent>
        <TabsContent value="disputes" className="mt-3">
          <Disputes data={data} />
        </TabsContent>
        <TabsContent value="corrections" className="mt-3">
          <Corrections data={data} />
        </TabsContent>
      </Tabs>

      <LineDialog data={data} at={cell} onClose={() => setCell(null)} onScan={setScan} />
      <ScanDialog day={scan} workers={q.workers} onClose={() => setScan(null)} />
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------
function Actions({ sheet: t }: { sheet: TimesheetRow }) {
  const { account } = useSession();
  const me = account?.username ?? "";
  const qc = useQueryClient();
  const site = siteById(t.siteId)?.name;
  const hours = fmtNumber(totalHours(t.totals));
  const done = () => qc.invalidateQueries({ queryKey: ["time"] });
  const submit = useMutation({
    mutationFn: () => submitTimesheet(t.id, me),
    onSuccess: () => {
      void done();
      const c = clientContact(t.clientId);
      toast.success(`Submitted ${site} · ${t.period.label}`, { description: `Pack emailed to ${c?.name} (${c?.email}). Auto-approves in ${t.autoApproveDays} days unless signed or disputed.` });
    },
  });
  const lock = useMutation({
    mutationFn: () => lockTimesheet(t.id, me),
    onSuccess: () => (void done(), toast.success(`Locked ${site} · ${t.period.label}`, { description: `${hours} h are now final for payroll and billing.` })),
  });

  if (t.status === "draft") {
    const iEntered = t.enteredBy.includes(me);
    const missing = t.daysExpected - t.daysEntered;
    const open = t.period.end >= todayOman();
    const reason = iEntered
      ? `You entered sheets for ${site} in ${t.period.label}. Four eyes: another operations user must review and submit it (TR-CLI-15).`
      : open
        ? `${t.period.label} is still running. Submit after the period ends and every site-day is entered.`
        : missing > 0
          ? `${missing} site-day${missing === 1 ? " is" : "s are"} not entered yet.`
          : null;
    const button = (
      <Button disabled={!!reason || submit.isPending}>
        <SendIcon data-icon="inline-start" />
        Submit for client approval
      </Button>
    );
    return reason ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex flex-col items-end gap-1">
            {button}
            {iEntered && (
              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                <BanIcon aria-hidden className="size-3" /> You entered these sheets
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">{reason}</TooltipContent>
      </Tooltip>
    ) : (
      <ConfirmDialog
        trigger={button}
        title={`Submit ${site} · ${t.period.label}?`}
        description={
          <>
            <p>
              You are reviewing as {personName(me)}. The sheets were entered by {t.enteredBy.map(personName).join(", ")}.
            </p>
            <p>
              The pack ({hours} h, {t.workers} workers) is emailed to {clientContact(t.clientId)?.name}. It auto-approves after {t.autoApproveDays} days unless signed or disputed.
            </p>
          </>
        }
        confirmLabel={`Submit ${hours} h and email the pack`}
        onConfirm={() => submit.mutate()}
      />
    );
  }
  if (t.status === "submitted")
    return (
      <>
        <Button asChild variant="outline">
          <Link to="/timesheet-packs">
            <FileTextIcon data-icon="inline-start" />
            Open pack
          </Link>
        </Button>
        <RecordApprovalDialog
          sheet={t}
          trigger={
            <Button>
              <CheckIcon data-icon="inline-start" />
              Record signed approval
            </Button>
          }
        />
      </>
    );
  if (t.status === "client_approved")
    return (
      <ConfirmDialog
        trigger={
          <Button>
            <LockIcon data-icon="inline-start" />
            Lock timesheet
          </Button>
        }
        title={`Lock ${site} · ${t.period.label}?`}
        description={<p>Locked hours are final. Payroll and invoices read them, and any later change becomes an adjustment in the next period.</p>}
        confirmLabel={`Lock ${hours} h for ${t.workers} workers`}
        onConfirm={() => lock.mutate()}
      />
    );
  return null;
}

// ---------------------------------------------------------------------------------------------
function Trail({ sheet: t }: { sheet: TimesheetRow }) {
  const today = todayOman();
  const reviewed = !!t.reviewedBy;
  const approved = !!t.approval;
  const locked = t.status === "locked";
  const left = t.autoApproveOn ? daysBetween(today, t.autoApproveOn) : null;
  const steps: { title: string; state: "done" | "current" | "todo" | "blocked"; body: ReactNode }[] = [
    {
      title: "Sheets entered",
      state: t.daysEntered >= t.daysExpected && t.daysExpected > 0 ? "done" : "current",
      body: (
        <>
          {t.daysEntered} of {t.daysExpected} site-days{t.daysMissingScan ? `, ${t.daysMissingScan} without scan` : ""}
          <br />
          by {t.enteredBy.map(personName).join(", ") || "nobody yet"}
        </>
      ),
    },
    {
      title: "Operations review",
      state: reviewed ? "done" : t.status === "draft" && t.period.end < today ? "current" : "todo",
      body: reviewed ? (
        <>
          {personName(t.reviewedBy)}
          <br />
          submitted {t.submittedAt && fmtDateTime(t.submittedAt)}
        </>
      ) : (
        <>
          Someone other than
          <br />
          {t.enteredBy.map(personName).join(", ") || "the timekeeper"}
        </>
      ),
    },
    {
      title: "Client sign-off",
      state: approved ? "done" : t.status === "submitted" ? (t.openDisputes ? "blocked" : "current") : "todo",
      body: approved ? (
        t.approval!.method === "auto" ? (
          <>
            Auto-approved {displayDate(t.approval!.at.slice(0, 10))}
            <br />
            after {t.autoApproveDays} days ({t.contractRef})
          </>
        ) : (
          <>
            Signed pack {t.approval!.fileName}
            <br />
            recorded by {personName(t.approval!.by)}
          </>
        )
      ) : t.status === "submitted" ? (
        t.openDisputes ? (
          <>
            {t.openDisputes} disputed line{t.openDisputes === 1 ? "" : "s"}
            <br />
            auto-approval paused
          </>
        ) : (
          <>
            {clientContact(t.clientId)?.name}
            <br />
            auto-approves {left !== null && left <= 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}
          </>
        )
      ) : (
        <>Signed pack, or auto after {t.autoApproveDays} days</>
      ),
    },
    {
      title: "Locked",
      state: locked ? "done" : approved ? "current" : "todo",
      body: locked ? (
        <>
          {personName(t.lockedBy)}
          <br />
          {t.lockedAt && fmtDateTime(t.lockedAt)}
        </>
      ) : (
        <>Feeds payroll and invoices</>
      ),
    },
  ];
  return (
    <Card className="py-0">
      <CardContent className="p-0">
        <ol aria-label="Approval trail" className="grid divide-y sm:grid-cols-4 sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse">
          {steps.map((s, i) => (
            <li key={s.title} aria-current={s.state === "current" ? "step" : undefined} className={cn("flex gap-3 p-4", s.state === "current" && "bg-primary/5", s.state === "blocked" && "bg-destructive/5")}>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium tabular-nums",
                  s.state === "done" && "border-success bg-success text-success-foreground",
                  s.state === "current" && "border-primary text-primary",
                  s.state === "blocked" && "border-destructive text-destructive",
                  s.state === "todo" && "text-muted-foreground",
                )}
              >
                {s.state === "done" ? <CheckIcon aria-hidden className="size-3.5" /> : s.state === "blocked" ? <TriangleAlertIcon aria-hidden className="size-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">
                  {s.title}
                  <span className="sr-only"> ({s.state})</span>
                </p>
                <p className="text-xs text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function Totals({ totals }: { totals: Hours }) {
  const items: [string, number][] = [
    ["Normal", totals.normal],
    ["Overtime", totals.overtime],
    ["Rest day", totals.restDay],
    ["Holiday", totals.holiday],
    ["Total hours", totalHours(totals)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
      {items.map(([k, v], i) => (
        <div key={k} className={cn("bg-card px-4 py-3", i === 4 && "col-span-2 sm:col-span-1")}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className={cn("text-lg tabular-nums", i === 4 ? "font-semibold" : "font-medium")}>{fmtNumber(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------------------------
function cellText(c: DayCell): ReactNode {
  if (!c.line) return null;
  if (c.line.mark === "A" || c.line.mark === "S") return c.line.mark;
  const h = totalHours(c.hours);
  return c.line.mark === "L" ? `${h}L` : h;
}

function LinesMatrix({ data, onCell, onScan }: { data: TimesheetDetailData; onCell: (w: number, d: number) => void; onScan: (d: SiteDay) => void }) {
  const [filter, setFilter] = useState("");
  const today = todayOman();
  const disputed = useMemo(() => new Set(data.disputes.filter((d) => d.status !== "resolved").map((d) => `${d.workerCode}:${d.workDate}`)), [data.disputes]);
  const rows = data.workers.map((w, i) => ({ w, i })).filter(({ w }) => !filter || `${w.member.fullName} ${w.member.code}`.toLowerCase().includes(filter.toLowerCase()));
  const locked = data.sheet.status === "locked";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a worker…" aria-label="Find a worker" />
        </InputGroup>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Hours per day · A absent · S sick · L late</span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm ring-1 ring-destructive" /> flagged
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-warning/40" /> disputed
          </span>
          <span className="inline-flex items-center gap-1">
            <ScanIcon aria-hidden className="size-3" /> open the day's scan
          </span>
          {locked && (
            <span className="inline-flex items-center gap-1">
              <LockIcon aria-hidden className="size-3" /> locked: click a day to correct it in the next period
            </span>
          )}
        </p>
      </div>
      <div className="max-h-[calc(100svh-14rem)] overflow-auto rounded-lg border bg-card">
        <table aria-label={`Daily lines for ${siteById(data.sheet.siteId)?.name}, ${data.sheet.period.label}`} className="border-separate border-spacing-0 text-xs tabular-nums">
          <thead className="sticky top-0 z-20 bg-muted">
            <tr>
              <th scope="col" className="sticky start-0 z-10 min-w-56 border-b border-e bg-muted px-3 py-1.5 text-start font-medium text-muted-foreground">
                Worker
              </th>
              {data.days.map((d) => (
                <th key={d.date} scope="col" className={cn("w-9 min-w-9 border-b px-0.5 py-1 text-center font-medium", !d.workDay && "bg-muted-foreground/10 text-muted-foreground")}>
                  <div className="leading-none">{Number(d.date.slice(8))}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">{dayLabel(d.date).slice(0, 2)}</div>
                  {d.siteDay?.scan ? (
                    <button type="button" onClick={() => onScan(d.siteDay!)} aria-label={`Open scan for ${dayLabel(d.date)}`} className="mx-auto mt-0.5 grid size-5 place-items-center rounded text-muted-foreground hover:bg-background hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
                      <ScanIcon className="size-3" />
                    </button>
                  ) : d.siteDay && d.date < today ? (
                    <span title="No scan filed" className="mx-auto mt-0.5 grid size-5 place-items-center text-destructive">
                      <TriangleAlertIcon aria-label="No scan filed" className="size-3" />
                    </span>
                  ) : (
                    <span className="block h-5" />
                  )}
                </th>
              ))}
              {["Normal", "OT", "Rest", "Hol."].map((h) => (
                <th key={h} scope="col" className="border-b border-s px-2 text-end font-medium text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ w, i }) => (
              <tr key={w.member.code} className="group">
                <th scope="row" className="sticky start-0 z-10 border-b border-e bg-card px-3 py-1 text-start font-normal group-hover:bg-muted">
                  <div className="flex max-w-52 items-baseline gap-2">
                    <Link to={`/workers/${w.member.workerId}`} className="truncate text-sm hover:underline">
                      {w.member.fullName}
                    </Link>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{w.member.code}</span>
                  </div>
                </th>
                {w.days.map((c, d) => {
                  const day = data.days[d]!;
                  const text = cellText(c);
                  const isDisputed = disputed.has(`${w.member.code}:${c.date}`);
                  return (
                    <td key={c.date} className={cn("border-b p-0 text-center group-hover:bg-muted/60", !day.workDay && "bg-muted-foreground/10")}>
                      {c.line ? (
                        <button
                          type="button"
                          onClick={() => onCell(i, d)}
                          aria-label={`${w.member.fullName}, ${dayLabel(c.date)}: ${MARK_LABEL[c.line.mark]}, ${totalHours(c.hours)} hours${c.flags.length ? `, flagged: ${c.flags.map((f) => f.reason).join("; ")}` : ""}`}
                          className={cn(
                            "m-0.5 h-6 w-8 rounded text-xs hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring",
                            c.line.mark === "A" && "font-medium text-destructive",
                            (c.line.mark === "S" || c.line.mark === "L") && "text-warning-foreground dark:text-warning",
                            c.hours.overtime > 0 && "font-semibold text-primary",
                            c.flags.length > 0 && "ring-1 ring-destructive",
                            isDisputed && "bg-warning/40",
                          )}
                        >
                          {text}
                        </button>
                      ) : day.siteDay && c.date <= today ? (
                        <span className="text-muted-foreground/60" title="Not entered yet">
                          ·
                        </span>
                      ) : null}
                    </td>
                  );
                })}
                <td className="border-b border-s px-2 text-end">{fmtHours(w.totals.normal)}</td>
                <td className="border-b px-2 text-end">{fmtHours(w.totals.overtime)}</td>
                <td className="border-b px-2 text-end">{fmtHours(w.totals.restDay)}</td>
                <td className="border-b px-2 text-end">{fmtHours(w.totals.holiday)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={data.days.length + 5} className="h-24 text-center text-sm text-muted-foreground">
                  No worker matches “{filter}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function LineDialog({ data, at, onClose, onScan }: { data: TimesheetDetailData; at: { w: number; d: number } | null; onClose: () => void; onScan: (d: SiteDay) => void }) {
  const w = at ? data.workers[at.w] : undefined;
  const c = at ? w?.days[at.d] : undefined;
  const day = at ? data.days[at.d] : undefined;
  return (
    <Dialog open={!!(w && c?.line)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">{w && c?.line && day && <LineBody key={`${w.member.code}:${c.date}`} data={data} member={w.member} cell={c} siteDay={day.siteDay} onScan={onScan} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}

function LineBody({ data, member, cell: c, siteDay, onScan, onDone }: { data: TimesheetDetailData; member: TimesheetDetailData["workers"][number]["member"]; cell: DayCell; siteDay: SiteDay | null; onScan: (d: SiteDay) => void; onDone: () => void }) {
  const { account } = useSession();
  const me = account?.username ?? "";
  const qc = useQueryClient();
  const t = data.sheet;
  const locked = t.status === "locked";
  const nextStart = dates.addMonths(t.period.start, 1);
  const nextLabel = dates.monthName(nextStart);
  const [reason, setReason] = useState("");
  const [hourType, setHourType] = useState<keyof Hours>("overtime");
  const [delta, setDelta] = useState("1");
  const disputes = data.disputes.filter((d) => d.workerCode === member.code && d.workDate === c.date);
  const contact = clientContact(t.clientId);

  const dispute = useMutation({
    mutationFn: () => raiseDispute({ timesheetId: t.id, workerCode: member.code, workerName: member.fullName, workDate: c.date, raisedBy: contact?.name ?? "Client", reason }),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ["time"] }), toast.success("Dispute recorded", { description: `${member.fullName}, ${dayLabel(c.date)}. Auto-approval pauses until it is answered.` }), onDone()),
  });
  const correct = useMutation({
    mutationFn: () => addCorrection({ timesheetId: t.id, targetTimesheetId: timesheetId(t.siteId, nextStart), targetPeriod: nextLabel, workerCode: member.code, workerName: member.fullName, workDate: c.date, hourType, deltaHours: Number(delta), reason, by: me }),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ["time"] }), toast.success(`Adjustment added to ${nextLabel}`, { description: `${Number(delta) > 0 ? "+" : ""}${delta} h ${HOUR_TYPE[hourType].toLowerCase()} for ${member.fullName}. The locked line is unchanged.` }), onDone()),
  });
  const deltaOk = /^-?\d{1,2}(\.\d{1,2})?$/.test(delta) && Number(delta) !== 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {locked && <LockIcon aria-label="Locked" className="size-4 text-primary" />}
          {member.fullName} · {dayLabel(c.date)}
        </DialogTitle>
        <DialogDescription>
          <span className="font-mono">{member.code}</span> · {member.trade} · {MARK_LABEL[c.line!.mark]}
          {c.line!.remarks && ` · “${c.line!.remarks}”`}
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-4 gap-2 rounded-lg border p-3 text-center">
        {(Object.keys(HOUR_TYPE) as (keyof Hours)[]).map((k) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{HOUR_TYPE[k]}</dt>
            <dd className="font-medium tabular-nums">{fmtHours(c.hours[k])}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
        <span className="min-w-0">
          Evidence: office entry from sheet <span className="font-mono">{siteDay?.sheetNo}</span>
          {siteDay?.scan && `, scan filed ${fmtDateTime(siteDay.scan.filedAt)} via ${siteDay.scan.via}`}
          {siteDay?.entry && `, entered by ${personName(siteDay.entry.by)}`}
        </span>
        {siteDay?.scan && (
          <Button size="xs" variant="outline" onClick={() => onScan(siteDay)}>
            <ScanIcon data-icon="inline-start" />
            View scan
          </Button>
        )}
      </div>
      {c.flags.map((f) => (
        <p key={f.kind} className="flex items-start gap-2 text-xs text-destructive">
          <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
          {f.reason}
        </p>
      ))}
      {disputes.map((d) => (
        <p key={d.id} className="flex items-start gap-2 text-xs">
          <MessageSquareWarningIcon aria-hidden className="mt-px size-3.5 shrink-0 text-warning-foreground dark:text-warning" />
          <span>
            Disputed by {d.raisedBy}: “{d.reason}” <DisputeBadge status={d.status} />
          </span>
        </p>
      ))}

      {locked ? (
        <FieldGroup className="gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">This line is locked and stays as it is. A correction becomes an adjustment in {nextLabel}, never an edit.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="corr-type">Hour type</FieldLabel>
              <Select value={hourType} onValueChange={(v) => setHourType(v as keyof Hours)}>
                <SelectTrigger id="corr-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(HOUR_TYPE) as (keyof Hours)[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {HOUR_TYPE[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={!deltaOk || undefined}>
              <FieldLabel htmlFor="corr-delta">Hours (+/−)</FieldLabel>
              <Input id="corr-delta" inputMode="decimal" value={delta} onChange={(e) => setDelta(e.target.value)} aria-invalid={!deltaOk} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="corr-reason">Reason</FieldLabel>
            <Textarea id="corr-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What was wrong and the evidence for the change" />
          </Field>
          <DialogFooter>
            <Button disabled={!deltaOk || reason.trim().length < 5 || correct.isPending} onClick={() => correct.mutate()}>
              <Undo2Icon data-icon="inline-start" />
              Correct in next period ({nextLabel})
            </Button>
          </DialogFooter>
        </FieldGroup>
      ) : t.status === "submitted" ? (
        <FieldGroup className="gap-3 border-t pt-3">
          <Field>
            <FieldLabel htmlFor="dispute-reason">Client's reason ({contact?.name})</FieldLabel>
            <Textarea id="dispute-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Gate log shows the worker left at 14:00" />
          </Field>
          <DialogFooter>
            <Button variant="outline" disabled={reason.trim().length < 5 || dispute.isPending} onClick={() => dispute.mutate()}>
              <MessageSquareWarningIcon data-icon="inline-start" />
              Record client dispute on this line
            </Button>
          </DialogFooter>
        </FieldGroup>
      ) : t.status === "draft" ? (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Draft: change this line on{" "}
          <Link className="text-primary underline-offset-4 hover:underline" to={`/attendance?sd=${encodeURIComponent(`${t.siteId}:${c.date}`)}`}>
            attendance entry
          </Link>{" "}
          before the timesheet is submitted.
        </p>
      ) : (
        <p className="border-t pt-3 text-xs text-muted-foreground">Client approved. Lock the timesheet; later changes go to the next period as adjustments.</p>
      )}
    </>
  );
}

function DisputeBadge({ status }: { status: Dispute["status"] }) {
  return status === "open" ? <StatusBadge tone="expired">Open</StatusBadge> : status === "responded" ? <StatusBadge tone="due">Responded</StatusBadge> : <StatusBadge tone="ok">Resolved</StatusBadge>;
}

// ---------------------------------------------------------------------------------------------
function Disputes({ data }: { data: TimesheetDetailData }) {
  if (!data.disputes.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No disputes</EmptyTitle>
          <EmptyDescription>When the client queries a line (by email or on the signed pack), record it here from the line so operations can answer with evidence. Open a day cell on the Lines tab to record one.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <ul className="space-y-3">
      {data.disputes.map((d) => (
        <DisputeItem key={d.id} d={d} />
      ))}
    </ul>
  );
}

function DisputeItem({ d }: { d: Dispute }) {
  const { account } = useSession();
  const qc = useQueryClient();
  const [evidence, setEvidence] = useState("Signed sheet scan");
  const [response, setResponse] = useState("");
  const respond = useMutation({
    mutationFn: () => respondDispute(d.id, response, evidence, account?.username ?? ""),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ["time"] }), toast.success("Response sent to the client", { description: `${evidence} attached. The pack goes back to the client for sign-off.` })),
  });
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {d.workerName} <span className="font-mono text-xs font-normal text-muted-foreground">{d.workerCode}</span> · {dayLabel(d.workDate)}
          </p>
          <p className="text-xs text-muted-foreground">
            Raised by {d.raisedBy} (client) · {fmtDateTime(d.raisedAt)}
          </p>
        </div>
        <DisputeBadge status={d.status} />
      </div>
      <p className="mt-2 text-sm">“{d.reason}”</p>
      {d.response ? (
        <div className="mt-3 border-s-2 border-primary/40 ps-3 text-sm">
          <p>{d.response}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {personName(d.respondedBy)} · evidence: {d.evidence}
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
          <Field>
            <FieldLabel htmlFor={`ev-${d.id}`}>Evidence</FieldLabel>
            <Select value={evidence} onValueChange={setEvidence}>
              <SelectTrigger id={`ev-${d.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["Signed sheet scan", "Client gate log", "Supervisor statement"].map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`resp-${d.id}`}>Operations response</FieldLabel>
            <Input id={`resp-${d.id}`} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="e.g. Sheet signed by your site engineer shows 2 h overtime" />
          </Field>
          <Button disabled={response.trim().length < 5 || respond.isPending} onClick={() => respond.mutate()}>
            <SendIcon data-icon="inline-start" />
            Respond with evidence
          </Button>
        </div>
      )}
    </li>
  );
}

function Corrections({ data }: { data: TimesheetDetailData }) {
  const t = data.sheet;
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LockIcon aria-hidden className="size-3.5" />
        Locked lines are never edited. A correction is a new adjustment line in the next open period, with who, why and when.
      </p>
      {data.corrections.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No corrections</EmptyTitle>
            <EmptyDescription>{t.status === "locked" ? "To correct a locked line, open the day cell on the Lines tab and choose “Correct in next period”." : "Corrections apply once this timesheet is locked. Until then, change the line itself."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm" aria-label="Corrections">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr className="h-9">
                {["Worker", "Work date", "Hour type", "Hours", "Reason", "Recorded", "Direction"].map((h) => (
                  <th key={h} scope="col" className={cn("px-3 text-start font-medium", h === "Hours" && "text-end")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.corrections.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2">
                    {c.workerName} <span className="font-mono text-xs text-muted-foreground">{c.workerCode}</span>
                  </td>
                  <td className="px-3 whitespace-nowrap">{displayDate(c.workDate)}</td>
                  <td className="px-3">{HOUR_TYPE[c.hourType]}</td>
                  <td className="px-3 text-end font-medium tabular-nums">
                    {c.deltaHours > 0 ? "+" : ""}
                    {c.deltaHours}
                  </td>
                  <td className="max-w-80 px-3 text-xs">{c.reason}</td>
                  <td className="px-3 text-xs whitespace-nowrap text-muted-foreground">
                    {personName(c.by)} · {fmtDateTime(c.at)}
                  </td>
                  <td className="px-3 text-xs whitespace-nowrap">
                    {c.timesheetId === t.id ? (
                      <Link className="text-primary hover:underline" to={`/timesheets/${c.targetTimesheetId}`}>
                        Adjusts {c.targetPeriod} →
                      </Link>
                    ) : (
                      <Link className="text-primary hover:underline" to={`/timesheets/${c.timesheetId}`}>
                        From a locked earlier period
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
function ScanDialog({ day, workers, onClose }: { day: SiteDay | null; workers: Parameters<typeof crewOf>[0] | undefined; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const crew = day && workers ? crewOf(workers, day.siteId) : [];
  return (
    <Dialog open={!!day} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[88svh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-4 py-3 pe-12 text-start">
          <DialogTitle>
            {day && siteById(day.siteId)?.name} · {day && dayLabel(day.date)}
          </DialogTitle>
          <DialogDescription>Evidence for every line on this site-day · sheet {day?.sheetNo}</DialogDescription>
        </DialogHeader>
        {day && (
          <div className="min-h-0 flex-1 p-3">
            <ScanViewer className="h-full" zoom={zoom} setZoom={setZoom} title="Sample scan · supervisor's photo" meta={day.scan ? `Filed by QR ${fmtDateTime(day.scan.filedAt)} · ${day.scan.via}` : undefined}>
              <PaperScan crew={crew} marks={scanMarks(day.siteId, day.date, crew)} siteId={day.siteId} date={day.date} sheetNo={day.sheetNo} token={day.qrToken} zoom={zoom} />
            </ScanViewer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

