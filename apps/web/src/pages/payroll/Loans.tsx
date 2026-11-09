/**
 * S-26 Advances and loans — balances and repayment schedules (PRD §4.7). Instalments are taken by
 * the pay engine within the deduction cap; anything over the cap carries to the next month.
 * A new advance needs a second person to approve it (four eyes, rule 6).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { omr } from "@mms/core";
import { createColumns, DataTable } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { formatMoney, Money } from "@/components/money";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dates, money } from "@/demo/core";
import { accountName, actions, CURRENT_PERIOD, loanApprovalBlock, RULES, ruleTag, usePayrollAction, useLoans, type LoanView } from "@/demo/payroll";
import { basicWage } from "@/demo/workforce";
import type { WorkerListItem } from "@/lib/api";
import { DEMO_ACCOUNTS, ROLE_LABELS } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { displayMoment, WhyDisabled } from "./PayrollReview";

const STATUS = {
  pending_approval: { tone: "due", label: "Waiting for approval" },
  active: { tone: "info", label: "Recovering" },
  completed: { tone: "ok", label: "Repaid" },
} as const;

const col = createColumns<LoanView>();
const columns = col.columns([
  col.accessor("id", { header: "Ref", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("workerName", {
    header: "Worker",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Link to={`/workers/${row.original.workerId}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
          {row.original.workerName}
        </Link>
        <span className="font-mono text-xs text-muted-foreground">{row.original.workerCode}</span>
      </div>
    ),
  }),
  col.accessor("kind", { header: "Type", cell: (c) => (c.getValue() === "advance" ? "Advance" : "Loan") }),
  col.accessor("principal", { header: () => <div className="text-end">Principal</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
  col.accessor("instalment", { header: () => <div className="text-end">Instalment</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
  col.accessor("recovered", { header: () => <div className="text-end">Recovered</div>, cell: (c) => <Money value={c.getValue()} bare className="text-muted-foreground" /> }),
  col.accessor("balance", { header: () => <div className="text-end">Balance</div>, cell: (c) => <Money value={c.getValue()} bare className="font-medium" /> }),
  col.accessor((l) => l.next?.period ?? "", {
    id: "next",
    header: "Next instalment",
    cell: ({ row }) => (row.original.next ? <span className="tabular-nums">{dates.monthName(row.original.next.period)}</span> : <span className="text-muted-foreground">—</span>),
  }),
  col.accessor("status", { header: "Status", cell: (c) => <StatusBadge tone={STATUS[c.getValue()].tone}>{STATUS[c.getValue()].label}</StatusBadge> }),
]);

type Filter = "all" | "active" | "pending_approval" | "completed";

export function Loans() {
  const q = useLoans();
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const loans = q.data?.loans;
  const open = loans?.find((l) => l.id === openId) ?? null;

  const k = useMemo(() => {
    if (!loans) return null;
    const active = loans.filter((l) => l.status === "active");
    const thisMonth = active.flatMap((l) => l.schedule.filter((s) => s.period === CURRENT_PERIOD).map((s) => s.due));
    return {
      outstanding: money.sum(active.map((l) => l.balance)),
      active: active.length,
      thisMonth: money.sum(thisMonth),
      thisMonthCount: thisMonth.length,
      waiting: loans.filter((l) => l.status === "pending_approval").length,
    };
  }, [loans]);

  return (
    <Page>
      <PageHeader
        screen="S-26"
        sample
        title="Advances & loans"
        description="Salary advances and loans with their repayment schedules. Payroll recovers each instalment automatically, within the legal deduction cap."
        actions={q.data && <NewAdvanceDialog workers={q.data.workers} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {k ? (
          <>
            <KpiCard label="Outstanding (OMR)" value={formatMoney(k.outstanding, { bare: true })} footer={`Across ${k.active} recovering`} hint="Principal less instalments on released runs" />
            <KpiCard label="Recovering" value={k.active} footer="Active advances and loans" hint="Repaid ones stay on record" />
            <KpiCard label={`Due in ${dates.monthName(CURRENT_PERIOD)}`} value={formatMoney(k.thisMonth, { bare: true })} footer={`${k.thisMonthCount} instalments in this month's run`} hint="Taken when the run is calculated" to="/payroll" />
            <KpiCard label="Waiting for approval" value={k.waiting} footer={k.waiting ? "Need a second person" : "Nothing waiting"} hint="Requester can't approve their own" />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        )}
      </div>

      <DataTable
        label="Advances and loans"
        columns={columns}
        data={loans?.filter((l) => filter === "all" || l.status === filter)}
        loading={q.isPending}
        getRowId={(l) => l.id}
        onRowClick={(l) => setOpenId(l.id)}
        search={(l, s) => l.workerName.toLowerCase().includes(s) || l.workerCode.toLowerCase().includes(s) || l.id.toLowerCase().includes(s)}
        searchPlaceholder="Filter by worker or ref…"
        toolbar={
          <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(v) => v && setFilter(v as Filter)} aria-label="Filter by status">
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="active">Recovering</ToggleGroupItem>
            <ToggleGroupItem value="pending_approval">Waiting</ToggleGroupItem>
            <ToggleGroupItem value="completed">Repaid</ToggleGroupItem>
          </ToggleGroup>
        }
        empty="No advances or loans. Use New advance to record one."
      />

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{open && <LoanDetail loan={open} />}</SheetContent>
      </Sheet>
    </Page>
  );
}

function LoanDetail({ loan }: { loan: LoanView }) {
  const { account } = useSession();
  const approve = usePayrollAction(actions.approveLoan);
  const why = loanApprovalBlock(loan, account);
  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {loan.kind === "advance" ? "Advance" : "Loan"} {loan.id}
          <StatusBadge tone={STATUS[loan.status].tone}>{STATUS[loan.status].label}</StatusBadge>
        </SheetTitle>
        <SheetDescription>
          <Link to={`/workers/${loan.workerId}`} className="font-medium text-foreground hover:underline">
            {loan.workerName}
          </Link>{" "}
          · {loan.workerCode} · {loan.reason}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-6">
        <dl className="grid grid-cols-3 gap-3 rounded-lg border p-3 text-sm">
          {(
            [
              ["Principal", loan.principal],
              ["Recovered", loan.recovered],
              ["Balance", loan.balance],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd>
                <Money value={v} align="start" className="font-medium" />
              </dd>
            </div>
          ))}
        </dl>

        <section aria-label="Approval" className="flex flex-col gap-2 text-sm">
          <h3 className="font-semibold">Approval</h3>
          <p className="text-muted-foreground">
            Requested by {accountName(loan.requestedBy)} · {displayMoment(loan.requestedAt)}
          </p>
          {loan.status === "pending_approval" ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-3">
              <span>Waiting for {accountName(loan.approver)} (or another finance or owner approver). The requester can't approve it.</span>
              <WhyDisabled reason={why}>
                <Button size="sm" disabled={!!why || approve.isPending} onClick={() => approve.mutate({ loanId: loan.id, account })}>
                  <CheckIcon data-icon="inline-start" /> Approve {loan.kind} of {formatMoney(loan.principal)}
                </Button>
              </WhyDisabled>
            </div>
          ) : (
            <p>Approved by {accountName(loan.approvedBy)}</p>
          )}
        </section>

        <section aria-label="Repayment schedule" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Repayment schedule</h3>
          <Table aria-label="Repayment schedule">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 w-10 text-xs">#</TableHead>
                <TableHead className="h-8 text-xs">Pay period</TableHead>
                <TableHead className="h-8 text-end text-xs">Due</TableHead>
                <TableHead className="h-8 text-xs">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loan.schedule.map((s, i) => {
                const done = i < loan.paidCount;
                const now = !done && s.period === CURRENT_PERIOD && loan.status !== "pending_approval";
                return (
                  <TableRow key={s.period} className="hover:bg-transparent">
                    <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>{dates.monthName(s.period)}</TableCell>
                    <TableCell>
                      <Money value={s.due} bare />
                    </TableCell>
                    <TableCell>{done ? <StatusBadge tone="ok">Recovered</StatusBadge> : now ? <StatusBadge tone="due">This month's run</StatusBadge> : <StatusBadge tone="incomplete">Upcoming</StatusBadge>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">If an instalment would take deductions past the cap, the excess carries to the next month ({ruleTag(RULES.deductionCap)}).</p>
        </section>
      </div>
    </>
  );
}

const AMOUNT = /^\d{1,5}(\.\d{1,3})?$/;

function NewAdvanceDialog({ workers }: { workers: WorkerListItem[] }) {
  const { account } = useSession();
  const create = usePayrollAction(actions.createLoan);
  const approvers = DEMO_ACCOUNTS.filter((a) => (a.role === "finance" || a.role === "owner") && a.username !== account?.username);
  const [open, setOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"advance" | "loan">("advance");
  const [amount, setAmount] = useState("");
  const [count, setCount] = useState("2");
  const [reason, setReason] = useState("");
  const [approver, setApprover] = useState(approvers[0]?.username ?? "");
  const [tried, setTried] = useState(false);

  const worker = workers.find((w) => w.code === code);
  const amountOk = AMOUNT.test(amount.trim()) && omr(amount.trim()).gt(0);
  const errors = {
    worker: worker ? null : "Choose the worker",
    amount: amountOk ? (omr(amount.trim()).gt(2000) ? "Above OMR 2,000.000 needs the owner's loan policy" : null) : "Enter an amount in OMR, e.g. 120.000",
    reason: reason.trim().length >= 5 ? null : "Say what it's for (at least 5 characters)",
    approver: approver ? null : "Choose who approves",
  };
  const valid = Object.values(errors).every((e) => !e);
  const instalment = amountOk ? money.str(omr(amount.trim()).div(count)) : null;
  const cap = worker ? money.times(basicWage(worker), RULES.deductionCap.params.shareOfBasic!) : null;
  const overCap = instalment && cap ? omr(instalment).gt(omr(cap)) : false;
  const canRequest = account?.role === "payroll" || account?.role === "hr_pro";

  const reset = () => {
    setCode("");
    setAmount("");
    setReason("");
    setTried(false);
  };
  const submit = () => {
    setTried(true);
    if (!valid) return;
    create.mutate(
      { workerCode: code, kind, principal: amount.trim(), instalments: Number(count), reason, approver, account },
      { onSuccess: () => (setOpen(false), reset()) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o || reset())}>
      <WhyDisabled reason={canRequest ? null : "Payroll or HR records advances"}>
        <DialogTrigger asChild>
          <Button disabled={!canRequest}>
            <PlusIcon data-icon="inline-start" /> New advance
          </Button>
        </DialogTrigger>
      </WhyDisabled>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New advance or loan</DialogTitle>
          <DialogDescription>A second person approves it before the first instalment is taken (from {dates.monthName(dates.addMonths(CURRENT_PERIOD, 1))}).</DialogDescription>
        </DialogHeader>
        <form
          id="new-advance"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FieldGroup className="gap-4">
            <Field data-invalid={tried && !!errors.worker}>
              <FieldLabel htmlFor="adv-worker">Worker</FieldLabel>
              <Popover open={pickOpen} onOpenChange={setPickOpen}>
                <PopoverTrigger asChild>
                  <Button id="adv-worker" variant="outline" role="combobox" aria-expanded={pickOpen} aria-invalid={tried && !!errors.worker} className="w-full justify-between font-normal">
                    {worker ? `${worker.fullName} · ${worker.code}` : <span className="text-muted-foreground">Search by name or code…</span>}
                    <ChevronsUpDownIcon className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Name or code…" />
                    <CommandList>
                      <CommandEmpty>No worker on payroll matches.</CommandEmpty>
                      <CommandGroup>
                        {workers.map((w) => (
                          <CommandItem key={w.code} value={`${w.fullName} ${w.code}`} onSelect={() => (setCode(w.code), setPickOpen(false))}>
                            <span className="truncate">{w.fullName}</span>
                            <span className="ms-auto font-mono text-xs text-muted-foreground">{w.code}</span>
                            {w.code === code && <CheckIcon />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {tried && <FieldError>{errors.worker}</FieldError>}
            </Field>

            <Field>
              <FieldLabel>Type</FieldLabel>
              <RadioGroup value={kind} onValueChange={(v) => setKind(v as "advance" | "loan")} className="flex gap-6" aria-label="Type">
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="advance" /> Salary advance
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="loan" /> Loan
                </label>
              </RadioGroup>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={tried && !!errors.amount}>
                <FieldLabel htmlFor="adv-amount">Amount (OMR)</FieldLabel>
                <Input id="adv-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120.000" className="text-end tabular-nums" aria-invalid={tried && !!errors.amount} />
                {tried && <FieldError>{errors.amount}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="adv-count">Instalments</FieldLabel>
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger id="adv-count" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
                      <SelectItem key={n} value={n}>
                        {n} {n === "1" ? "month" : "months"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {instalment && (
              <Alert variant={overCap ? "destructive" : "default"}>
                <AlertDescription className="tabular-nums">
                  {formatMoney(instalment)} a month for {count} {count === "1" ? "month" : "months"}.{" "}
                  {cap &&
                    (overCap
                      ? `Above the cap of ${formatMoney(cap)} for this worker: the excess will carry forward each month.`
                      : `Within the cap of ${formatMoney(cap)} (half of basic).`)}
                </AlertDescription>
              </Alert>
            )}

            <Field data-invalid={tried && !!errors.reason}>
              <FieldLabel htmlFor="adv-reason">What it's for</FieldLabel>
              <Textarea id="adv-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Family medical bill" aria-invalid={tried && !!errors.reason} />
              {tried && <FieldError>{errors.reason}</FieldError>}
            </Field>

            <Field data-invalid={tried && !!errors.approver}>
              <FieldLabel htmlFor="adv-approver">Approver (a second person)</FieldLabel>
              <Select value={approver} onValueChange={setApprover}>
                <SelectTrigger id="adv-approver" className="w-full">
                  <SelectValue placeholder="Choose an approver" />
                </SelectTrigger>
                <SelectContent>
                  {approvers.map((a) => (
                    <SelectItem key={a.username} value={a.username}>
                      {a.displayName} · {ROLE_LABELS[a.role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>You can't approve your own request.</FieldDescription>
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit" form="new-advance" disabled={create.isPending}>
            Send to {accountName(approver).split(" ")[0]} for approval{amountOk ? ` (${formatMoney(amount.trim())})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
