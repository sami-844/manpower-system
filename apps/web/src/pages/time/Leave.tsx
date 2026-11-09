/**
 * S-21 Leave (PRD §4.6/4.8): requests with travel and return dates, the approval chain
 * operations → HR (four eyes: the requester and the operations approver cannot also give the HR
 * approval), the overdue-return alert, balances per worker and the roster gap a leave leaves.
 * "New leave request" also records the leave on the real worker (POST /api/workers/:id/leave),
 * so eligibility checks see it. Entitlement days come from rule table leave.annual.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightIcon, CheckIcon, ChevronsUpDownIcon, PlaneIcon, PlusIcon, TriangleAlertIcon, UserRoundSearchIcon, XIcon } from "lucide-react";
import { addDays, daysBetween } from "@mms/core";
import { Page, PageHeader } from "@/components/page-header";
import { DataTable, createColumns } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, ApiError, type WorkerListItem } from "@/lib/api";
import { displayDate, statusLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { V1Role } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { todayOman } from "@/demo/core";
import { siteById } from "@/demo/reference";
import { siteOf } from "@/demo/workforce";
import { LEAVE_TYPE_LABEL, RULES, addLeaveRequest, decideLeave, getLeaveBalances, getLeaveRequests, leaveDays, personName, ruleSource, type LeaveBalance, type LeaveRequest, type LeaveType } from "@/demo/time";
import { LeaveBadge, LoadError, fmtNumber, useTimeQuery } from "./shared";

type Row = LeaveRequest & { overdue: boolean };
const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const shortDate = (d: string | null) => (d ? SHORT.format(new Date(`${d}T00:00:00Z`)) : "—");
/** "25 Nov – 9 Dec 2026" */
const shortRange = (a: string, b: string) => (a.slice(0, 4) === b.slice(0, 4) ? `${shortDate(a)} – ${displayDate(b)}` : `${displayDate(a)} – ${displayDate(b)}`);
const col = createColumns<Row>();
const bcol = createColumns<LeaveBalance>();

/** Who may give each approval (App Flow: operations, then HR). The owner can stand in for either. */
const STEP_ROLES: Record<"pending_ops" | "pending_hr", V1Role[]> = { pending_ops: ["ops_manager", "owner"], pending_hr: ["hr_pro", "owner"] };

function blockReason(l: LeaveRequest, me: string, role: V1Role | undefined): string | null {
  if (l.status !== "pending_ops" && l.status !== "pending_hr") return null;
  if (!role || !STEP_ROLES[l.status].includes(role)) return l.status === "pending_ops" ? "Operations approve first: they check the roster gap." : "HR gives the second approval: they check the balance and travel.";
  if (l.requestedBy === me) return "You raised this request. Someone else must approve it (four eyes).";
  if (l.status === "pending_hr" && l.opsBy === me) return "You gave the operations approval. HR approval must come from another person (four eyes).";
  return null;
}

export function Leave() {
  const { account } = useSession();
  const me = account?.username ?? "";
  const qc = useQueryClient();
  const q = useTimeQuery(["leave"], getLeaveRequests);
  const balances = useTimeQuery(["leave-balances"], getLeaveBalances);
  const [view, setView] = useState<"all" | "pending" | "away" | "overdue">("all");
  const [creating, setCreating] = useState(false);
  const today = todayOman();

  const workerById = useMemo(() => new Map((q.workers ?? []).map((w) => [w.id, w])), [q.workers]);
  const rows: Row[] = (q.data ?? []).map((l) => ({ ...l, overdue: l.status === "approved" && !!l.returnDate && l.returnDate <= today && workerById.get(l.workerId)?.status === "on_leave" }));
  const pending = rows.filter((r) => r.status === "pending_ops" || r.status === "pending_hr");
  const away = rows.filter((r) => r.status === "approved" && r.fromDate <= today && (r.toDate >= today || r.overdue));
  const overdue = rows.filter((r) => r.overdue);
  const returningSoon = away.filter((r) => !r.overdue && r.returnDate && daysBetween(today, r.returnDate) <= 7);
  const shown = view === "pending" ? pending : view === "away" ? away : view === "overdue" ? overdue : rows;

  const decide = useMutation({
    mutationFn: ({ l, approve }: { l: LeaveRequest; approve: boolean }) => decideLeave(l.id, me, approve),
    onSuccess: (_, { l, approve }) => {
      void qc.invalidateQueries({ queryKey: ["time", "leave"] });
      toast.success(approve ? (l.status === "pending_ops" ? `Operations approval given · ${l.workerName}` : `Leave approved · ${l.workerName}`) : `Leave rejected · ${l.workerName}`, {
        description: approve ? (l.status === "pending_ops" ? "Now with HR for the second approval." : `${LEAVE_TYPE_LABEL[l.type]} leave ${displayDate(l.fromDate)} – ${displayDate(l.toDate)}.`) : "The worker's supervisor is told.",
      });
    },
  });

  const columns = col.columns([
    col.accessor("workerName", {
      header: "Worker",
      cell: (c) => (
        <div className="min-w-0">
          <Link to={`/workers/${c.row.original.workerId}`} className="block truncate font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
            {c.getValue()}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{c.row.original.workerCode}</span>
          <span className="text-xs text-muted-foreground"> · {c.row.original.trade}</span>
        </div>
      ),
    }),
    col.accessor("type", { header: "Type", cell: (c) => LEAVE_TYPE_LABEL[c.getValue()] }),
    col.accessor("fromDate", {
      header: "Dates · travel",
      cell: (c) => {
        const r = c.row.original;
        return (
          <div className="whitespace-nowrap tabular-nums">
            {shortRange(r.fromDate, r.toDate)} <span className="text-xs text-muted-foreground">· {leaveDays(r)} d</span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <PlaneIcon aria-hidden className="size-3" />
              {r.travelDate ? `Flies ${shortDate(r.travelDate)}` : "No travel"} ·{" "}
              <span className={cn(r.overdue && "font-medium text-destructive")}>back {shortDate(r.returnDate)}</span>
            </div>
          </div>
        );
      },
    }),
    col.accessor("status", {
      header: "Status · approvals",
      cell: (c) => {
        const r = c.row.original;
        const step = (label: string, by: string | null, active: boolean) => (
          <span className={cn("inline-flex items-center gap-1", by ? "text-foreground" : active ? "font-medium text-warning-foreground dark:text-warning" : "text-muted-foreground")}>
            {by ? <CheckIcon aria-label="done" className="size-3 text-success" /> : <span aria-hidden className="size-1.5 rounded-full bg-current" />}
            {label}
            {by && <span className="text-muted-foreground">{personName(by).split(" ")[0]}</span>}
          </span>
        );
        return (
          <div className="space-y-1">
            {r.overdue ? <StatusBadge tone="expired">Overdue return</StatusBadge> : <LeaveBadge status={c.getValue()} />}
            {r.status !== "rejected" && (
              <div className="flex items-center gap-1.5 text-xs whitespace-nowrap" aria-label="Approval chain">
                {step("Ops", r.opsBy, r.status === "pending_ops")}
                <ArrowRightIcon aria-hidden className="size-3 text-muted-foreground rtl:rotate-180" />
                {step("HR", r.hrBy, r.status === "pending_hr")}
              </div>
            )}
          </div>
        );
      },
    }),
    col.display({
      id: "gap",
      header: "Roster",
      cell: ({ row }) => {
        const r = row.original;
        const site = r.siteId ? siteById(r.siteId) : null;
        if (!site || r.status === "rejected" || r.status === "returned" || r.toDate < today) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <Link to="/bench" onClick={(e) => e.stopPropagation()} className="group/gap flex items-start gap-1 text-xs">
            <UserRoundSearchIcon aria-hidden className="mt-px size-3.5 shrink-0 text-highlight-foreground dark:text-highlight" />
            <span>
              <span className="block group-hover/gap:underline">Needs a replacement</span>
              <span className="text-muted-foreground">at {site.name}</span>
            </span>
          </Link>
        );
      },
    }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const r = row.original;
        if (r.status !== "pending_ops" && r.status !== "pending_hr") return null;
        const why = blockReason(r, me, account?.role);
        const buttons = (
          <div className="flex justify-end gap-1">
            <Button size="xs" variant="ghost" disabled={!!why || decide.isPending} onClick={() => decide.mutate({ l: r, approve: false })} aria-label={`Reject leave for ${r.workerName}`} title="Reject">
              <XIcon />
            </Button>
            <Button size="xs" variant="outline" disabled={!!why || decide.isPending} onClick={() => decide.mutate({ l: r, approve: true })} aria-label={`${r.status === "pending_ops" ? "Operations" : "HR"} approval for ${r.workerName}`}>
              <CheckIcon data-icon="inline-start" />
              Approve
            </Button>
          </div>
        );
        return why ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="block">
                {buttons}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{why}</TooltipContent>
          </Tooltip>
        ) : (
          buttons
        );
      },
    }),
  ]);

  const bcolumns = bcol.columns([
    bcol.accessor("workerName", {
      header: "Worker",
      cell: (c) => (
        <div>
          <Link to={`/workers/${c.row.original.workerId}`} className="font-medium hover:underline">
            {c.getValue()}
          </Link>{" "}
          <span className="font-mono text-xs text-muted-foreground">{c.row.original.workerCode}</span>
        </div>
      ),
    }),
    bcol.accessor("status", { header: "Status", cell: (c) => <span className="text-muted-foreground">{statusLabel(c.getValue())}</span> }),
    bcol.accessor("entitlement", { header: () => <div className="text-end">Entitlement</div>, cell: (c) => <div className="text-end tabular-nums">{c.getValue()} d</div> }),
    bcol.accessor("carriedOver", { header: () => <div className="text-end">Carried over</div>, cell: (c) => <div className="text-end tabular-nums">{fmtNumber(c.getValue())}</div> }),
    bcol.accessor("accrued", { header: () => <div className="text-end">Accrued this year</div>, cell: (c) => <div className="text-end tabular-nums">{fmtNumber(c.getValue())}</div> }),
    bcol.accessor("taken", { header: () => <div className="text-end">Taken</div>, cell: (c) => <div className="text-end tabular-nums">{fmtNumber(c.getValue())}</div> }),
    bcol.accessor("booked", { header: () => <div className="text-end">Booked</div>, cell: (c) => <div className="text-end tabular-nums text-muted-foreground">{c.getValue() ? fmtNumber(c.getValue()) : "—"}</div> }),
    bcol.accessor("balance", { header: () => <div className="text-end">Balance</div>, cell: (c) => <div className={cn("text-end font-medium tabular-nums", c.getValue() < 0 && "text-destructive")}>{fmtNumber(c.getValue())} d</div> }),
  ]);

  return (
    <Page>
      <PageHeader
        screen="S-21"
        sample
        title="Leave"
        description="Leave requests with travel and return dates, approved by operations and then HR. Approved leave blocks the worker from the roster for those dates."
        actions={
          <Button onClick={() => setCreating(true)} disabled={!q.workers}>
            <PlusIcon data-icon="inline-start" />
            New leave request
          </Button>
        }
      />
      <LoadError error={q.error} />
      {overdue.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>
            {overdue.length} worker{overdue.length === 1 ? " is" : "s are"} past their return date
          </AlertTitle>
          <AlertDescription>
            <p>
              {overdue.slice(0, 4).map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ", "}
                  <Link to={`/workers/${r.workerId}`} className="font-medium underline underline-offset-4">
                    {r.workerName}
                  </Link>{" "}
                  (due {displayDate(r.returnDate)})
                </span>
              ))}
              {overdue.length > 4 && ` and ${overdue.length - 4} more`}. Contact them and their agent; after the grace period in the rule table, HR may need to report absence.
            </p>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="On leave now" value={q.loading ? "…" : away.length} hint="Approved leave in progress" />
        <KpiCard label="Awaiting approval" value={q.loading ? "…" : pending.length} hint={`${pending.filter((p) => p.status === "pending_ops").length} with operations · ${pending.filter((p) => p.status === "pending_hr").length} with HR`} />
        <KpiCard label="Returning in 7 days" value={q.loading ? "…" : returningSoon.length} hint="Plan their redeployment" />
        <KpiCard label="Overdue return" value={q.loading ? "…" : overdue.length} hint="Still away after the return date" className={overdue.length ? "border-destructive/30" : undefined} />
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
        </TabsList>
        <TabsContent value="requests" className="mt-3">
          <DataTable
            label="Leave requests"
            columns={columns}
            data={shown}
            loading={q.loading}
            getRowId={(r) => r.id}
            search={(r, s) => `${r.workerName} ${r.workerCode} ${r.trade} ${LEAVE_TYPE_LABEL[r.type]}`.toLowerCase().includes(s)}
            searchPlaceholder="Filter by worker, code or type…"
            toolbar={
              <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as typeof view)} aria-label="Show">
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                <ToggleGroupItem value="pending">Awaiting approval {pending.length > 0 && <span className="tabular-nums text-muted-foreground">{pending.length}</span>}</ToggleGroupItem>
                <ToggleGroupItem value="away">On leave</ToggleGroupItem>
                <ToggleGroupItem value="overdue">Overdue {overdue.length > 0 && <span className="tabular-nums text-destructive">{overdue.length}</span>}</ToggleGroupItem>
              </ToggleGroup>
            }
            empty={
              <span>
                No leave requests here.{" "}
                <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => setCreating(true)}>
                  New leave request
                </button>
              </span>
            }
          />
        </TabsContent>
        <TabsContent value="balances" className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Annual entitlement {RULES.annualLeave.value} days, accrued monthly · {ruleSource(RULES.annualLeave)}. Sick and emergency leave follow their own rule tables.
          </p>
          <DataTable label="Leave balances" columns={bcolumns} data={balances.data} loading={balances.loading} getRowId={(b) => b.workerId} search={(b, s) => `${b.workerName} ${b.workerCode}`.toLowerCase().includes(s)} searchPlaceholder="Find a worker…" empty="No workers." />
        </TabsContent>
      </Tabs>

      <NewLeaveSheet open={creating} onOpenChange={setCreating} workers={q.workers ?? []} balances={balances.data ?? []} me={me} />
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------
function NewLeaveSheet({ open, onOpenChange, workers, balances, me }: { open: boolean; onOpenChange: (o: boolean) => void; workers: WorkerListItem[]; balances: LeaveBalance[]; me: string }) {
  const qc = useQueryClient();
  const today = todayOman();
  const [worker, setWorker] = useState<WorkerListItem | null>(null);
  const [pick, setPick] = useState(false);
  const [type, setType] = useState<LeaveType>("annual");
  const [from, setFrom] = useState(addDays(today, 14));
  const [to, setTo] = useState(addDays(today, 43));
  const [travel, setTravel] = useState(addDays(today, 14));
  const [reason, setReason] = useState("");
  const site = worker ? siteOf(worker) : null;
  const balance = worker ? balances.find((b) => b.workerId === worker.id) : undefined;
  const days = from && to && to >= from ? daysBetween(from, to) + 1 : 0;

  const reset = () => (setWorker(null), setType("annual"), setFrom(addDays(today, 14)), setTo(addDays(today, 43)), setTravel(addDays(today, 14)), setReason(""));
  const create = useMutation({
    mutationFn: async () => {
      if (!worker) throw new Error("Choose a worker");
      // Real API: records the leave period on the worker (audited, used by eligibility checks).
      await api.post(`/api/workers/${worker.id}/leave`, { fromDate: from, toDate: to });
      await addLeaveRequest(workers, { workerId: worker.id, workerCode: worker.code, workerName: worker.fullName, trade: worker.trade, siteId: site?.id ?? null, type, fromDate: from, toDate: to, travelDate: type === "sick" ? null : travel || null, returnDate: addDays(to, 1), reason: reason || `${LEAVE_TYPE_LABEL[type]} leave`, requestedBy: me });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["time", "leave"] });
      void qc.invalidateQueries({ queryKey: ["workers"] });
      toast.success(`Leave requested for ${worker?.fullName}`, { description: `${days} days from ${displayDate(from)} · recorded on the worker file · awaiting operations approval.` });
      onOpenChange(false);
      reset();
    },
  });
  const issues = create.error instanceof ApiError ? create.error.issues : [];
  const issue = (p: string) => issues.find((i) => i.path === p)?.message;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>New leave request</SheetTitle>
          <SheetDescription>Goes to operations, then HR. The leave is recorded on the worker file straight away so the roster cannot assign them on those dates.</SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <FieldGroup className="min-h-0 flex-1 overflow-y-auto p-4">
            <Field>
              <FieldLabel htmlFor="leave-worker">Worker</FieldLabel>
              <Popover open={pick} onOpenChange={setPick}>
                <PopoverTrigger asChild>
                  <Button id="leave-worker" type="button" variant="outline" role="combobox" aria-expanded={pick} className="w-full justify-between font-normal">
                    {worker ? (
                      <span className="truncate">
                        {worker.fullName} <span className="font-mono text-xs text-muted-foreground">{worker.code}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Search by name or code…</span>
                    )}
                    <ChevronsUpDownIcon className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Name or W-code…" />
                    <CommandList>
                      <CommandEmpty>No worker found.</CommandEmpty>
                      <CommandGroup>
                        {workers
                          .filter((w) => w.status !== "exited")
                          .map((w) => (
                            <CommandItem
                              key={w.id}
                              value={`${w.fullName} ${w.code}`}
                              onSelect={() => {
                                setWorker(w);
                                setPick(false);
                              }}
                            >
                              <span className="min-w-0 flex-1 truncate">{w.fullName}</span>
                              <span className="font-mono text-xs text-muted-foreground">{w.code}</span>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {worker && (
                <FieldDescription>
                  {worker.trade} · {statusLabel(worker.status)}
                  {site && ` at ${site.name}`}
                  {balance && ` · annual balance ${fmtNumber(balance.balance)} days`}
                </FieldDescription>
              )}
            </Field>
            {worker && site && (
              <p className="flex items-start gap-2 rounded-md border border-highlight/40 bg-highlight/10 px-3 py-2 text-xs">
                <UserRoundSearchIcon aria-hidden className="mt-px size-3.5 shrink-0" />
                <span>
                  Needs a replacement at {site.name} from {displayDate(from)}.{" "}
                  <Link to="/bench" className="font-medium underline underline-offset-4">
                    Find one on the bench
                  </Link>
                </span>
              </p>
            )}
            <Field>
              <FieldLabel htmlFor="leave-type">Type</FieldLabel>
              <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
                <SelectTrigger id="leave-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {LEAVE_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {type === "annual" && <FieldDescription>Entitlement {RULES.annualLeave.value} days a year · {ruleSource(RULES.annualLeave)}</FieldDescription>}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!issue("fromDate") || undefined}>
                <FieldLabel htmlFor="leave-from">From</FieldLabel>
                <Input id="leave-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
                <FieldError>{issue("fromDate")}</FieldError>
              </Field>
              <Field data-invalid={!!issue("toDate") || (to < from) || undefined}>
                <FieldLabel htmlFor="leave-to">To</FieldLabel>
                <Input id="leave-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required aria-invalid={to < from} />
                <FieldError>{issue("toDate") ?? (to < from ? "Leave must end on or after it starts" : undefined)}</FieldError>
              </Field>
            </div>
            {type !== "sick" && (
              <Field>
                <FieldLabel htmlFor="leave-travel">Travel date (optional)</FieldLabel>
                <Input id="leave-travel" type="date" value={travel} onChange={(e) => setTravel(e.target.value)} />
                <FieldDescription>Flight out. Expected back at work {displayDate(to >= from ? addDays(to, 1) : null)}.</FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="leave-reason">Reason</FieldLabel>
              <Textarea id="leave-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Home leave, ticket booked by the company" />
            </Field>
            {create.error && !issues.length && <FieldError>{create.error instanceof Error ? create.error.message : "Could not save the request"}</FieldError>}
          </FieldGroup>
          <SheetFooter className="border-t">
            <Button type="submit" disabled={!worker || !days || create.isPending}>
              {worker && days ? `Request ${days} days for ${worker.fullName.split(" ")[0]}` : "Request leave"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
