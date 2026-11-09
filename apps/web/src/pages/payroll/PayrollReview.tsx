/**
 * S-23 Payroll review — payslips, blockers, variances and approvals for one run (App Flow payroll
 * steps 3–5). Four eyes (rule 6): payroll prepares, finance approves, the owner approves above the
 * rule-table threshold; whoever calculated the run cannot approve it. Final means final (rule 7):
 * a released run is locked and corrections go to the next run.
 */
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeftIcon, CheckIcon, CircleIcon, FileTextIcon, LockIcon, SendIcon, WrenchIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createColumns, DataTable } from "@/components/data-table";
import { formatMoney, Money } from "@/components/money";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  accountName as accountLabel,
  actions,
  approvalBlock,
  BLOCKER_LABEL,
  LEVEL_LABEL,
  nextLevel,
  RULES,
  ruleTag,
  usePayrollAction,
  usePayrollRun,
  type ApprovalLevel,
  type Blocker,
  type Payslip,
  type PayrollRun,
  type Variance,
} from "@/demo/payroll";
import { displayDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { CalculateRun, KIND_LABEL, RunStatusBadge } from "./PayrollRuns";

const MOMENT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat" });
export const displayMoment = (iso: string | null) => (iso ? MOMENT.format(new Date(iso)) : "—");

const TABS = ["payslips", "blockers", "variances", "approvals"] as const;
type Tab = (typeof TABS)[number];

export function PayrollReview() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const q = usePayrollRun(id);
  const d = q.data;
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "payslips";

  if (q.isPending) {
    return (
      <Page>
        <Skeleton className="h-16 w-full max-w-xl" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-96 w-full" />
      </Page>
    );
  }
  if (!d) {
    return (
      <Page>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No payroll run with this ID</EmptyTitle>
            <EmptyDescription>It may have been typed wrong. Every run is listed on Payroll runs.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/payroll">Back to payroll runs</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }

  const { run } = d;
  const blocking = d.blockers.filter((b) => b.severity === "blocks");
  const flagged = d.variances.filter((v) => v.flagged);
  const locked = run.status === "released";

  return (
    <Page>
      <div data-print-hide>
        <Button variant="ghost" size="sm" asChild className="-ms-2 text-muted-foreground">
          <Link to="/payroll">
            <ArrowLeftIcon data-icon="inline-start" className="rtl:rotate-180" /> Payroll runs
          </Link>
        </Button>
      </div>
      <PageHeader
        screen="S-23"
        sample
        title={`Payroll · ${run.period.name}`}
        description={run.note}
        meta={
          <>
            <RunStatusBadge run={run} />
            <span className="text-sm">{KIND_LABEL[run.kind]} run</span>
            <span className="text-sm text-muted-foreground">
              {displayDate(run.period.startDate)} – {displayDate(run.period.endDate)} · WPS due {displayDate(run.period.wpsDueDate)}
            </span>
          </>
        }
        actions={<RunActions run={run} blocking={blocking.length} />}
      />

      {locked && (
        <Alert>
          <LockIcon />
          <AlertTitle>Released {displayMoment(run.releasedAt)} and locked</AlertTitle>
          <AlertDescription>Nothing in this run can change. Corrections go to the next run as adjustment lines that reference it.</AlertDescription>
        </Alert>
      )}

      {run.status === "draft" ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>{run.period.name} isn't calculated yet</EmptyTitle>
            <EmptyDescription>{run.note}. Calculating prices every payslip with the rule versions in force, then lists blockers and variances.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CalculateRun run={run} />
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <Totals run={run} />
          <Tabs value={tab} onValueChange={(v) => setParams(v === "payslips" ? {} : { tab: v }, { replace: true })}>
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <TabsList>
                <TabsTrigger value="payslips">Payslips <Count n={d.payslips.length} /></TabsTrigger>
                <TabsTrigger value="blockers">Blockers <Count n={d.blockers.length} alert={blocking.length > 0} /></TabsTrigger>
                <TabsTrigger value="variances">Variances <Count n={flagged.length} /></TabsTrigger>
                <TabsTrigger value="approvals">Approvals</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="payslips" className="mt-4">
              <PayslipsTab payslips={d.payslips} variances={d.variances} leavers={d.leavers} />
            </TabsContent>
            <TabsContent value="blockers" className="mt-4">
              <BlockersTab run={run} blockers={d.blockers} />
            </TabsContent>
            <TabsContent value="variances" className="mt-4">
              <VariancesTab variances={d.variances} locked={locked} />
            </TabsContent>
            <TabsContent value="approvals" className="mt-4">
              <ApprovalsTab run={run} blocking={blocking.length} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </Page>
  );
}

function Count({ n, alert = false }: { n: number; alert?: boolean }) {
  return <span className={cn("ms-1 rounded-full px-1.5 text-xs tabular-nums", alert ? "bg-destructive/12 text-destructive" : "bg-muted-foreground/12 text-muted-foreground")}>{n}</span>;
}

function Totals({ run }: { run: PayrollRun }) {
  const items: [string, ReactNode][] = [
    ["Workers", <span className="tabular-nums">{run.headcount}</span>],
    ["Gross", <Money value={run.gross!} align="start" />],
    ["Deductions", <Money value={run.deductions!} align="start" />],
    ["Net to pay", <Money value={run.net!} align="start" className="font-semibold" />],
  ];
  return (
    <Card size="sm">
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-lg font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Explains a disabled action (App Flow: "disabled, with a tooltip saying why"). */
export function WhyDisabled({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
}

const APPROVE_LABEL: Record<ApprovalLevel, string> = { payroll: "Send for approval", finance: "Approve as finance", owner: "Approve as owner" };

function RunActions({ run, blocking }: { run: PayrollRun; blocking: number }) {
  const { account } = useSession();
  const approveM = usePayrollAction(actions.approve);
  const releaseM = usePayrollAction(actions.release);
  if (run.status === "released") {
    return (
      <Button variant="outline" asChild>
        <Link to="/wps">
          <SendIcon data-icon="inline-start" /> WPS files
        </Link>
      </Button>
    );
  }
  if (run.status === "draft") return null;
  const level = nextLevel(run.approvals, run.levels);
  const block = level ? (approvalBlock(account, level, run.calculatedBy, run.approvals) ?? (level === "payroll" && blocking ? `Clear ${blocking} blockers first` : null)) : null;
  const canRelease = account?.role === "payroll" || account?.role === "finance";
  const releaseBlock = run.status !== "approved" ? "Needs every approval first" : blocking ? `Clear ${blocking} blockers first` : !canRelease ? "Payroll or finance releases the run" : null;
  return (
    <>
      {run.approvals.length === 0 && <CalculateRun run={run} variant="outline" />}
      {level && (
        <WhyDisabled reason={block}>
          <Button disabled={!!block || approveM.isPending} onClick={() => approveM.mutate({ runId: run.id, account })} variant={level === "payroll" ? "outline" : "default"}>
            <CheckIcon data-icon="inline-start" />
            {APPROVE_LABEL[level]}
          </Button>
        </WhyDisabled>
      )}
      <WhyDisabled reason={releaseBlock}>
        <ConfirmDialog
          trigger={
            <Button disabled={!!releaseBlock}>
              <SendIcon data-icon="inline-start" /> Release
            </Button>
          }
          title={`Release ${run.period.name} payroll?`}
          description={
            <>
              <p>
                {run.headcount} salaries, {formatMoney(run.net!)} net, will be released for payment through WPS. The run then locks: nothing in it can change, and any correction goes into the next run.
              </p>
              <p>Approved by {run.approvals.filter((a) => a.level !== "payroll").map((a) => a.name).join(" and ")}.</p>
            </>
          }
          confirmLabel={`Release ${run.headcount} salaries (${formatMoney(run.net!)})`}
          typeToConfirm={run.period.name}
          onConfirm={() => releaseM.mutate({ runId: run.id, account })}
        />
      </WhyDisabled>
    </>
  );
}

// --- Payslips -------------------------------------------------------------

type PayslipRow = Payslip & { variance: Variance | undefined };
const pcol = createColumns<PayslipRow>();
const payslipColumns = pcol.columns([
  pcol.accessor("workerCode", { header: "Code", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  pcol.accessor("workerName", {
    header: "Worker",
    cell: ({ row }) => (
      <Link to={`/workers/${row.original.workerId}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
        {row.original.workerName}
      </Link>
    ),
  }),
  pcol.accessor("siteName", { header: "Site", cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span> }),
  pcol.accessor("basic", { header: () => <div className="text-end">Basic</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
  pcol.accessor("overtime", { header: () => <div className="text-end">OT</div>, cell: (c) => <Money value={c.getValue()} bare className={c.getValue() === "0.000" ? "text-muted-foreground" : undefined} /> }),
  pcol.accessor("allowances", { header: () => <div className="text-end">Allowances</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
  pcol.accessor("deductions", { header: () => <div className="text-end">Deductions</div>, cell: (c) => <Money value={c.getValue()} bare className={c.getValue() === "0.000" ? "text-muted-foreground" : undefined} /> }),
  pcol.accessor("net", { header: () => <div className="text-end">Net</div>, cell: (c) => <Money value={c.getValue()} bare className="font-medium" /> }),
  pcol.accessor((r) => (r.variance ? Number(r.variance.pct) : 0), {
    id: "variance",
    header: () => <div className="text-end">vs last month</div>,
    cell: ({ row }) => <VarianceCell v={row.original.variance} />,
  }),
]);

function VarianceCell({ v }: { v: Variance | undefined }) {
  if (!v) return <span className="block text-end text-xs text-muted-foreground">New</span>;
  const up = !v.pct.startsWith("-");
  const text = `${up ? "+" : ""}${v.pct}%`;
  return (
    <div className="flex justify-end">
      {v.flagged ? <StatusBadge tone="due">{text}</StatusBadge> : <span className="text-xs text-muted-foreground tabular-nums">{text}</span>}
    </div>
  );
}

function PayslipsTab({ payslips, variances, leavers }: { payslips: Payslip[]; variances: Variance[]; leavers: number }) {
  const navigate = useNavigate();
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const byId = new Map(variances.map((v) => [v.payslipId, v]));
  const rows = payslips.map((p) => ({ ...p, variance: byId.get(p.id) })).filter((r) => !flaggedOnly || r.variance?.flagged);
  return (
    <div className="flex flex-col gap-2">
      <DataTable
        label="Payslips in this run"
        columns={payslipColumns}
        data={rows}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/payslips/${r.id}`)}
        search={(r, q) => r.workerName.toLowerCase().includes(q) || r.workerCode.toLowerCase().includes(q) || r.siteName.toLowerCase().includes(q)}
        searchPlaceholder="Filter by name, code or site…"
        toolbar={
          variances.length > 0 && (
            <Button variant={flaggedOnly ? "secondary" : "outline"} size="sm" aria-pressed={flaggedOnly} onClick={() => setFlaggedOnly((x) => !x)}>
              Flagged variances only
            </Button>
          )
        }
        empty="No payslips in this run."
      />
      <p className="text-xs text-muted-foreground">
        Variance is flagged above {Number(RULES.variance.params.share) * 100}% ({ruleTag(RULES.variance)}).
        {leavers > 0 && ` ${leavers} workers leaving this month are paid through their final settlement (Exit & settlement).`}
      </p>
    </div>
  );
}

// --- Blockers -------------------------------------------------------------

function BlockersTab({ run, blockers }: { run: PayrollRun; blockers: Blocker[] }) {
  const { account } = useSession();
  const fix = usePayrollAction(actions.resolveBlockers);
  const canFix = account?.role === "payroll" && run.status !== "released";
  const why = run.status === "released" ? "The run is locked" : "Only the payroll officer recalculates";
  const recalc = (ids: string[]) => fix.mutate({ runId: run.id, ids, account });

  const bcol = createColumns<Blocker>();
  const columns = bcol.columns([
    bcol.accessor("workerName", {
      header: "Worker",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <Link to={`/workers/${row.original.workerId}`} className="font-medium hover:underline">
            {row.original.workerName}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{row.original.workerCode}</span>
        </div>
      ),
    }),
    bcol.accessor("kind", {
      header: "Issue",
      cell: ({ row }) => <StatusBadge tone={row.original.severity === "blocks" ? "blocked" : "due"}>{BLOCKER_LABEL[row.original.kind]}</StatusBadge>,
    }),
    bcol.accessor("detail", { header: "Why", cell: (c) => <span className="text-sm whitespace-normal text-muted-foreground">{c.getValue()}</span> }),
    bcol.display({
      id: "fix",
      header: () => <div className="text-end">Fix</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="xs" asChild>
            <Link to={`/workers/${row.original.workerId}`}>
              <WrenchIcon data-icon="inline-start" /> Worker file
            </Link>
          </Button>
          {row.original.severity === "blocks" && (
            <WhyDisabled reason={canFix ? null : why}>
              <Button size="xs" disabled={!canFix || fix.isPending} onClick={() => recalc([row.original.id])}>
                Recalculate
              </Button>
            </WhyDisabled>
          )}
        </div>
      ),
    }),
  ]);

  const blocking = blockers.filter((b) => b.severity === "blocks").length;
  return (
    <div className="flex flex-col gap-3">
      <Alert variant={blocking ? "destructive" : "default"}>
        <AlertTitle>{blocking ? `${blocking} workers can't be paid correctly yet` : "Nothing blocks this run"}</AlertTitle>
        <AlertDescription>
          Blockers (no bank account, invalid IBAN, no active contract) stop the release until fixed in the worker file and recalculated. Expired documents are flagged in payroll: the worker is paid and the flag goes to HR/PRO.
        </AlertDescription>
      </Alert>
      <DataTable
        label="Payroll blockers"
        columns={columns}
        data={blockers}
        getRowId={(b) => b.id}
        selectable={canFix}
        bulkActions={(sel, clear) => {
          const ids = sel.filter((b) => b.severity === "blocks").map((b) => b.id);
          return (
            <Button size="sm" disabled={!ids.length || fix.isPending} onClick={() => (recalc(ids), clear())}>
              Recalculate {ids.length} fixed
            </Button>
          );
        }}
        search={(b, q) => b.workerName.toLowerCase().includes(q) || b.workerCode.toLowerCase().includes(q)}
        empty="No blockers or flags. Every worker in this run can be paid."
      />
    </div>
  );
}

// --- Variances ------------------------------------------------------------

function ReasonField({ v, locked }: { v: Variance; locked: boolean }) {
  const [value, setValue] = useState(v.reason);
  const save = usePayrollAction(actions.setReason);
  return (
    <Input
      value={value}
      disabled={locked}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value.trim() !== v.reason && save.mutate({ payslipId: v.payslipId, reason: value })}
      placeholder={locked ? "No reason recorded" : "Why it changed…"}
      aria-label={`Reason for ${v.workerName}'s change`}
      className="h-7 min-w-48 text-sm"
    />
  );
}

function VariancesTab({ variances, locked }: { variances: Variance[]; locked: boolean }) {
  const [all, setAll] = useState(false);
  const rows = all ? variances.slice(0, 200) : variances.filter((v) => v.flagged);
  const vcol = createColumns<Variance>();
  const columns = vcol.columns([
    vcol.accessor("workerName", {
      header: "Worker",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <Link to={`/payslips/${row.original.payslipId}`} className="font-medium hover:underline">
            {row.original.workerName}
          </Link>
          <span className="text-xs text-muted-foreground">{row.original.siteName}</span>
        </div>
      ),
    }),
    vcol.accessor("prevNet", { header: () => <div className="text-end">Last month</div>, cell: (c) => <Money value={c.getValue()} bare className="text-muted-foreground" /> }),
    vcol.accessor("net", { header: () => <div className="text-end">This month</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
    vcol.accessor("change", {
      header: () => <div className="text-end">Change</div>,
      cell: ({ row }) => (
        <div className="flex flex-col items-end">
          <Money value={row.original.change} bare className="font-medium" />
          <span className="text-xs text-muted-foreground tabular-nums">{`${row.original.pct.startsWith("-") ? "" : "+"}${row.original.pct}%`}</span>
        </div>
      ),
    }),
    vcol.accessor("whatChanged", { header: "What changed", cell: (c) => <span className="text-sm whitespace-normal text-muted-foreground">{c.getValue()}</span> }),
    vcol.display({ id: "reason", header: "Reason", cell: ({ row }) => <ReasonField v={row.original} locked={locked} /> }),
  ]);
  if (!variances.length) {
    return <p className="text-sm text-muted-foreground">No previous month to compare with for this run.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <DataTable
        label="Variances against last month"
        columns={columns}
        data={rows}
        getRowId={(v) => v.payslipId}
        search={(v, q) => v.workerName.toLowerCase().includes(q) || v.workerCode.toLowerCase().includes(q)}
        toolbar={
          <Button variant={all ? "secondary" : "outline"} size="sm" aria-pressed={all} onClick={() => setAll((x) => !x)}>
            {all ? "Show flagged only" : "Show largest 200 changes"}
          </Button>
        }
        empty="No payslip moved more than the threshold. Nothing to explain."
      />
      <p className="text-xs text-muted-foreground">
        Largest changes first. Payroll explains each flagged change before sending the run for approval ({ruleTag(RULES.variance)}).
      </p>
    </div>
  );
}

// --- Approvals ------------------------------------------------------------

function ApprovalsTab({ run, blocking }: { run: PayrollRun; blocking: number }) {
  const { account } = useSession();
  const approveM = usePayrollAction(actions.approve);
  const level = nextLevel(run.approvals, run.levels);
  const ownerNeeded = run.levels.includes("owner");
  const threshold = formatMoney(RULES.ownerThreshold.params.amount!);
  const steps: { key: string; title: string; body: ReactNode; state: "done" | "next" | "later" | "skipped" }[] = [
    {
      key: "calc",
      title: "Calculated",
      state: "done",
      body: `${run.calculatedBy ? accountLabel(run.calculatedBy) : "—"} · ${displayMoment(run.calculatedAt)}. The person who calculates can't approve at finance or owner level.`,
    },
    ...(["payroll", "finance", "owner"] as const).map((l) => {
      const a = run.approvals.find((x) => x.level === l);
      if (l === "owner" && !ownerNeeded) {
        return { key: l, title: "Owner approval not required", state: "skipped" as const, body: `Net ${formatMoney(run.net!)} is at or below ${threshold}, from rule table approval.owner_threshold (${ruleTag(RULES.ownerThreshold)}).` };
      }
      if (a) return { key: l, title: LEVEL_LABEL[l], state: "done" as const, body: `${a.name} · ${displayMoment(a.at)} · saw ${a.countSeen} payslips, ${formatMoney(a.totalSeen)} net` };
      const block = l === level ? (approvalBlock(account, l, run.calculatedBy, run.approvals) ?? (l === "payroll" && blocking ? `Clear ${blocking} blockers first` : null)) : null;
      return {
        key: l,
        title: LEVEL_LABEL[l],
        state: l === level ? ("next" as const) : ("later" as const),
        body:
          l === level ? (
            <div className="flex flex-col items-start gap-2">
              <span>
                {l === "owner" ? `Needed because net ${formatMoney(run.net!)} is above ${threshold} (from rule table approval.owner_threshold).` : l === "finance" ? "Finance checks totals and variances, then approves." : "Payroll confirms blockers are cleared and variances explained."}
              </span>
              <WhyDisabled reason={block}>
                <Button size="sm" disabled={!!block || approveM.isPending} onClick={() => approveM.mutate({ runId: run.id, account })}>
                  {APPROVE_LABEL[l]} · {formatMoney(run.net!)}
                </Button>
              </WhyDisabled>
            </div>
          ) : (
            "Waiting for the step before"
          ),
      };
    }),
    {
      key: "release",
      title: run.status === "released" ? "Released and locked" : "Release",
      state: run.status === "released" ? "done" : run.status === "approved" ? "next" : "later",
      body: run.status === "released" ? `${accountLabel(run.releasedBy!)} · ${displayMoment(run.releasedAt)}` : "Type the period name to confirm; the run then locks.",
    },
  ];
  return (
    <Card>
      <CardContent>
        <ol className="flex flex-col" aria-label="Approval timeline">
          {steps.map((s, i) => (
            <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
              {i < steps.length - 1 && <span aria-hidden className="absolute start-[11px] top-6 bottom-0 w-px bg-border" />}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                  s.state === "done" ? "border-success/40 bg-success/12 text-success" : s.state === "next" ? "border-primary bg-primary/10 text-primary" : "border-dashed bg-card text-muted-foreground",
                )}
              >
                {s.state === "done" ? <CheckIcon className="size-3.5" /> : <CircleIcon className="size-2.5" />}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.title}</span>
                  {s.state === "next" && <StatusBadge tone="due">Waiting</StatusBadge>}
                  {s.state === "skipped" && <StatusBadge tone="incomplete">Not required</StatusBadge>}
                </div>
                <div className="text-sm text-muted-foreground">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

