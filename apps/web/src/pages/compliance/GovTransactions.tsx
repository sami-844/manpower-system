/**
 * S-10 Government transactions (PRD 4.3 "Government transaction tracker": status, reference,
 * fees, and who is waiting on whom). Sample data (`src/demo/compliance.ts`) on REAL workers until
 * the `gov_transactions` API arrives; changes made here last for the session.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { documentLabel } from "@mms/core";
import { Building2Icon, CheckIcon, LandmarkIcon, MoreHorizontalIcon, PlusIcon, SendIcon, UserRoundIcon, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { displayDate, userLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { money, todayOman } from "@/demo/core";
import { daysBetween } from "@mms/core";
import {
  createGovTransaction,
  GOV_QUERY_KEY,
  GOV_STATUS_LABELS,
  GOV_TYPE_LABELS,
  GOV_TYPES,
  listGovTransactions,
  updateGovTransaction,
  WAITING_LABELS,
  type GovStatus,
  type GovTransaction,
  type GovType,
  type WaitingOn,
} from "@/demo/compliance";
import { useWorkforce } from "@/demo/workforce";
import { Page, PageHeader } from "@/components/page-header";
import { createColumns, DataTable } from "@/components/data-table";
import { formatMoney, Money } from "@/components/money";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { NativeSelect, WorkerPicker } from "../workforce/shared";

const STATUS_TONE: Record<GovStatus, StatusTone> = { draft: "draft", submitted: "info", in_review: "due", approved: "ok", rejected: "expired", completed: "released" };
const WAITING: Record<WaitingOn, { icon: LucideIcon; who: string; className: string }> = {
  company: { icon: Building2Icon, who: "Waiting on us", className: "border-highlight/40 bg-highlight/10 text-highlight-foreground dark:text-highlight" },
  ministry: { icon: LandmarkIcon, who: "Waiting on the ministry", className: "border-primary/25 bg-primary/8 text-primary" },
  worker: { icon: UserRoundIcon, who: "Waiting on the worker", className: "border-border bg-muted text-foreground" },
};
const VIEWS = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
] as const;
const isOpen = (t: GovTransaction) => t.status !== "completed" && t.status !== "rejected";

function WaitingPill({ t, today }: { t: GovTransaction; today: string }) {
  if (!t.waitingOn) return <span className="text-xs text-muted-foreground">—</span>;
  const w = WAITING[t.waitingOn];
  const days = t.waitingSince ? daysBetween(t.waitingSince, today) : 0;
  return (
    <div className="leading-tight">
      <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold", w.className)}>
        <w.icon aria-hidden className="size-3.5" />
        {WAITING_LABELS[t.waitingOn]}
        <span className="font-normal tabular-nums opacity-80">· {days === 0 ? "today" : `${days}d`}</span>
      </span>
      <div className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground" title={t.note}>
        {t.note}
      </div>
    </div>
  );
}

export function GovTransactions() {
  const qc = useQueryClient();
  const workforce = useWorkforce();
  const today = todayOman();
  const [view, setView] = useState<(typeof VIEWS)[number]["value"]>("open");
  const [waiting, setWaiting] = useState<Set<WaitingOn>>(new Set());
  const q = useQuery({ queryKey: GOV_QUERY_KEY, queryFn: () => listGovTransactions(workforce.data ?? []), enabled: !!workforce.data });

  const change = useMutation({
    mutationFn: ({ id, ...c }: { id: string; waitingOn?: WaitingOn; status?: GovStatus }) => updateGovTransaction(id, c),
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: GOV_QUERY_KEY });
      if (t) toast.success(`${t.reference ?? GOV_TYPE_LABELS[t.type]} updated`, { description: t.waitingOn ? `${WAITING[t.waitingOn].who}: ${t.note}` : GOV_STATUS_LABELS[t.status] });
    },
  });

  const all = q.data ?? [];
  const open = all.filter(isOpen);
  const stats = (["company", "ministry", "worker"] as const).map((k) => {
    const list = open.filter((t) => t.waitingOn === k);
    const oldest = Math.max(0, ...list.map((t) => (t.waitingSince ? daysBetween(t.waitingSince, today) : 0)));
    return { key: k, count: list.length, oldest };
  });
  const rows = useMemo(
    () =>
      (q.data ?? [])
        .filter((t) => (view === "all" ? true : view === "open" ? isOpen(t) : !isOpen(t)))
        .filter((t) => waiting.size === 0 || (t.waitingOn !== null && waiting.has(t.waitingOn))),
    [q.data, view, waiting],
  );
  const fees = money.sum(rows.map((r) => r.fees));

  const toggle = (k: WaitingOn) =>
    setWaiting((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const col = createColumns<GovTransaction>();
  const columns = col.columns([
    col.accessor("reference", {
      header: "Reference",
      cell: (c) => (c.getValue() ? <span className="font-mono text-xs">{c.getValue()}</span> : <span className="text-xs text-muted-foreground italic">Not submitted</span>),
    }),
    col.accessor("workerName", {
      header: "Worker",
      cell: ({ row }) => (
        <div className="leading-tight">
          <Link to={`/workers/${row.original.workerId}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
            {row.original.workerName}
          </Link>
          <div className="font-mono text-xs text-muted-foreground">{row.original.workerCode}</div>
        </div>
      ),
    }),
    col.accessor("type", {
      header: "Application",
      cell: ({ row }) => (
        <div className="leading-tight">
          <div>{GOV_TYPE_LABELS[row.original.type]}</div>
          {row.original.documentType && <div className="text-xs text-muted-foreground">Renews {documentLabel(row.original.documentType).toLowerCase()}</div>}
        </div>
      ),
    }),
    col.accessor("status", { header: "Status", cell: (c) => <StatusBadge tone={STATUS_TONE[c.getValue()]}>{GOV_STATUS_LABELS[c.getValue()]}</StatusBadge> }),
    col.accessor((t) => t.waitingOn ?? "", { id: "waiting", header: "Waiting on", cell: ({ row }) => <WaitingPill t={row.original} today={today} /> }),
    col.accessor("fees", { header: () => <div className="text-end">Fees</div>, cell: (c) => <Money value={c.getValue()} /> }),
    col.accessor("submittedOn", { header: "Submitted", cell: (c) => <span className="tabular-nums">{displayDate(c.getValue())}</span> }),
    col.accessor("completedOn", { header: "Closed", cell: (c) => <span className="tabular-nums">{displayDate(c.getValue())}</span> }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const t = row.original;
        if (!isOpen(t)) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label={`Update ${t.reference ?? GOV_TYPE_LABELS[t.type]} for ${t.workerName}`}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {t.status === "draft" && (
                <>
                  <DropdownMenuItem onSelect={() => change.mutate({ id: t.id, status: "submitted" })}>
                    <SendIcon aria-hidden />
                    Mark submitted
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel className="text-xs text-muted-foreground">Now waiting on</DropdownMenuLabel>
              {(["company", "ministry", "worker"] as const).map((k) => {
                const Icon = WAITING[k].icon;
                return (
                  <DropdownMenuItem key={k} disabled={t.waitingOn === k} onSelect={() => change.mutate({ id: t.id, waitingOn: k })}>
                    <Icon aria-hidden />
                    {WAITING_LABELS[k]}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => change.mutate({ id: t.id, status: "completed" })}>
                <CheckIcon aria-hidden />
                Mark completed
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => change.mutate({ id: t.id, status: "rejected" })}>
                Record rejection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ]);

  return (
    <Page>
      <PageHeader
        screen="S-10"
        sample
        title="Government transactions"
        description="Every visa, labour card, transfer, cancellation and clearance application, with its reference, fees and who has the ball right now."
        actions={<NewApplication workers={workforce.data} />}
      />

      <section aria-labelledby="waiting-h" className="space-y-2">
        <h2 id="waiting-h" className="text-sm font-medium text-muted-foreground">
          Who is waiting on whom · {open.length} open
        </h2>
        <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Filter by who the application is waiting on">
          {stats.map((s) => {
            const w = WAITING[s.key];
            const pressed = waiting.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={pressed}
                onClick={() => toggle(s.key)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-card p-3 text-start shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                  pressed && "border-primary ring-1 ring-primary",
                )}
              >
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg border", w.className)}>
                  <w.icon aria-hidden className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{w.who}</span>
                  <span className="block text-xs text-muted-foreground">{s.count ? `Oldest waiting ${s.oldest} ${s.oldest === 1 ? "day" : "days"}` : "Nothing waiting"}</span>
                </span>
                <span className="text-2xl font-semibold tabular-nums">{q.isPending ? "…" : s.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <DataTable
        label="Government transactions"
        columns={columns}
        data={rows}
        loading={q.isPending}
        getRowId={(t) => t.id}
        search={(t, s) => t.workerName.toLowerCase().includes(s) || t.workerCode.toLowerCase().includes(s) || (t.reference ?? "").toLowerCase().includes(s)}
        searchPlaceholder="Search worker or reference"
        toolbar={
          <>
            <div className="inline-flex rounded-lg border bg-muted p-0.5" role="group" aria-label="Show">
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  aria-pressed={view === v.value}
                  onClick={() => setView(v.value)}
                  className={cn("h-7 rounded-md px-3 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50", view === v.value && "bg-background text-foreground shadow-sm")}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {waiting.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setWaiting(new Set())}>
                Clear “waiting on”
              </Button>
            )}
            <span className="ms-auto text-sm text-muted-foreground">
              {rows.length} applications · fees <span className="font-medium text-foreground tabular-nums">{formatMoney(fees)}</span>
            </span>
          </>
        }
        empty="No applications match. Start one from Renewals, or with “New application”."
      />
    </Page>
  );
}

function NewApplication({ workers }: { workers: ReturnType<typeof useWorkforce>["data"] }) {
  const qc = useQueryClient();
  const { account } = useSession();
  const [open, setOpen] = useState(false);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [type, setType] = useState<GovType>("visa_renewal");
  const create = useMutation({
    mutationFn: () => {
      const w = workers!.find((x) => x.id === workerId)!;
      return createGovTransaction({ worker: w, type, createdBy: account?.username ?? "hr.officer", allWorkers: workers ?? [] });
    },
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: GOV_QUERY_KEY });
      toast.success(`${GOV_TYPE_LABELS[t.type]} drafted for ${t.workerName}`, { description: `Created by ${userLabel(t.createdBy)}. Waiting on the company.` });
      setOpen(false);
      setWorkerId(null);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden />
          New application
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New application</DialogTitle>
          <DialogDescription>Starts as a draft waiting on the company. Add the ministry reference when you submit it.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="ga-worker">Worker</Label>
            <WorkerPicker id="ga-worker" workers={workers} loading={!workers} value={workerId} onChange={(w) => setWorkerId(w.id)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ga-type">Application</Label>
            <NativeSelect id="ga-type" value={type} onChange={(e) => setType(e.target.value as GovType)}>
              {GOV_TYPES.map((t) => (
                <option key={t} value={t}>
                  {GOV_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!workerId || create.isPending} onClick={() => create.mutate()}>
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
