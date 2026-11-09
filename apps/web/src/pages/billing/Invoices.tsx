/**
 * S-28 Invoices (App Flow "invoice to cash collected", PRD 4.8, Technical Spec 4.4).
 * Generate drafts from locked timesheets, fix exceptions (an unmatched rate blocks its invoice),
 * then issue with a typed confirm. Issued invoices are locked; corrections are credit notes.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BanIcon, CheckCircle2Icon, FileTextIcon, PauseCircleIcon, SparklesIcon, WrenchIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { createColumns, DataTable } from "@/components/data-table";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { formatMoney, Money } from "@/components/money";
import { KpiCard } from "@/components/kpi-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/lib/session";
import { displayDate } from "@/lib/format";
import { dates, money, todayOman } from "@/demo/core";
import { CLIENTS } from "@/demo/reference";
import {
  billingKeys,
  generateInvoices,
  holdLine,
  isGenerated,
  issueInvoices,
  listExceptions,
  listHeldLines,
  listInvoices,
  read,
  useDemoMutation,
  vatCodeOn,
  vatRef,
  type InvoiceRow,
  type InvoiceView,
} from "@/demo/billing";
import { cn } from "@/lib/utils";

export const INVOICE_VIEW: Record<InvoiceView, { tone: StatusTone; label: string }> = {
  draft: { tone: "draft", label: "Draft" },
  blocked: { tone: "blocked", label: "Blocked" },
  issued: { tone: "info", label: "Issued" },
  part_paid: { tone: "due", label: "Part paid" },
  paid: { tone: "ok", label: "Paid" },
  disputed: { tone: "blocked", label: "Disputed" },
  written_off: { tone: "incomplete", label: "Written off" },
  overdue: { tone: "expired", label: "Overdue" },
};
export function InvoiceStatusBadge({ view }: { view: InvoiceView }) {
  return <StatusBadge tone={INVOICE_VIEW[view].tone}>{INVOICE_VIEW[view].label}</StatusBadge>;
}
/** KPI money: small "OMR" so big figures fit a quarter-width card without wrapping. */
export function KpiMoney({ value }: { value: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="me-1 text-sm font-medium text-muted-foreground">OMR</span>
      {formatMoney(value, { bare: true })}
    </span>
  );
}
export const shortMonth = (d: string) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 7)}-01T00:00:00Z`));

/** The period the next run bills: the month before today. */
const RUN_MONTH = dates.addMonths(dates.monthStart(todayOman()), -1);
const RUN_NAME = dates.monthName(RUN_MONTH);

const TABS = [
  { key: "all", label: "All", match: () => true },
  { key: "draft", label: "Draft", match: (r: InvoiceRow) => r.status === "draft" },
  { key: "issued", label: "Issued", match: (r: InvoiceRow) => r.status === "issued" || r.status === "part_paid" },
  { key: "overdue", label: "Overdue", match: (r: InvoiceRow) => r.view === "overdue" },
  { key: "disputed", label: "Disputed", match: (r: InvoiceRow) => r.status === "disputed" },
  { key: "paid", label: "Paid", match: (r: InvoiceRow) => r.status === "paid" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const EMPTY: Record<TabKey, string> = {
  all: "No invoices yet. Generate the month's invoices from locked timesheets.",
  draft: `No drafts. Generate invoices for ${RUN_NAME} to create them from locked timesheets.`,
  issued: "Nothing issued and unpaid for this filter.",
  overdue: "No overdue invoices. Everything issued is within its payment terms.",
  disputed: "No disputed invoices.",
  paid: "No paid invoices for this filter yet.",
};

const col = createColumns<InvoiceRow>();
const columns = col.columns([
  col.accessor("number", {
    header: "Number",
    cell: (c) => (c.getValue() ? <span className="font-medium tabular-nums">{c.getValue()}</span> : <span className="text-muted-foreground italic">Draft</span>),
  }),
  col.accessor("clientName", { header: "Client", cell: (c) => <span title={c.getValue()} className="block max-w-32 truncate">{c.getValue()}</span> }),
  col.accessor("siteName", {
    header: "Site · contract",
    cell: ({ row }) => (
      <div className="max-w-36 leading-tight">
        <div title={row.original.siteName} className="truncate">{row.original.siteName}</div>
        <div className="text-xs text-muted-foreground tabular-nums">{row.original.contractRef}</div>
      </div>
    ),
  }),
  col.accessor("periodStart", { header: "Period", cell: (c) => <span className="whitespace-nowrap">{shortMonth(c.getValue())}</span> }),
  col.accessor("subtotal", { header: () => <div className="text-end">Subtotal</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
  col.accessor("vat", { header: () => <div className="text-end">VAT</div>, cell: (c) => <Money value={c.getValue()} bare className="text-muted-foreground" /> }),
  col.accessor("total", { header: () => <div className="text-end">Total</div>, cell: (c) => <Money value={c.getValue()} bare className="font-medium" /> }),
  col.accessor("dueDate", { header: "Due", cell: (c) => <span className="whitespace-nowrap tabular-nums">{c.getValue() ? displayDate(c.getValue()) : <span className="text-muted-foreground">On issue</span>}</span> }),
  col.accessor("view", { header: "Status", cell: (c) => <InvoiceStatusBadge view={c.getValue()} /> }),
  col.accessor("balance", {
    header: () => <div className="text-end">Balance</div>,
    cell: ({ row }) => <Money value={row.original.balance} bare className={cn(row.original.status === "paid" && "text-muted-foreground")} />,
  }),
]);

export function Invoices() {
  const { account } = useSession();
  const me = account?.username ?? "finance.lead";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const client = params.get("client") ?? "all";
  const [tab, setTab] = useState<TabKey>("all");
  const [generating, setGenerating] = useState(false);
  const today = todayOman();

  const q = useQuery({ queryKey: billingKeys.invoices, queryFn: () => read(() => ({ rows: listInvoices(today), generated: isGenerated(RUN_MONTH) })) });
  const ex = useQuery({ queryKey: billingKeys.exceptions, queryFn: () => read(() => ({ exceptions: listExceptions(), held: listHeldLines() })) });

  const forClient = useMemo(() => (q.data?.rows ?? []).filter((r) => client === "all" || r.clientId === client), [q.data, client]);
  const rows = useMemo(() => forClient.filter(TABS.find((t) => t.key === tab)!.match), [forClient, tab]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, forClient.filter(t.match).length])) as Record<TabKey, number>, [forClient]);

  const open = forClient.filter((r) => r.status !== "draft" && r.status !== "paid");
  const overdue = forClient.filter((r) => r.view === "overdue");
  const drafts = forClient.filter((r) => r.status === "draft");
  const lastIssued = forClient.find((r) => r.issuedOn)?.periodStart;
  const billedLast = forClient.filter((r) => r.issuedOn && r.periodStart === lastIssued);

  const issue = useDemoMutation(
    (ids: string[]) => issueInvoices(ids, me),
    (r) => {
      const range = r.numbers.length > 1 ? `${r.numbers[0]} to ${r.numbers.at(-1)}` : r.numbers[0];
      toast.success(`${r.count} invoice${r.count > 1 ? "s" : ""} issued and locked`, { description: `${range} · ${formatMoney(r.total)} · PDFs emailed to each client.` });
    },
  );

  const clientName = CLIENTS.find((c) => c.id === client)?.legalName;
  return (
    <Page>
      <PageHeader
        screen="S-28"
        sample
        title="Invoices"
        description="Invoices come from the same locked timesheets as payroll: hours × the contract's rate card, plus fixed charges and VAT. A line with no matching rate blocks its invoice; nothing is skipped silently."
        actions={
          q.data?.generated ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant="outline" disabled>
                    <CheckCircle2Icon /> {RUN_NAME} generated
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Each period is generated once. Review the drafts below.</TooltipContent>
            </Tooltip>
          ) : (
            <Button onClick={() => setGenerating(true)} disabled={!q.data}>
              <SparklesIcon /> Generate invoices for {RUN_NAME}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={lastIssued ? `Billed for ${dates.monthName(lastIssued)}` : "Billed last period"} value={<KpiMoney value={money.sum(billedLast.map((r) => r.total))} />} hint={`${billedLast.length} invoices incl. VAT`} />
        <KpiCard label="Open balance" value={<KpiMoney value={money.sum(open.map((r) => r.balance))} />} hint={`${open.length} issued invoices not fully paid`} to="/receivables" />
        <KpiCard label="Overdue" value={<KpiMoney value={money.sum(overdue.map((r) => r.balance))} />} hint={`${overdue.length} past their due date`} to="/receivables" />
        <KpiCard label="Drafts to issue" value={String(drafts.length)} hint={drafts.length ? `${drafts.filter((d) => d.view === "blocked").length} blocked by an unmatched rate` : "Nothing waiting"} />
      </div>

      {ex.data && (ex.data.exceptions.length > 0 || ex.data.held.length > 0) && <ExceptionsQueue data={ex.data} me={me} />}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="max-w-full overflow-x-auto">
            <TabsList aria-label="Saved views">
              {TABS.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="gap-1.5 px-2.5">
                  {t.label}
                  <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal tabular-nums text-muted-foreground">{counts[t.key]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Select value={client} onValueChange={(v) => setParams(v === "all" ? {} : { client: v }, { replace: true })}>
            <SelectTrigger className="w-full lg:w-64" aria-label="Filter by client">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {CLIENTS.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.legalName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataTable
          label="Invoices"
          columns={columns}
          data={rows}
          loading={q.isPending}
          getRowId={(r) => r.id}
          search={(r, s) => [r.number ?? "draft", r.clientName, r.siteName, r.contractRef].some((v) => v.toLowerCase().includes(s))}
          searchPlaceholder="Filter by number, client or site…"
          onRowClick={(r) => navigate(`/invoices/${r.id}`)}
          selectable={tab === "draft"}
          bulkActions={(selected, clear) => <IssueAction selected={selected} pending={issue.isPending} onIssue={(ids) => issue.mutate(ids, { onSuccess: clear })} />}
          empty={clientName ? `No ${tab === "all" ? "" : `${TABS.find((t) => t.key === tab)!.label.toLowerCase()} `}invoices for ${clientName}.` : EMPTY[tab]}
        />
        {tab !== "draft" && drafts.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Open the <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => setTab("draft")}>Draft</button> view to select and issue drafts.
          </p>
        )}
      </div>

      <GenerateDialog open={generating} onOpenChange={setGenerating} me={me} onReview={() => setTab("draft")} />
    </Page>
  );
}

function IssueAction({ selected, pending, onIssue }: { selected: InvoiceRow[]; pending: boolean; onIssue: (ids: string[]) => void }) {
  const ready = selected.filter((r) => r.status === "draft" && r.view !== "blocked");
  const blocked = selected.length - ready.length;
  const total = money.sum(ready.map((r) => r.total));
  const period = [...new Set(ready.map((r) => dates.monthName(r.periodStart)))].join(", ");
  if (!ready.length)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Button size="sm" disabled>
              <BanIcon /> Issue
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Blocked drafts can't be issued until the rate is fixed or the line held.</TooltipContent>
      </Tooltip>
    );
  return (
    <>
      <ConfirmDialog
        trigger={
          <Button size="sm" disabled={pending}>
            <FileTextIcon /> Issue {ready.length} invoice{ready.length > 1 ? "s" : ""}
          </Button>
        }
        title={`Issue ${ready.length} invoice${ready.length > 1 ? "s" : ""} for ${period}?`}
        description={
          <>
            <p>
              Each gets the next number from the invoice sequence, is locked, and is emailed to the client as a PDF with the timesheet summary attached. After this, corrections are credit notes, never edits.
            </p>
            <p className="font-medium text-foreground tabular-nums">Total {formatMoney(total)} incl. {vatRef(vatCodeOn("standard", todayOman()))}</p>
            {blocked > 0 && <p>{blocked} blocked draft{blocked > 1 ? "s are" : " is"} left out until the rate is fixed or the line held.</p>}
          </>
        }
        confirmLabel={`Issue ${ready.length} invoice${ready.length > 1 ? "s" : ""} (${formatMoney(total)})`}
        typeToConfirm={period}
        onConfirm={() => onIssue(ready.map((r) => r.id))}
      />
      {blocked > 0 && <span className="text-xs text-muted-foreground">{blocked} blocked, skipped</span>}
    </>
  );
}

function ExceptionsQueue({ data, me }: { data: { exceptions: ReturnType<typeof listExceptions>; held: ReturnType<typeof listHeldLines> }; me: string }) {
  const byInvoice = useMemo(() => {
    const m = new Map<string, ReturnType<typeof listExceptions>>();
    for (const e of data.exceptions) m.set(e.invoiceId, [...(m.get(e.invoiceId) ?? []), e]);
    return [...m.entries()];
  }, [data.exceptions]);
  const hold = useDemoMutation(
    (lines: { invoiceId: string; lineId: string }[]) => lines.map((l) => holdLine(l.invoiceId, l.lineId, me)),
    (held) => toast.success(`${held.length} line${held.length > 1 ? "s" : ""} held`, { description: "The draft can be issued now. Held hours stay in the queue and bill on the next run once the rate is approved." }),
  );
  return (
    <Card className={cn("gap-3", byInvoice.length > 0 && "border-destructive/40")} aria-labelledby="exceptions-title">
      <CardHeader>
        <CardTitle id="exceptions-title" className="flex items-center gap-2">
          Exceptions
          {byInvoice.length > 0 ? <StatusBadge tone="blocked">{byInvoice.length} blocked</StatusBadge> : <StatusBadge tone="ok">Clear</StatusBadge>}
        </CardTitle>
        <CardDescription>A line with no matching rate blocks its invoice. Fix the rate card (a second person approves it) or hold the line so the rest of the invoice can be issued.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {byInvoice.map(([invoiceId, items]) => {
          const hours = items.reduce((n, e) => n + e.line.quantity, 0);
          const first = items[0]!;
          return (
            <div key={invoiceId} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/invoices/${invoiceId}`} className="font-medium hover:underline">
                    Draft · {first.siteName}
                  </Link>
                  <span className="text-sm text-muted-foreground">{first.clientName}</span>
                </div>
                <ul className="space-y-0.5 text-sm">
                  {items.map((e) => (
                    <li key={e.line.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span>{e.message}</span>
                      <span className="text-muted-foreground tabular-nums">· {e.line.quantity.toLocaleString("en-GB")} h · {e.line.timesheetRef}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/contracts/${first.contractId}`}>
                    <WrenchIcon /> Fix rate card
                  </Link>
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="secondary" disabled={hold.isPending}>
                      <PauseCircleIcon /> Hold {items.length > 1 ? `${items.length} lines` : "line"}
                    </Button>
                  }
                  title={`Hold ${hours.toLocaleString("en-GB")} ${first.line.trade} hours?`}
                  description={<p>The lines come off this draft and stay in the exceptions queue as unbilled hours. They bill on the next run once the rate card has a {first.line.trade} rate. The rest of the invoice can then be issued.</p>}
                  confirmLabel={`Hold ${items.length} line${items.length > 1 ? "s" : ""} (${hours.toLocaleString("en-GB")} h)`}
                  onConfirm={() => hold.mutate(items.map((e) => ({ invoiceId, lineId: e.line.id })))}
                />
              </div>
            </div>
          );
        })}
        {data.held.map((h) => (
          <div key={h.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge tone="incomplete">Held</StatusBadge>
              <span className="font-medium">{h.line.description}</span>
              <span className="text-muted-foreground tabular-nums">· {h.line.quantity.toLocaleString("en-GB")} h · {h.line.timesheetRef}</span>
            </div>
            <span className="text-xs text-muted-foreground">Held by {h.heldBy} on {displayDate(h.heldOn)} · bills once the rate is approved</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const STEPS = ["Reading locked site timesheets", "Matching hours to the rate card in force", "Adding fixed charges", "Applying VAT from vat_codes", "Creating drafts"];

function GenerateDialog({ open, onOpenChange, me, onReview }: { open: boolean; onOpenChange: (v: boolean) => void; me: string; onReview: () => void }) {
  const [step, setStep] = useState(0);
  const gen = useDemoMutation((m: string) => generateInvoices(m, me));
  const done = gen.isSuccess;

  // Walk the job's steps (App Flow: long jobs show step-by-step progress), then create the drafts.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    gen.reset();
    const t = setInterval(() => setStep((s) => (s < STEPS.length ? s + 1 : s)), 520);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when the dialog opens
  }, [open]);
  useEffect(() => {
    if (open && step === STEPS.length && gen.isIdle) gen.mutate(RUN_MONTH);
  }, [open, step, gen]);

  const pct = done ? 100 : Math.min(95, Math.round((step / STEPS.length) * 100));
  return (
    <Dialog open={open} onOpenChange={(v) => (done || !v ? onOpenChange(v) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate invoices for {RUN_NAME}</DialogTitle>
          <DialogDescription>Locked hours × each contract's rate card, plus fixed charges and {vatRef(vatCodeOn("standard", todayOman()))}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Progress value={pct} aria-label="Generation progress" />
          <ol className="space-y-2 text-sm" aria-live="polite">
            {STEPS.map((s, i) => {
              const state = done || i < step ? "done" : i === step ? "running" : "waiting";
              return (
                <li key={s} className={cn("flex items-center gap-2", state === "waiting" && "text-muted-foreground")}>
                  {state === "done" ? (
                    <CheckCircle2Icon aria-hidden className="size-4 text-success" />
                  ) : (
                    <span aria-hidden className={cn("size-4 rounded-full border-2", state === "running" ? "border-primary bg-primary/20" : "border-border")} />
                  )}
                  {s}
                  <span className="sr-only">({state})</span>
                </li>
              );
            })}
          </ol>
          {done && gen.data && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                {gen.data.created} drafts created · <span className="tabular-nums">{formatMoney(gen.data.total)}</span>
              </p>
              {gen.data.blocked > 0 && (
                <p className="mt-1 flex items-start gap-1.5 text-destructive">
                  <BanIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {gen.data.blocked} blocked by a line with no matching rate. It is in the exceptions queue.
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={!done}
            onClick={() => {
              onReview();
              onOpenChange(false);
            }}
          >
            Review drafts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
