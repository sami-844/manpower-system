/**
 * S-22 Payroll runs — pay periods and run status (App Flow "monthly payroll to Bank Muscat WPS",
 * step 1 Import and step 2 Calculate). Released runs are locked; corrections go to the next run.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRightIcon, CalculatorIcon, LockIcon } from "lucide-react";
import { daysBetween } from "@mms/core";
import { MultiStepLoader } from "@/components/aceternity/multi-step-loader";
import { createColumns, DataTable } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { formatMoney, Money } from "@/components/money";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { todayOman } from "@/demo/core";
import {
  actions,
  CURRENT_RUN_ID,
  LEVEL_LABEL,
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  usePayrollAction,
  usePayrollRuns,
  type PayrollRun,
  type RunKind,
} from "@/demo/payroll";
import { displayDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const KIND_LABEL: Record<RunKind, string> = { regular: "Regular", adjustment: "Adjustment", settlement: "Settlement" };

export function RunStatusBadge({ run }: { run: Pick<PayrollRun, "status"> }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusBadge tone={RUN_STATUS_TONE[run.status]}>{RUN_STATUS_LABEL[run.status]}</StatusBadge>
      {run.status === "released" && <StatusBadge tone="locked">Locked</StatusBadge>}
    </span>
  );
}

export function RunKindLabel({ kind }: { kind: RunKind }) {
  return <span className={kind === "regular" ? "text-muted-foreground" : "font-medium"}>{KIND_LABEL[kind]}</span>;
}

/** The pay engine's real steps (Technical Spec §4.3), shown while the run calculates. */
const CALC_STEPS = [
  "Import locked timesheets",
  "Apply approved leave",
  "Loans and advances",
  "Calculate earnings",
  "Deductions within legal caps",
  "Sick-leave insurance & savings system",
  "Find blockers",
  "Variance vs last month",
].map((text) => ({ text }));
const STEP_MS = 420;

/** Calculate (or recalculate) a run: the multi-step loader, then the run moves to Calculated. */
export function CalculateRun({ run, label, variant = "default" }: { run: PayrollRun; label?: string; variant?: "default" | "outline" }) {
  const { account } = useSession();
  const calc = usePayrollAction(actions.calculate);
  const [busy, setBusy] = useState(false);
  const allowed = account?.role === "payroll";
  const start = () => {
    setBusy(true);
    window.setTimeout(() => {
      calc.mutate({ runId: run.id, account }, { onSettled: () => setBusy(false) });
    }, CALC_STEPS.length * STEP_MS);
  };
  const button = (
    <Button variant={variant} onClick={start} disabled={!allowed || busy || calc.isPending}>
      <CalculatorIcon data-icon="inline-start" />
      {label ?? (run.status === "draft" ? `Calculate ${run.period.name}` : "Recalculate")}
    </Button>
  );
  return (
    <>
      {allowed ? (
        button
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>{button}</span>
          </TooltipTrigger>
          <TooltipContent>Only the payroll officer calculates runs</TooltipContent>
        </Tooltip>
      )}
      <MultiStepLoader loadingStates={CALC_STEPS} loading={busy} duration={STEP_MS} loop={false} />
    </>
  );
}

const col = createColumns<PayrollRun>();
const columns = col.columns([
  col.accessor((r) => r.period.startDate, {
    id: "period",
    header: "Period",
    cell: ({ row }) => (
      <Link to={`/payroll/${row.original.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
        {row.original.period.name}
      </Link>
    ),
  }),
  col.accessor("kind", { header: "Run", cell: (c) => <RunKindLabel kind={c.getValue()} /> }),
  col.accessor("status", { header: "Status", cell: ({ row }) => <RunStatusBadge run={row.original} /> }),
  col.accessor("headcount", { header: () => <div className="text-end">Workers</div>, cell: (c) => <div className="text-end tabular-nums">{c.getValue() ?? "—"}</div> }),
  col.accessor("gross", { header: () => <div className="text-end">Gross</div>, cell: (c) => (c.getValue() ? <Money value={c.getValue()!} bare /> : <Dash />) }),
  col.accessor("deductions", { header: () => <div className="text-end">Deductions</div>, cell: (c) => (c.getValue() ? <Money value={c.getValue()!} bare /> : <Dash />) }),
  col.accessor("net", { header: () => <div className="text-end">Net (OMR)</div>, cell: (c) => (c.getValue() ? <Money value={c.getValue()!} bare className="font-medium" /> : <Dash />) }),
  col.accessor((r) => r.period.wpsDueDate, { id: "wps", header: "WPS due", cell: (c) => <span className="tabular-nums">{displayDate(c.getValue())}</span> }),
  col.display({
    id: "approved",
    header: "Approved by",
    cell: ({ row }) => {
      const a = row.original.approvals.filter((x) => x.level !== "payroll");
      return a.length ? (
        <span className="text-muted-foreground">{a.map((x) => x.name.split(" ")[0]).join(" → ")}</span>
      ) : (
        <span className="text-muted-foreground">Not yet</span>
      );
    },
  }),
]);

function Dash() {
  return <span className="block text-end text-muted-foreground">—</span>;
}

export function PayrollRuns() {
  const navigate = useNavigate();
  const q = usePayrollRuns();
  const runs = q.data?.runs;
  const current = runs?.find((r) => r.id === CURRENT_RUN_ID);
  const lastReleased = runs?.find((r) => r.kind === "regular" && r.status === "released");
  const blocking = q.data?.blockers.filter((b) => b.severity === "blocks").length ?? 0;
  const flags = (q.data?.blockers.length ?? 0) - blocking;
  const daysLeft = current ? daysBetween(todayOman(), current.period.wpsDueDate) : null;

  return (
    <Page>
      <PageHeader
        screen="S-22"
        sample
        title="Payroll runs"
        description="Each pay period runs from locked timesheets, approved leave and loan schedules, using the rule versions in force. Released runs are locked; corrections go into the next run."
        actions={current && current.status === "draft" ? <CalculateRun run={current} /> : current ? (
          <Button asChild>
            <Link to={`/payroll/${current.id}`}>
              Open {current.period.name} review <ArrowRightIcon data-icon="inline-end" className="rtl:rotate-180" />
            </Link>
          </Button>
        ) : null}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!current || !lastReleased ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label={`Net payroll (OMR) · ${current.net ? current.period.name : lastReleased.period.name}`}
              value={formatMoney(current.net ?? lastReleased.net!, { bare: true })}
              footer={current.net ? `${RUN_STATUS_LABEL[current.status]}, not yet released` : `${current.period.name} not calculated yet`}
              hint={current.net ? `${lastReleased.period.name}: ${formatMoney(lastReleased.net!)}` : "Showing the last released run"}
              to={`/payroll/${current.net ? current.id : lastReleased.id}`}
            />
            <KpiCard
              label="Workers paid"
              value={current.headcount ?? lastReleased.headcount}
              footer="Deployed and on paid leave"
              hint={current.headcount ? `${lastReleased.headcount} in ${lastReleased.period.name}` : `In ${lastReleased.period.name}`}
            />
            <KpiCard
              label="Blockers"
              value={current.status === "draft" ? "—" : blocking}
              footer={current.status === "draft" ? "Found when the run is calculated" : blocking ? "Stop the release until fixed" : "Nothing stops the release"}
              hint={current.status === "draft" ? "No bank account, invalid IBAN, no contract" : `${flags} flagged (expired documents, still paid)`}
              to={current.status === "draft" ? undefined : `/payroll/${current.id}?tab=blockers`}
            />
            <KpiCard
              label="Days to WPS deadline"
              value={daysLeft !== null && daysLeft >= 0 ? daysLeft : "Overdue"}
              footer={`Due ${displayDate(current.period.wpsDueDate)}`}
              hint="3 days after the period ends (WPS rule)"
            />
          </>
        )}
      </div>

      {current && <CurrentRunCard run={current} blocking={blocking} />}

      <section aria-labelledby="runs-h" className="flex flex-col gap-3">
        <div>
          <h2 id="runs-h" className="text-base font-semibold">
            All runs
          </h2>
          <p className="text-sm text-muted-foreground">Regular runs each month; adjustment runs correct a released month; settlement runs pay final settlements.</p>
        </div>
        <DataTable
          label="Payroll runs"
          columns={columns}
          data={runs}
          loading={q.isPending}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/payroll/${r.id}`)}
          empty="No pay periods yet. The first period opens when timesheets for it are locked."
          pageSize={20}
        />
      </section>
    </Page>
  );
}

/** Where the current period stands: calculate → payroll → finance → owner → release. */
function CurrentRunCard({ run, blocking }: { run: PayrollRun; blocking: number }) {
  const levels = run.levels.length ? run.levels : (["payroll", "finance", "owner"] as const);
  const steps = [
    { label: "Calculate", done: run.status !== "draft", who: run.calculatedBy ? `${displayDate(run.calculatedAt?.slice(0, 10))}` : null },
    ...levels.map((l) => {
      const a = run.approvals.find((x) => x.level === l);
      return { label: LEVEL_LABEL[l], done: !!a, who: a ? a.name : null };
    }),
    { label: "Release", done: run.status === "released", who: null },
  ];
  const at = steps.findIndex((s) => !s.done);
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {run.period.name} · regular run <RunStatusBadge run={run} />
          </CardTitle>
          <CardDescription>
            {run.status === "draft"
              ? `${run.note}. Calculate to price every payslip and find blockers.`
              : blocking
                ? `${blocking} blockers must be fixed before payroll can send the run for approval.`
                : run.status === "approved"
                  ? "Every approval is in. Release when ready; the run then locks."
                  : "Review variances, then each approver signs off with the totals they saw."}
          </CardDescription>
        </div>
        {run.status !== "draft" && (
          <Button variant="outline" asChild>
            <Link to={`/payroll/${run.id}`}>
              Review <ArrowRightIcon data-icon="inline-end" className="rtl:rotate-180" />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label={`${run.period.name} progress`}>
          {steps.map((s, i) => (
            <li
              key={s.label}
              aria-current={i === at ? "step" : undefined}
              className={cn("flex flex-col gap-0.5 rounded-lg border px-3 py-2", s.done ? "border-success/30 bg-success/5" : i === at ? "border-primary/40 bg-primary/5" : "border-dashed")}
            >
              <span className="text-xs text-muted-foreground tabular-nums">Step {i + 1}</span>
              <span className="flex items-center gap-1.5 text-sm font-medium">
                {s.label}
                {s.label === "Release" && <LockIcon aria-hidden className="size-3 text-muted-foreground" />}
              </span>
              <span className="truncate text-xs text-muted-foreground">{s.done ? (s.who ?? "Done") : i === at ? "Next" : "Waiting"}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
