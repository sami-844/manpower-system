/**
 * S-27 Exit and settlement — one guided checklist per exit reason and the final settlement
 * statement (App Flow "exit and final settlement", PRD §4.12). Payroll prepares, finance approves,
 * the owner approves above the rule-table amount; the worker signs the printed statement.
 * Gratuity is earned up to the savings-system switch date (D9 open).
 */
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckIcon, PrinterIcon, SnowflakeIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createColumns, DataTable } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { formatMoney, Money } from "@/components/money";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/demo/core";
import {
  accountName,
  actions,
  approvalBlock,
  EXIT_REASON_LABEL,
  EXIT_STATUS_LABEL,
  EXIT_STATUS_TONE,
  LEVEL_LABEL,
  nextLevel,
  RULES,
  ruleTag,
  useExits,
  usePayrollAction,
  type ApprovalLevel,
  type ChecklistItem,
  type ExitView,
} from "@/demo/payroll";
import { displayDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { displayMoment, WhyDisabled } from "./PayrollReview";
import { Lines } from "./Payslip";

const col = createColumns<ExitView>();
const columns = col.columns([
  col.accessor("workerName", {
    header: "Worker",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.workerName}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.workerCode} · {row.original.trade}
        </span>
      </div>
    ),
  }),
  col.accessor("reason", { header: "Reason", cell: (c) => EXIT_REASON_LABEL[c.getValue()] }),
  col.accessor("lastWorkingDay", { header: "Last working day", cell: ({ row }) => <span className="tabular-nums">{displayDate(row.original.reportDate ?? row.original.lastWorkingDay)}</span> }),
  col.accessor((e) => e.settlement.total, { id: "total", header: () => <div className="text-end">Settlement</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
  col.accessor("status", { header: "Status", cell: (c) => <StatusBadge tone={EXIT_STATUS_TONE[c.getValue()]}>{EXIT_STATUS_LABEL[c.getValue()]}</StatusBadge> }),
]);

export function Exits() {
  const q = useExits();
  const exits = q.data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = exits?.find((e) => e.id === selectedId) ?? exits?.find((e) => e.status === "awaiting_approval") ?? exits?.[0];
  const open = exits?.filter((e) => e.status !== "exited") ?? [];
  const detailRef = useRef<HTMLDivElement>(null);
  const select = (id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <Page>
      <div data-print-hide className="flex flex-col gap-6">
        <PageHeader
          screen="S-27"
          sample
          title="Exit & settlement"
          description="Every exit follows one checklist for its reason, so nothing owed in either direction is missed. The final settlement shows how each line was calculated and needs a second person to approve it."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {exits ? (
            <>
              <KpiCard label="Exits in progress" value={open.length} footer={`${open.filter((e) => e.status === "in_progress").length} still on the checklist`} hint="Started from the worker file" />
              <KpiCard label="Awaiting approval" value={open.filter((e) => e.status === "awaiting_approval").length} footer="Finance next, owner if large" hint={`Owner above ${formatMoney(RULES.settlementOwner.params.amount!)}`} />
              <KpiCard
                label="Settlements to pay (OMR)"
                value={formatMoney(money.sum(open.filter((e) => e.status !== "frozen").map((e) => e.settlement.total)), { bare: true })}
                footer="Paid in a settlement run"
                hint="Excludes frozen cases"
              />
              <KpiCard label="Pay frozen" value={open.filter((e) => e.status === "frozen").length} footer="Absconding reported" hint="Frozen from the report date" />
            </>
          ) : (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
          )}
        </div>
        <DataTable label="Exits" columns={columns} data={exits} loading={q.isPending} getRowId={(e) => e.id} onRowClick={(e) => select(e.id)} empty="No exits in progress. Start one from the worker file." pageSize={10} />
      </div>
      <div ref={detailRef} className="scroll-mt-16">{selected && <ExitDetail key={selected.id} exit={selected} />}</div>
    </Page>
  );
}

function ExitDetail({ exit: e }: { exit: ExitView }) {
  const { account } = useSession();
  const toggle = usePayrollAction(actions.toggleChecklist);
  const done = e.checklist.filter((c) => c.done).length;
  const locked = e.status === "exited";
  const groups = ["Last day", "Assets", "Government", "Settlement"] as const;

  return (
    <section aria-labelledby="exit-h" className="flex flex-col gap-4">
      <div data-print-hide className="flex flex-col gap-1 border-t pt-6">
        <h2 id="exit-h" className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          <Link to={`/workers/${e.workerId}`} className="hover:underline">
            {e.workerName}
          </Link>
          <span className="font-normal text-muted-foreground">· {EXIT_REASON_LABEL[e.reason]}</span>
          <StatusBadge tone={EXIT_STATUS_TONE[e.status]}>{EXIT_STATUS_LABEL[e.status]}</StatusBadge>
          {e.status === "exited" && <StatusBadge tone={e.rehireEligible ? "ok" : "blocked"}>{e.rehireEligible ? "Rehire: eligible" : "Rehire: not eligible"}</StatusBadge>}
        </h2>
        <p className="text-sm text-muted-foreground">
          {e.id} · notice {displayDate(e.noticeDate)} · last working day {displayDate(e.lastWorkingDay)} · joined {displayDate(e.joinedOn)} · {e.siteName}
        </p>
      </div>

      {e.status === "frozen" && (
        <Alert variant="destructive" data-print-hide>
          <SnowflakeIcon />
          <AlertTitle>Pay and access frozen from {displayDate(e.reportDate)}</AlertTitle>
          <AlertDescription>Absconding was reported on {displayDate(e.reportDate)}. Salary and system access stop from that date and the legal reporting steps are tracked below. The settlement stays on hold; if the worker returns, every step can be reversed, with a record of each one.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card data-print-hide className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Checklist · {EXIT_REASON_LABEL[e.reason].toLowerCase()}</CardTitle>
            <CardDescription className="tabular-nums">
              {done} of {e.checklist.length} done
            </CardDescription>
            <Progress value={(done / e.checklist.length) * 100} aria-label="Checklist progress" className="mt-1" />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {groups.map((g) => {
              const items = e.checklist.filter((c) => c.group === g);
              if (!items.length) return null;
              return (
                <fieldset key={g} className="flex flex-col gap-2">
                  <legend className="mb-1 text-xs font-medium text-muted-foreground uppercase">
                    {g === "Assets" ? `Assets returned${e.contractAllowsAssetDeduction ? "" : " · contract allows no deduction"}` : g === "Government" ? "Visa & labour card" : g}
                  </legend>
                  {items.map((c) => (
                    <CheckRow key={c.id} item={c} disabled={locked || toggle.isPending} onToggle={() => toggle.mutate({ exitId: e.id, itemId: c.id, account })} />
                  ))}
                </fieldset>
              );
            })}
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          <Statement exit={e} />
        </div>
      </div>
    </section>
  );
}

function CheckRow({ item, disabled, onToggle }: { item: ChecklistItem; disabled: boolean; onToggle: () => void }) {
  const id = `chk-${item.id}`;
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox id={id} checked={item.done} disabled={disabled} onCheckedChange={onToggle} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className={cn("text-sm leading-snug font-normal", item.done && "text-muted-foreground")}>
          {item.label}
          {item.value && <span className="ms-1 text-muted-foreground tabular-nums">· OMR {item.value}</span>}
        </Label>
        {item.done && item.doneAt && (
          <p className="text-xs text-muted-foreground">
            {accountName(item.doneBy)} · {displayMoment(item.doneAt)}
          </p>
        )}
      </div>
    </div>
  );
}

const APPROVE_LABEL: Record<ApprovalLevel, string> = { payroll: "Prepare and send to finance", finance: "Approve as finance", owner: "Approve as owner" };

function Statement({ exit: e }: { exit: ExitView }) {
  const { account } = useSession();
  const approve = usePayrollAction(actions.approveSettlement);
  const close = usePayrollAction(actions.closeExit);
  const [rehire, setRehire] = useState("yes");
  const st = e.settlement;
  const level = nextLevel(e.approvals, st.levels);
  const frozen = e.status === "frozen";
  const why = frozen ? "Pay is frozen while the absconding case is open" : level ? approvalBlock(account, level, e.preparedBy, e.approvals) : null;
  const openItems = e.checklist.filter((c) => !c.done).length;
  const closeWhy = account?.role !== "hr_pro" && account?.role !== "payroll" ? "HR or payroll closes the exit" : openItems ? `${openItems} checklist items still open` : null;

  return (
    <article aria-label={`Final settlement statement for ${e.workerName}`} className="flex flex-col gap-5 rounded-xl border bg-card p-5 shadow-xs sm:p-6 print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Manpower Management System — demo entity OM-01</p>
          <h3 className="text-base font-semibold">Final settlement statement</h3>
          <p className="text-sm text-muted-foreground">
            {e.workerName} · <span className="font-mono">{e.workerCode}</span> · {e.trade} · {EXIT_REASON_LABEL[e.reason]}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} data-print-hide>
          <PrinterIcon data-icon="inline-start" /> Print for signature
        </Button>
      </header>

      <Lines title="Owed to the worker" lines={st.lines.filter((l) => l.kind === "earning")} total={st.earnings} totalLabel="Total owed" />
      {st.lines.some((l) => l.kind === "deduction") && <Lines title="Owed by the worker" note="Loans, advances and unreturned assets, only where the contract allows." lines={st.lines.filter((l) => l.kind === "deduction")} total={st.deductions} totalLabel="Total recovered" />}

      <div className="flex flex-col gap-1 rounded-lg border bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">{frozen ? "Settlement on hold" : "Net settlement"}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            OMR {st.earnings} − OMR {st.deductions} · paid through WPS
          </p>
        </div>
        <Money value={st.total} className="text-2xl font-semibold" />
      </div>
      {st.unrecovered !== "0.000" && <p className="text-xs text-destructive">OMR {st.unrecovered} owed by the worker couldn't be covered by the settlement and goes to finance; the net is never negative.</p>}

      <section aria-label="Approvals" className="flex flex-col gap-2" data-print-hide>
        <h4 className="text-sm font-semibold">Approvals</h4>
        <ol className="flex flex-col gap-1.5 text-sm">
          {(["payroll", "finance", "owner"] as const).map((l) => {
            const a = e.approvals.find((x) => x.level === l);
            const needed = st.levels.includes(l);
            return (
              <li key={l} className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={a ? "ok" : !needed ? "incomplete" : l === level ? "due" : "draft"}>{a ? "Done" : !needed ? "Not required" : l === level ? "Next" : "Waiting"}</StatusBadge>
                <span className="font-medium">{LEVEL_LABEL[l]}</span>
                <span className="text-muted-foreground">
                  {a
                    ? `${a.name} · ${displayMoment(a.at)} · saw ${formatMoney(a.totalSeen)}`
                    : l === "owner"
                      ? `${needed ? "Needed" : "Only needed"} above ${formatMoney(RULES.settlementOwner.params.amount!)}, from rule table approval.settlement_owner_threshold`
                      : ""}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="font-mono text-[11px] text-muted-foreground">{ruleTag(RULES.settlementOwner)}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {level && e.status !== "exited" && (
            <WhyDisabled reason={why}>
              <Button size="sm" disabled={!!why || approve.isPending} onClick={() => approve.mutate({ exitId: e.id, account })}>
                <CheckIcon data-icon="inline-start" />
                {APPROVE_LABEL[level]} · {formatMoney(st.total)}
              </Button>
            </WhyDisabled>
          )}
          {e.status === "approved" && (
            <>
              <div className="flex items-center gap-2">
                <Label htmlFor="rehire" className="text-sm">
                  Rehire
                </Label>
                <Select value={rehire} onValueChange={setRehire}>
                  <SelectTrigger id="rehire" size="sm" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Eligible</SelectItem>
                    <SelectItem value="no">Not eligible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <WhyDisabled reason={closeWhy}>
                <ConfirmDialog
                  trigger={
                    <Button size="sm" disabled={!!closeWhy}>
                      Close exit
                    </Button>
                  }
                  title={`Close ${e.workerName}'s exit?`}
                  description={<p>The worker's status becomes Exited ({rehire === "yes" ? "eligible" : "not eligible"} for rehire). The settlement of {formatMoney(st.total)} is paid in the next settlement run and the signed statement is stored and locked.</p>}
                  confirmLabel={`Close exit and pay ${formatMoney(st.total)}`}
                  onConfirm={() => close.mutate({ exitId: e.id, rehire: rehire === "yes", account })}
                />
              </WhyDisabled>
            </>
          )}
          {e.status === "exited" && <span className="text-sm text-muted-foreground">Closed {displayMoment(e.closedAt)}. Paid in a settlement run; the record is locked.</span>}
        </div>
      </section>

      <footer className="hidden grid-cols-2 gap-10 pt-10 text-sm print:grid">
        <div className="border-t pt-2">Worker's signature and date</div>
        <div className="border-t pt-2">For the company (payroll)</div>
      </footer>
    </article>
  );
}
