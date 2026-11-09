/**
 * S-29 Receivables (App Flow "invoice to cash collected" steps 4–5, PRD 4.8): ageing by client,
 * credit-limit warnings (operations are warned before sending more workers), the reminder
 * schedule, and matching bank statement lines to invoices with partial allocation.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowRightIcon, BellIcon, LandmarkIcon, LinkIcon, TriangleAlertIcon } from "lucide-react";
import { omr } from "@mms/core";
import { Page, PageHeader } from "@/components/page-header";
import { createColumns, DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney, Money } from "@/components/money";
import { KpiCard } from "@/components/kpi-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/lib/session";
import { displayDate } from "@/lib/format";
import { money, todayOman } from "@/demo/core";
import { CLIENTS, clientById } from "@/demo/reference";
import { AGE_BUCKETS, billingKeys, openInvoicesFor, read, receivablesSummary, REMINDER_STEPS, sendReminder, useDemoMutation, type AgeBucket, type ReminderRow } from "@/demo/billing";
import { financeKeys, matchReceipt, unmatchedReceipts, type StatementLine } from "@/demo/finance";
import { KpiMoney, shortMonth } from "./Invoices";
import { cn } from "@/lib/utils";

/** Ordinal buckets → one hue, light to dark (sequential), so older debt reads as heavier. */
const SHADE: Record<AgeBucket, number> = { current: 38, d1_30: 54, d31_60: 70, d61_90: 85, d90: 100 };
const chartConfig = Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, { label: b.label, color: `color-mix(in oklab, var(--chart-1) ${SHADE[b.key]}%, var(--card))` }])) satisfies ChartConfig;

export function Receivables() {
  const today = todayOman();
  const q = useQuery({ queryKey: billingKeys.receivables, queryFn: () => read(() => receivablesSummary(today)) });
  const s = q.data;
  const over = s?.ageing.filter((a) => a.overLimit) ?? [];
  const near = s?.ageing.filter((a) => !a.overLimit && a.usedPct >= 80) ?? [];

  return (
    <Page>
      <PageHeader
        screen="S-29"
        sample
        title="Receivables"
        description="What clients owe, how old it is, and who is near their credit limit. Reminders go out on a schedule; bank receipts are matched to invoices here, part payments included."
        actions={
          <Button asChild variant="outline">
            <Link to="/invoices">
              All invoices <ArrowRightIcon className="rtl:rotate-180" />
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total outstanding" value={s ? <KpiMoney value={s.outstanding} /> : <Skeleton className="h-8 w-40" />} hint={s ? `${s.ageing.length} clients with open invoices` : " "} />
        <KpiCard label="Overdue" value={s ? <KpiMoney value={s.overdue} /> : <Skeleton className="h-8 w-40" />} hint={s ? `${s.overdueCount} invoices past due · disputes excluded` : " "} to="/invoices" />
        <KpiCard label="Days sales outstanding" value={s ? `${s.dso} days` : <Skeleton className="h-8 w-24" />} hint="Outstanding ÷ last 90 days billed × 90" />
        <KpiCard label="Collected this month" value={s ? <KpiMoney value={s.collectedThisMonth} /> : <Skeleton className="h-8 w-40" />} hint={s ? `${s.collectedCount} receipt${s.collectedCount === 1 ? "" : "s"} in ${new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date(`${today}T00:00:00Z`))}` : " "} />
      </div>

      {over.map((a) => (
        <Alert key={a.clientId} variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{a.clientName} is over its credit limit</AlertTitle>
          <AlertDescription>
            <p className="tabular-nums">
              {formatMoney(a.total)} outstanding against a {formatMoney(a.creditLimit, { bare: true })} limit ({a.usedPct}%). Operations are warned before sending more workers to this client.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to={`/invoices?client=${a.clientId}`}>Open invoices</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to={`/clients/${a.clientId}`}>Client file</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}
      {near.length > 0 && (
        <p className="-mt-2 text-sm text-muted-foreground">
          Near their limit (80% or more):{" "}
          {near.map((a, i) => (
            <span key={a.clientId}>
              {i > 0 && ", "}
              <Link to={`/clients/${a.clientId}`} className="font-medium text-foreground hover:underline">
                {a.clientName}
              </Link>{" "}
              <span className="tabular-nums">{a.usedPct}%</span>
            </span>
          ))}
          .
        </p>
      )}

      <AgeingCard summary={s} />
      <ReceiptsCard />
      <RemindersCard rows={s?.reminders} loading={q.isPending} />
    </Page>
  );
}

function AgeingCard({ summary }: { summary: ReturnType<typeof receivablesSummary> | undefined }) {
  const data = useMemo(
    () =>
      (summary?.ageing ?? []).map((a) => ({
        client: a.clientName,
        // Numbers for drawing only; labels and tooltips read the exact strings.
        ...Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, Number(a.buckets[b.key])])),
        strings: a.buckets,
      })),
    [summary],
  );
  const describe = summary
    ? `Stacked bars of open balances by client and age. Total ${formatMoney(summary.outstanding)}: ${AGE_BUCKETS.map((b) => `${b.label} ${formatMoney(summary.bucketTotals[b.key])}`).join(", ")}.`
    : "";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ageing by client</CardTitle>
        <CardDescription>Open balances by days past the due date. Disputed invoices are included and flagged on the invoice.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!summary ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <figure aria-label="Ageing by client chart" className="m-0">
            <figcaption className="sr-only">{describe}</figcaption>
            <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full" aria-hidden>
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={10}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v: number) => (v === 0 ? "0" : `${Math.round(v / 1000)}k`)} />
                <YAxis type="category" dataKey="client" width={170} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <ChartTooltip
                  cursor={{ fillOpacity: 0.4 }}
                  content={
                    <ChartTooltipContent
                      formatter={(_v, name, item) => (
                        <div className="flex w-full items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                          <span className="text-muted-foreground">{AGE_BUCKETS.find((b) => b.key === name)?.label}</span>
                          <span className="ms-auto font-medium tabular-nums">{formatMoney((item.payload as { strings: Record<AgeBucket, string> }).strings[name as AgeBucket], { bare: true })}</span>
                        </div>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                {AGE_BUCKETS.map((b, i) => (
                  <Bar key={b.key} isAnimationActive={false} dataKey={b.key} stackId="age" fill={`var(--color-${b.key})`} stroke="var(--card)" strokeWidth={2} radius={i === AGE_BUCKETS.length - 1 ? [0, 4, 4, 0] : 0} />
                ))}
              </BarChart>
            </ChartContainer>
          </figure>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <Table aria-label="Ageing by client">
            <TableHeader className="bg-muted/60">
              <TableRow>
                <TableHead>Client</TableHead>
                {AGE_BUCKETS.map((b) => (
                  <TableHead key={b.key} className="text-end">
                    {b.label}
                  </TableHead>
                ))}
                <TableHead className="text-end">Total</TableHead>
                <TableHead className="text-end">Limit used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!summary
                ? Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : summary.ageing.map((a) => (
                    <TableRow key={a.clientId}>
                      <TableCell>
                        <Link to={`/invoices?client=${a.clientId}`} className="font-medium hover:underline">
                          {a.clientName}
                        </Link>
                      </TableCell>
                      {AGE_BUCKETS.map((b) => (
                        <TableCell key={b.key}>
                          <Money value={a.buckets[b.key]} bare className={cn(a.buckets[b.key] === "0.000" && "text-muted-foreground/60")} />
                        </TableCell>
                      ))}
                      <TableCell>
                        <Money value={a.total} bare className="font-medium" />
                      </TableCell>
                      <TableCell className="text-end">
                        {a.overLimit ? <StatusBadge tone="expired">{a.usedPct}% · over</StatusBadge> : a.usedPct >= 80 ? <StatusBadge tone="due">{a.usedPct}%</StatusBadge> : <span className="tabular-nums text-muted-foreground">{a.usedPct}%</span>}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
            {summary && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  {AGE_BUCKETS.map((b) => (
                    <TableCell key={b.key}>
                      <Money value={summary.bucketTotals[b.key]} bare className="font-medium" />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Money value={summary.outstanding} bare className="font-semibold" />
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReceiptsCard() {
  const q = useQuery({ queryKey: financeKeys.receipts, queryFn: () => read(() => unmatchedReceipts()) });
  const [line, setLine] = useState<StatementLine | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Bank receipts to match
          {q.data && (q.data.length ? <StatusBadge tone="due">{q.data.length} unmatched</StatusBadge> : <StatusBadge tone="ok">All matched</StatusBadge>)}
        </CardTitle>
        <CardDescription>Bank Muscat ••••0172 statement lines with no invoice yet. Matching allocates the receipt (part payments allowed) and posts the ledger.</CardDescription>
      </CardHeader>
      <CardContent>
        {!q.data ? (
          <Skeleton className="h-24 w-full" />
        ) : q.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every receipt on the statement is matched to an invoice.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {q.data.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground">
                    <LandmarkIcon aria-hidden className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{l.description}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {displayDate(l.date)} · {l.reference}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <Money value={l.amount} className="font-medium" />
                  <Button size="sm" onClick={() => setLine(l)}>
                    <LinkIcon /> Match
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {line && <MatchDialog line={line} onClose={() => setLine(null)} />}
    </Card>
  );
}

/** Guess the payer from the statement text (the first word of the client's name). */
const guessClient = (text: string) => CLIENTS.find((c) => text.toUpperCase().includes(c.legalName.split(" ")[0]!.toUpperCase()))?.id ?? "";
const cmp = (a: string, b: string) => omr(a || "0").cmp(omr(b || "0"));
const AMOUNT = /^\d+(\.\d{1,3})?$/;

function MatchDialog({ line, onClose }: { line: StatementLine; onClose: () => void }) {
  const { account } = useSession();
  const me = account?.username ?? "finance.lead";
  const [clientId, setClientId] = useState(() => guessClient(line.description));
  const invoices = useMemo(() => (clientId ? openInvoicesFor(clientId) : []), [clientId]);
  // Oldest first until the receipt runs out; finance can change any figure.
  const fifo = useMemo(() => {
    let left = line.amount;
    return Object.fromEntries(
      invoices.map((i) => {
        const take = cmp(i.balance, left) <= 0 ? i.balance : left;
        left = money.minus(left, take);
        return [i.id, take];
      }),
    );
  }, [invoices, line.amount]);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const values = { ...fifo, ...alloc };
  const entries = invoices.map((i) => ({ inv: i, value: values[i.id] ?? "0.000" }));
  const invalid = entries.find((e) => e.value !== "" && (!AMOUNT.test(e.value) || cmp(e.value, e.inv.balance) > 0));
  const applied = invalid ? "0.000" : money.sum(entries.map((e) => e.value || "0"));
  const unapplied = money.minus(line.amount, applied);
  const overAllocated = cmp(applied, line.amount) > 0;
  const count = entries.filter((e) => cmp(e.value, "0") > 0).length;

  const m = useDemoMutation(
    () => matchReceipt({ lineId: line.id, clientId, allocations: entries.map((e) => ({ invoiceId: e.inv.id, amount: e.value || "0" })), by: me }),
    (p) => {
      toast.success(`Receipt ${p.number} matched`, { description: `${formatMoney(applied)} allocated to ${count} invoice${count === 1 ? "" : "s"}${cmp(unapplied, "0") > 0 ? `; ${formatMoney(unapplied)} held as unapplied cash` : ""}. Ledger posted.` });
      onClose();
    },
  );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Match {formatMoney(line.amount)} received {displayDate(line.date)}</DialogTitle>
          <DialogDescription>
            {line.description} · {line.reference}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="match-client">Paid by</FieldLabel>
          <Select
            value={clientId}
            onValueChange={(v) => {
              setClientId(v);
              setAlloc({});
            }}
          >
            <SelectTrigger id="match-client" className="w-full sm:w-80">
              <SelectValue placeholder="Pick the client" />
            </SelectTrigger>
            <SelectContent>
              {CLIENTS.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.legalName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {clientId && (
          <div className="max-h-72 overflow-auto rounded-lg border">
            <Table aria-label="Open invoices to allocate">
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden sm:table-cell">Due</TableHead>
                  <TableHead className="text-end">Balance</TableHead>
                  <TableHead className="w-40 text-end">Allocate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-16 text-center text-sm text-muted-foreground">
                      {clientById(clientId)!.legalName} has no open invoices. The receipt will be held as unapplied cash.
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map(({ inv, value }) => {
                    const bad = value !== "" && (!AMOUNT.test(value) || cmp(value, inv.balance) > 0);
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <div className="font-medium tabular-nums">{inv.number}</div>
                          <div className="text-xs text-muted-foreground">
                            {inv.siteName} · {shortMonth(inv.periodStart)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden tabular-nums sm:table-cell">{displayDate(inv.dueDate)}</TableCell>
                        <TableCell>
                          <Money value={inv.balance} bare />
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label={`Allocate to ${inv.number}`}
                            aria-invalid={bad}
                            inputMode="decimal"
                            className="h-8 text-end tabular-nums"
                            value={value}
                            onChange={(e) => setAlloc((a) => ({ ...a, [inv.id]: e.target.value.trim() }))}
                          />
                          {bad && <p className="mt-1 text-end text-xs text-destructive">Up to {formatMoney(inv.balance, { bare: true })}</p>}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm sm:ms-auto sm:w-80">
          <dt className="text-muted-foreground">Received</dt>
          <dd>
            <Money value={line.amount} />
          </dd>
          <dt className="text-muted-foreground">Allocated</dt>
          <dd>
            <Money value={applied} />
          </dd>
          <dt className={cn(overAllocated ? "text-destructive" : "text-muted-foreground")}>{overAllocated ? "Over-allocated" : "Unapplied (held on account 2150)"}</dt>
          <dd>
            <Money value={unapplied} className="font-medium" />
          </dd>
        </dl>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!clientId || !!invalid || overAllocated || m.isPending} onClick={() => m.mutate(undefined)}>
            Allocate {formatMoney(applied)} to {count} invoice{count === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const rcol = createColumns<ReminderRow>();

function RemindersCard({ rows, loading }: { rows: ReminderRow[] | undefined; loading: boolean }) {
  const { account } = useSession();
  const me = account?.username ?? "finance.lead";
  const today = todayOman();
  const send = useDemoMutation(
    (r: ReminderRow) => ({ sent: sendReminder(r.invoiceId, me), row: r }),
    ({ sent, row }) => toast.success(`${sent.label} sent for ${row.number}`, { description: `Emailed to ${clientById(row.clientId)!.contacts.at(-1)!.email} with the invoice PDF attached.` }),
  );
  const { mutate, isPending } = send;
  const columns = useMemo(
    () =>
      rcol.columns([
        rcol.accessor("number", {
          header: "Invoice",
          cell: ({ row }) => (
            <Link to={`/invoices/${row.original.invoiceId}`} className="font-medium tabular-nums hover:underline">
              {row.original.number}
            </Link>
          ),
        }),
        rcol.accessor("clientName", { header: "Client", cell: (c) => <span title={c.getValue()} className="block max-w-44 truncate">{c.getValue()}</span> }),
        rcol.accessor("daysOverdue", {
          header: "Due",
          cell: ({ row }) => {
            const d = row.original.daysOverdue;
            return (
              <div className="flex flex-col items-start gap-0.5">
                <span className="tabular-nums">{displayDate(row.original.dueDate)}</span>
                {d > 0 ? <StatusBadge tone="expired">{d} days overdue</StatusBadge> : <span className="text-xs text-muted-foreground">{d === 0 ? "Due today" : `In ${-d} days`}</span>}
              </div>
            );
          },
        }),
        rcol.accessor("balance", { header: () => <div className="text-end">Balance</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
        rcol.display({
          id: "last",
          header: "Last sent",
          cell: ({ row }) => {
            const l = row.original.lastSent;
            return l ? (
              <div className="leading-tight">
                <div>{REMINDER_STEPS[l.step]!.label}</div>
                <div className="text-xs text-muted-foreground">
                  {displayDate(l.sentOn)} · {l.sentBy === "system" ? "automatic" : l.sentBy}
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">None yet</span>
            );
          },
        }),
        rcol.accessor("nextOn", {
          header: "Next step",
          cell: ({ row }) => {
            const r = row.original;
            if (r.nextStep == null) return <StatusBadge tone="incomplete">Schedule complete</StatusBadge>;
            const due = r.nextOn! <= today;
            return (
              <div className="leading-tight">
                <div>{REMINDER_STEPS[r.nextStep]!.label}</div>
                <div className={cn("text-xs", due ? "font-medium text-warning-foreground dark:text-warning" : "text-muted-foreground")}>{due ? "Due now" : displayDate(r.nextOn)}</div>
              </div>
            );
          },
        }),
        rcol.display({
          id: "send",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => {
            const r = row.original;
            const btn = (
              <Button size="sm" aria-label={`Send reminder for ${r.number}`} variant={r.nextOn && r.nextOn <= today ? "default" : "outline"} disabled={r.nextStep == null || isPending} onClick={() => mutate(r)}>
                <BellIcon /> Send
              </Button>
            );
            return r.nextStep == null ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-block">
                    {btn}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Every step has been sent. Escalate with operations.</TooltipContent>
              </Tooltip>
            ) : (
              btn
            );
          },
        }),
      ]),
    [today, mutate, isPending],
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminder schedule</CardTitle>
        <CardDescription>
          Automatic emails {-REMINDER_STEPS[0].days} days before the due date, then {REMINDER_STEPS.slice(1).map((s) => s.days).join(", ")} days after. Disputed invoices pause until resolved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable label="Reminder schedule" columns={columns} data={rows} loading={loading} getRowId={(r) => r.invoiceId} pageSize={10} empty="No open invoices, so no reminders are scheduled." />
      </CardContent>
    </Card>
  );
}
