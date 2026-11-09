/**
 * S-30 Ledger and close (PRD 4.17): automatic journals from payroll, invoices, receipts and bills
 * plus manual ones, the trial balance, bank reconciliation, and the month-end close. Every journal
 * balances; a closed period shows a lock and rejects postings (CLAUDE.md rule 7).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CheckCircle2Icon, CircleDashedIcon, LockIcon, PlusIcon, ScaleIcon } from "lucide-react";
import { omr } from "@mms/core";
import { Page, PageHeader } from "@/components/page-header";
import { createColumns, DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney, Money } from "@/components/money";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/lib/session";
import { displayDate } from "@/lib/format";
import { dates, money, todayOman } from "@/demo/core";
import { read, useDemoMutation } from "@/demo/billing";
import {
  accountByCode,
  ACCOUNTS,
  bankReconciliation,
  closeChecklist,
  closePeriod,
  costCentreById,
  financeKeys,
  isBalanced,
  journalTotals,
  listJournals,
  listPeriods,
  periodName,
  pnlByMonth,
  postAccruals,
  postBankCharge,
  postManualJournal,
  trialBalance,
  type Journal,
  type JournalSource,
  type ReconRow,
} from "@/demo/finance";
import { KpiMoney, shortMonth } from "@/pages/billing/Invoices";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<JournalSource, string> = { payroll: "Payroll", invoice: "Invoice", payment: "Receipt", bill: "Supplier bill", manual: "Manual", opening: "Opening" };

/** The period to close: the earliest open month before the current one. */
function periodToClose(periods: ReturnType<typeof listPeriods>, today: string) {
  return periods.find((p) => p.status !== "closed" && p.key < today.slice(0, 7))?.key ?? null;
}

export function Ledger() {
  const today = todayOman();
  const [tab, setTab] = useState("journals");
  return (
    <Page>
      <PageHeader
        screen="S-30"
        sample
        title="Ledger & close"
        description="Double-entry books for the demo entity OM-01. Payroll, invoices, receipts and supplier bills post their own journals; every journal balances, and a closed month accepts no postings."
        actions={<ManualJournalDialog />}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PnlCard />
        <PeriodsCard today={today} onClose={() => setTab("close")} />
      </div>
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="max-w-full overflow-x-auto">
          <TabsList aria-label="Ledger views">
            <TabsTrigger value="journals">Journals</TabsTrigger>
            <TabsTrigger value="trial">Trial balance</TabsTrigger>
            <TabsTrigger value="bank">Bank reconciliation</TabsTrigger>
            <TabsTrigger value="close">Month-end close</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="journals">
          <JournalsTab />
        </TabsContent>
        <TabsContent value="trial">
          <TrialBalanceTab today={today} />
        </TabsContent>
        <TabsContent value="bank">
          <BankTab />
        </TabsContent>
        <TabsContent value="close">
          <CloseTab today={today} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------
const pnlConfig = { revenue: { label: "Revenue", color: "var(--chart-1)" }, costs: { label: "Costs", color: "var(--chart-2)" } } satisfies ChartConfig;

function PnlCard() {
  const q = useQuery({ queryKey: financeKeys.pnl, queryFn: () => read(() => ({ months: pnlByMonth(), periods: listPeriods() })) });
  const months = q.data?.months ?? [];
  const closedKeys = new Set(q.data?.periods.filter((p) => p.status === "closed").map((p) => p.key));
  const head = [...months].reverse().find((m) => closedKeys.has(m.month.slice(0, 7))) ?? months.at(-1);
  const data = months.map((m) => ({
    label: shortMonth(m.month).split(" ")[0] + (closedKeys.has(m.month.slice(0, 7)) ? "" : "*"),
    revenue: Number(m.revenue),
    costs: Number(money.sum([m.directCosts, m.overheads])),
    strings: { revenue: m.revenue, costs: money.sum([m.directCosts, m.overheads]) },
  }));
  const margin = head && head.revenue !== "0.000" ? omr(head.profit).div(omr(head.revenue)).times(100).toFixed(1) : "0.0";
  return (
    <Card className="gap-4 xl:col-span-2">
      <CardHeader>
        <CardTitle>Profit and loss</CardTitle>
        <CardDescription>By service month: revenue sits with the month whose hours it bills. * open month, provisional until its invoices are issued.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        {!head ? (
          <Skeleton className="h-48 w-full md:col-span-2" />
        ) : (
          <>
            <dl className="grid grid-cols-[1fr_auto] content-start gap-x-4 gap-y-2 text-sm">
              <dt className="col-span-2 text-xs font-medium text-muted-foreground uppercase">{dates.monthName(head.month)} · closed</dt>
              <dt className="text-muted-foreground">Revenue</dt>
              <dd>
                <Money value={head.revenue} bare />
              </dd>
              <dt className="text-muted-foreground">Direct costs</dt>
              <dd>
                <Money value={`-${head.directCosts}`} bare className="text-foreground" />
              </dd>
              <dt className="text-muted-foreground">Overheads</dt>
              <dd>
                <Money value={`-${head.overheads}`} bare className="text-foreground" />
              </dd>
              <dt className="border-t pt-2 font-medium">Net profit</dt>
              <dd className="border-t pt-2">
                <Money value={head.profit} bare className="font-semibold" />
              </dd>
              <dt className="text-muted-foreground">Net margin</dt>
              <dd className="text-end tabular-nums">{margin}%</dd>
            </dl>
            <figure aria-label="Revenue and costs by month" className="m-0 min-w-0">
              <figcaption className="sr-only">
                {months.map((m) => `${dates.monthName(m.month)}: revenue ${formatMoney(m.revenue)}, costs ${formatMoney(money.sum([m.directCosts, m.overheads]))}`).join("; ")}.
              </figcaption>
              <ChartContainer config={pnlConfig} className="aspect-auto h-48 w-full" aria-hidden>
                <BarChart data={data} margin={{ left: 0, right: 4, top: 4 }} barGap={2}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(_v, name, item) => (
                          <div className="flex w-full items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                            <span className="text-muted-foreground">{name === "revenue" ? "Revenue" : "Costs"}</span>
                            <span className="ms-auto font-medium tabular-nums">{formatMoney((item.payload as { strings: Record<string, string> }).strings[String(name)]!, { bare: true })}</span>
                          </div>
                        )}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar isAnimationActive={false} dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="costs" fill="var(--color-costs)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </figure>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PeriodsCard({ today, onClose }: { today: string; onClose: () => void }) {
  const q = useQuery({ queryKey: financeKeys.periods, queryFn: () => read(() => listPeriods()) });
  const periods = (q.data ?? []).filter((p) => p.key >= "2026-05" && p.key <= today.slice(0, 7));
  const next = q.data ? periodToClose(q.data, today) : null;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>Fiscal periods 2026</CardTitle>
        <CardDescription>January to April closed before go-live. Closed months reject postings.</CardDescription>
      </CardHeader>
      <CardContent>
        {!q.data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ul className="divide-y text-sm">
            {[...periods].reverse().map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-2 py-1.5">
                <span className={cn(p.status === "closed" && "text-muted-foreground")}>{periodName(p.key)}</span>
                {p.status === "closed" ? (
                  <StatusBadge tone="locked">Closed</StatusBadge>
                ) : p.key === next ? (
                  <button type="button" onClick={onClose} className="rounded-full focus-visible:outline-2 focus-visible:outline-ring">
                    <StatusBadge tone="due">Ready to close</StatusBadge>
                  </button>
                ) : (
                  <StatusBadge tone="draft">Open</StatusBadge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
const jcol = createColumns<Journal>();
const journalColumns = jcol.columns([
  jcol.accessor("number", { header: "Journal", cell: (c) => <span className="font-medium whitespace-nowrap tabular-nums">{c.getValue()}</span> }),
  jcol.accessor("date", { header: "Date", cell: (c) => <span className="whitespace-nowrap tabular-nums">{displayDate(c.getValue())}</span> }),
  jcol.accessor("source", { header: "Source", cell: (c) => <Badge variant="outline">{SOURCE_LABEL[c.getValue()]}</Badge> }),
  jcol.accessor("memo", { header: "Memo", cell: (c) => <span title={c.getValue()} className="block max-w-60 truncate">{c.getValue()}</span> }),
  jcol.display({ id: "debit", header: () => <div className="text-end">Debits</div>, cell: ({ row }) => <Money value={journalTotals(row.original).debit} bare /> }),
  jcol.display({ id: "credit", header: () => <div className="text-end">Credits</div>, cell: ({ row }) => <Money value={journalTotals(row.original).credit} bare /> }),
  jcol.display({ id: "balanced", header: "Check", cell: ({ row }) => (isBalanced(row.original) ? <StatusBadge tone="ok">Balanced</StatusBadge> : <StatusBadge tone="blocked">Unbalanced</StatusBadge>) }),
  jcol.display({
    id: "link",
    header: "Source record",
    cell: ({ row }) =>
      row.original.link ? (
        <Link to={row.original.link} onClick={(e) => e.stopPropagation()} className="whitespace-nowrap text-primary hover:underline">
          {row.original.linkLabel}
        </Link>
      ) : (
        <span className="text-muted-foreground">{row.original.source === "opening" ? "Excel books" : "Entered by hand"}</span>
      ),
  }),
]);

function JournalsTab() {
  const q = useQuery({ queryKey: financeKeys.journals, queryFn: () => read(() => listJournals()) });
  const [source, setSource] = useState<"all" | JournalSource>("all");
  const [open, setOpen] = useState<Journal | null>(null);
  const rows = useMemo(() => (q.data ?? []).filter((j) => source === "all" || j.source === source), [q.data, source]);
  return (
    <>
      <DataTable
        label="Journals"
        columns={journalColumns}
        data={q.data ? rows : undefined}
        loading={q.isPending}
        getRowId={(j) => j.id}
        search={(j, s) => [j.number, j.memo].some((v) => v.toLowerCase().includes(s))}
        searchPlaceholder="Filter by journal or memo…"
        onRowClick={setOpen}
        toolbar={
          <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {(Object.keys(SOURCE_LABEL) as JournalSource[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {SOURCE_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        empty="No journals for this source."
      />
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          {open && <JournalSheet journal={open} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function JournalSheet({ journal: j }: { journal: Journal }) {
  const t = journalTotals(j);
  return (
    <>
      <SheetHeader>
        <SheetTitle className="tabular-nums">{j.number}</SheetTitle>
        <SheetDescription>
          {j.memo} · {displayDate(j.date)} · posted by {j.postedBy}
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="outline">{SOURCE_LABEL[j.source]}</Badge>
          {isBalanced(j) ? <StatusBadge tone="ok">Debits equal credits</StatusBadge> : <StatusBadge tone="blocked">Unbalanced</StatusBadge>}
          {j.link && (
            <Link to={j.link} className="text-sm text-primary hover:underline">
              Open {j.linkLabel}
            </Link>
          )}
        </div>
      </SheetHeader>
      <div className="overflow-auto px-4 pb-4">
        <Table aria-label={`Lines of ${j.number}`}>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="text-end">Debit</TableHead>
              <TableHead className="text-end">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {j.lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-normal">
                  <div>
                    <span className="me-2 text-muted-foreground tabular-nums">{l.account}</span>
                    {accountByCode(l.account).name}
                  </div>
                  {l.costCentreId && <div className="text-xs text-muted-foreground">{costCentreById(l.costCentreId)?.code} · {costCentreById(l.costCentreId)?.name}</div>}
                </TableCell>
                <TableCell>{l.debit !== "0.000" && <Money value={l.debit} bare />}</TableCell>
                <TableCell>{l.credit !== "0.000" && <Money value={l.credit} bare />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">Total</TableCell>
              <TableCell>
                <Money value={t.debit} bare className="font-medium" />
              </TableCell>
              <TableCell>
                <Money value={t.credit} bare className="font-medium" />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
function TrialBalanceTab({ today }: { today: string }) {
  const options = [
    { value: today, label: `Today, ${displayDate(today)}` },
    { value: "2026-10-31", label: "31 Oct 2026 (October close)" },
    { value: "2026-09-30", label: "30 Sep 2026 (closed)" },
  ];
  const [asAt, setAsAt] = useState(today);
  const q = useQuery({ queryKey: financeKeys.trial(asAt), queryFn: () => read(() => trialBalance(asAt)) });
  const tb = q.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trial balance</CardTitle>
        <CardDescription>Every account's net balance from all journals up to the date. Debits must equal credits.</CardDescription>
        <CardAction>
          <Select value={asAt} onValueChange={setAsAt}>
            <SelectTrigger className="w-60" aria-label="As at date">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {tb &&
          (tb.balanced ? (
            <Alert>
              <ScaleIcon className="text-success" />
              <AlertTitle>Balanced</AlertTitle>
              <AlertDescription className="tabular-nums">Debits and credits both total {formatMoney(tb.debit)}.</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <ScaleIcon />
              <AlertTitle>Out of balance by {formatMoney(money.minus(tb.debit, tb.credit))}</AlertTitle>
              <AlertDescription>Find the journal that does not balance before closing the period.</AlertDescription>
            </Alert>
          ))}
        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label="Trial balance">
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead className="w-20">Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="text-end">Debit</TableHead>
                <TableHead className="text-end">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!tb
                ? Array.from({ length: 8 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : tb.rows.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell className="tabular-nums text-muted-foreground">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="hidden capitalize text-muted-foreground sm:table-cell">{r.type}</TableCell>
                      <TableCell>{r.debit !== "0.000" ? <Money value={r.debit} bare /> : null}</TableCell>
                      <TableCell>{r.credit !== "0.000" ? <Money value={r.credit} bare /> : null}</TableCell>
                    </TableRow>
                  ))}
            </TableBody>
            {tb && (
              <TableFooter>
                <TableRow>
                  <TableCell />
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell>
                    <Money value={tb.debit} bare className="font-semibold" />
                  </TableCell>
                  <TableCell>
                    <Money value={tb.credit} bare className="font-semibold" />
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
const rcol = createColumns<ReconRow>();

function BankTab() {
  const { account } = useSession();
  const me = account?.username ?? "finance.lead";
  const q = useQuery({ queryKey: financeKeys.recon, queryFn: () => read(() => bankReconciliation()) });
  const [show, setShow] = useState<"unmatched" | "all">("unmatched");
  const post = useDemoMutation(
    (id: string) => postBankCharge(id, me),
    (j) => toast.success(`${j.number} posted and matched`, { description: j.memo }),
  );
  const { mutate, isPending } = post;
  const columns = useMemo(
    () =>
      rcol.columns([
        rcol.accessor("date", { header: "Date", cell: (c) => <span className="whitespace-nowrap tabular-nums">{displayDate(c.getValue())}</span> }),
        rcol.accessor("description", {
          header: "Statement text",
          cell: ({ row }) => (
            <div className="max-w-80 leading-tight">
              <div title={row.original.description} className="truncate">
                {row.original.description}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">{row.original.reference}</div>
            </div>
          ),
        }),
        rcol.accessor("amount", { header: () => <div className="text-end">Amount</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
        rcol.display({ id: "status", header: "Status", cell: ({ row }) => (row.original.matchedJournalId ? <StatusBadge tone="ok">Matched</StatusBadge> : <StatusBadge tone="due">Unmatched</StatusBadge>) }),
        rcol.display({
          id: "to",
          header: "Matched to",
          cell: ({ row }) => {
            const r = row.original;
            if (r.journal)
              return r.journal.link ? (
                <Link to={r.journal.link} className="whitespace-nowrap text-primary tabular-nums hover:underline">
                  {r.journal.number}
                </Link>
              ) : (
                <span className="whitespace-nowrap tabular-nums">{r.journal.number}</span>
              );
            if (r.kind === "receipt")
              return (
                <Button asChild size="xs" variant="outline">
                  <Link to="/receivables">Match in Receivables</Link>
                </Button>
              );
            return (
              <Button size="xs" variant="outline" disabled={isPending} onClick={() => mutate(r.id)}>
                Post bank charge
              </Button>
            );
          },
        }),
      ]),
    [mutate, isPending],
  );
  const r = q.data;
  const rows = r ? (show === "all" ? [...r.lines].reverse() : r.lines.filter((l) => !l.matchedJournalId)) : undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Statement balance" value={r?.statementBalance} hint={`${r?.account.bank ?? "Bank"} ${r?.account.masked ?? ""} as imported`} />
        <Stat label="Ledger balance (account 1000)" value={r?.ledgerBalance} hint="All journals posted to the bank account" />
        <Stat
          label="Difference"
          value={r?.difference}
          hint={r ? `${r.lines.filter((l) => !l.matchedJournalId).length} unmatched statement lines, ${r.notOnStatement.length} ledger items not yet on the statement` : ""}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Statement lines</CardTitle>
          <CardDescription>Each line is matched to the journal it settles. Receipts are matched against invoices in Receivables.</CardDescription>
          <CardAction>
            <ToggleGroup type="single" variant="outline" size="sm" value={show} onValueChange={(v) => v && setShow(v as typeof show)} aria-label="Show lines">
              <ToggleGroupItem value="unmatched">Unmatched</ToggleGroupItem>
              <ToggleGroupItem value="all">All</ToggleGroupItem>
            </ToggleGroup>
          </CardAction>
        </CardHeader>
        <CardContent>
          <DataTable label="Bank statement lines" columns={columns} data={rows} loading={q.isPending} getRowId={(l) => l.id} pageSize={15} empty="Every statement line is matched." />
        </CardContent>
      </Card>
      {r && r.notOnStatement.length > 0 && (
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-base">In the ledger, not yet on the statement</CardTitle>
            <CardDescription>Payments made or recorded that the bank has not cleared yet. They match automatically when the next statement is imported.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {r.notOnStatement.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate">{n.memo}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {displayDate(n.date)} · {n.number}
                    </div>
                  </div>
                  <Money value={n.amount} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | undefined; hint: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold tabular-nums">{value ? <KpiMoney value={value} /> : <Skeleton className="h-7 w-36" />}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
function CloseTab({ today }: { today: string }) {
  const { account } = useSession();
  const me = account?.username ?? "finance.lead";
  const periods = useQuery({ queryKey: financeKeys.periods, queryFn: () => read(() => listPeriods()) });
  const lastClosed = periods.data?.filter((p) => p.status === "closed").at(-1);
  const key = periods.data ? periodToClose(periods.data, today) : null;
  const q = useQuery({ queryKey: financeKeys.close(key ?? "none"), queryFn: () => read(() => (key ? closeChecklist(key) : [])), enabled: !!periods.data });
  const accruals = useDemoMutation(
    (k: string) => postAccruals(k, me),
    (j) => toast.success(`${j.number} posted`, { description: `${j.memo} · ${formatMoney(journalTotals(j).debit)}` }),
  );
  const bank = useDemoMutation(
    () => {
      const line = bankReconciliation().lines.find((l) => l.date.startsWith(key!) && !l.matchedJournalId && l.kind === "charge");
      if (!line) throw new Error("No unmatched bank charge left for this month. Match receipts in Receivables.");
      return postBankCharge(line.id, me);
    },
    (j) => toast.success(`${j.number} posted and matched`, { description: j.memo }),
  );
  const close = useDemoMutation(
    (k: string) => closePeriod(k, me),
    (p) => toast.success(`${periodName(p.key)} closed`, { description: "The period is locked. Any posting dated in it is now rejected." }),
  );

  const name = key ? periodName(key) : "";
  const items = q.data ?? [];
  const open = items.filter((i) => !i.done);

  return (
    <div className="flex flex-col gap-4">
      {lastClosed && (
        <Alert>
          <LockIcon />
          <AlertTitle>{periodName(lastClosed.key)} is closed</AlertTitle>
          <AlertDescription>
            Closed by {lastClosed.closedBy} on {displayDate(lastClosed.closedAt?.slice(0, 10))}. Postings dated in a closed month are rejected; corrections go into the next open month.
          </AlertDescription>
        </Alert>
      )}
      {!key ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Every past month is closed. The current month closes after it ends.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Month-end close · {name}</CardTitle>
            <CardDescription>Each step must be done before the month locks. Closing is final: nothing can post to {name} afterwards.</CardDescription>
            <CardAction>
              <span className="text-sm text-muted-foreground tabular-nums">
                {items.length - open.length} of {items.length} done
              </span>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {q.isPending ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ol className="divide-y rounded-lg border">
                {items.map((i) => (
                  <li key={i.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      {i.done ? <CheckCircle2Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleDashedIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                      <div>
                        <div className="font-medium">
                          {i.label}
                          <span className="sr-only">{i.done ? " (done)" : " (to do)"}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">{i.detail}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 ps-7 sm:ps-0">
                      {i.done ? (
                        <StatusBadge tone="ok">Done</StatusBadge>
                      ) : i.key === "accruals" ? (
                        <Button size="sm" disabled={accruals.isPending} onClick={() => accruals.mutate(key)}>
                          Post accruals
                        </Button>
                      ) : i.key === "bank" ? (
                        <Button size="sm" disabled={bank.isPending} onClick={() => bank.mutate(undefined)}>
                          Post bank charge
                        </Button>
                      ) : i.to ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to={i.to}>Go to {i.label.split(" ")[0]!.toLowerCase()}</Link>
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {open.length > 0 && <p className="text-sm text-muted-foreground sm:me-auto">{open.length} step{open.length > 1 ? "s" : ""} left before {name} can close.</p>}
              {open.length > 0 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-block">
                      <Button disabled>
                        <LockIcon /> Close {name}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Finish first: {open.map((i) => i.label.toLowerCase()).join(", ")}</TooltipContent>
                </Tooltip>
              ) : (
                <ConfirmDialog
                  trigger={
                    <Button disabled={close.isPending}>
                      <LockIcon /> Close {name}
                    </Button>
                  }
                  title={`Close ${name}?`}
                  description={
                    <>
                      <p>The trial balance, P&amp;L and VAT workings for {name} become final. Any journal, payment or bill dated in {name} will be rejected; corrections go into the next open month.</p>
                    </>
                  }
                  confirmLabel={`Close ${name}`}
                  typeToConfirm={name}
                  destructive
                  onConfirm={() => close.mutate(key)}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
const AMOUNT = /^\d+(\.\d{1,3})?$/;

function ManualJournalDialog() {
  const { account } = useSession();
  const me = account?.username ?? "finance.lead";
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayOman());
  const [memo, setMemo] = useState("");
  const [debit, setDebit] = useState("6100");
  const [credit, setCredit] = useState("2300");
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    memo: submitted && !memo.trim() ? "Say what the journal is for." : null,
    amount: submitted && !AMOUNT.test(amount) ? "Enter an amount, up to 3 decimals." : null,
    accounts: submitted && debit === credit ? "Debit and credit accounts must differ." : null,
  };
  const m = useDemoMutation(
    () => postManualJournal({ date, memo, lines: [{ account: debit, costCentreId: null, debit: amount, credit: "0" }, { account: credit, costCentreId: null, debit: "0", credit: amount }], by: me }),
    (j) => {
      toast.success(`${j.number} posted`, { description: `${j.memo} · ${formatMoney(journalTotals(j).debit)}` });
      setOpen(false);
      setMemo("");
      setAmount("");
      setSubmitted(false);
    },
  );
  const accountSelect = (id: string, value: string, set: (v: string) => void) => (
    <Select value={value} onValueChange={set}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ACCOUNTS.map((a) => (
          <SelectItem key={a.code} value={a.code}>
            {a.code} · {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> Manual journal
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New manual journal</DialogTitle>
          <DialogDescription>For accruals, reclassifications and bank charges. It must balance, and it cannot be dated in a closed month.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="mj-date">Date</FieldLabel>
              <Input id="mj-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="mj-amount">Amount (OMR)</FieldLabel>
              <Input id="mj-amount" inputMode="decimal" className="tabular-nums" placeholder="0.000" value={amount} onChange={(e) => setAmount(e.target.value.trim())} aria-invalid={!!errors.amount} />
              {errors.amount && <FieldError>{errors.amount}</FieldError>}
            </Field>
          </div>
          <Field data-invalid={!!errors.memo}>
            <FieldLabel htmlFor="mj-memo">Memo</FieldLabel>
            <Input id="mj-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Accrue November office electricity" aria-invalid={!!errors.memo} />
            {errors.memo && <FieldError>{errors.memo}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="mj-debit">Debit</FieldLabel>
            {accountSelect("mj-debit", debit, setDebit)}
          </Field>
          <Field data-invalid={!!errors.accounts}>
            <FieldLabel htmlFor="mj-credit">Credit</FieldLabel>
            {accountSelect("mj-credit", credit, setCredit)}
            {errors.accounts && <FieldError>{errors.accounts}</FieldError>}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={m.isPending}
            onClick={() => {
              setSubmitted(true);
              if (memo.trim() && AMOUNT.test(amount) && debit !== credit) m.mutate(undefined);
            }}
          >
            Post {AMOUNT.test(amount) ? formatMoney(amount) : "journal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
