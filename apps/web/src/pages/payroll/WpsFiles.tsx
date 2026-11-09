/**
 * S-25 WPS files — generate, download or send, and bank responses (App Flow payroll step 6 and
 * "When it goes wrong": fix only the rejected rows and generate a new file for them).
 * D8 is open: the Bank Muscat SIF template is a draft, so every file here is a DEMO CSV with
 * masked accounts only. The SHA-256 is computed in the browser from the exact file content.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCheckIcon, DownloadIcon, FileCogIcon, FileWarningIcon, SendIcon, WrenchIcon } from "lucide-react";
import { MultiStepLoader } from "@/components/aceternity/multi-step-loader";
import { createColumns, DataTable } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { formatMoney, Money } from "@/components/money";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  accountName,
  actions,
  sha256Hex,
  usePayrollAction,
  useWpsFiles,
  WPS_STATUS_LABEL,
  WPS_STATUS_TONE,
  wpsCsv,
  type PayrollRun,
  type WpsFile,
  type WpsResponse,
} from "@/demo/payroll";
import type { DemoAccount } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { money } from "@/demo/core";
import { displayMoment, WhyDisabled } from "./PayrollReview";
import { KIND_LABEL } from "./PayrollRuns";

const WPS_STEPS = ["Validate accounts", "Build salary file", "Checksum", "Ready to send"].map((text) => ({ text }));
const STEP_MS = 450;

/** Plays the WPS job's steps, then runs the action. */
function useWpsJob() {
  const gen = usePayrollAction(actions.generateWps);
  const [busy, setBusy] = useState(false);
  const run = (input: { runId: string; account: DemoAccount | null; rejectedOf?: string }) => {
    setBusy(true);
    window.setTimeout(() => gen.mutate(input, { onSettled: () => setBusy(false) }), WPS_STEPS.length * STEP_MS);
  };
  return { run, busy: busy || gen.isPending, loader: <MultiStepLoader loadingStates={WPS_STEPS} loading={busy} duration={STEP_MS} loop={false} /> };
}

function canGenerate(account: DemoAccount | null) {
  return account?.role === "payroll" || account?.role === "finance" ? null : "Payroll or finance generates WPS files";
}

function download(f: WpsFile) {
  const url = URL.createObjectURL(new Blob([wpsCsv(f)], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${f.id}-DEMO.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

function Sha({ file }: { file: WpsFile }) {
  const q = useQuery({ queryKey: ["wps-sha", file.id, file.rows.length], queryFn: () => sha256Hex(wpsCsv(file)), staleTime: Infinity });
  if (!q.data) return <Skeleton className="h-4 w-24" />;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="font-mono text-xs text-muted-foreground">
          {q.data.slice(0, 8)}…{q.data.slice(-6)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 font-mono text-[11px] break-all">SHA-256 {q.data}</TooltipContent>
    </Tooltip>
  );
}

function FileActions({ f }: { f: WpsFile }) {
  const sent = usePayrollAction(actions.markSent);
  const ack = usePayrollAction(actions.recordAcknowledgement);
  return (
    <div className="flex justify-end gap-1.5">
      {f.status === "generated" && (
        <Button size="xs" variant="outline" disabled={sent.isPending} onClick={() => sent.mutate({ fileId: f.id })}>
          <SendIcon data-icon="inline-start" /> Mark sent
        </Button>
      )}
      {f.status === "sent" && (
        <Button size="xs" variant="outline" disabled={ack.isPending} onClick={() => ack.mutate({ fileId: f.id })}>
          <CheckCheckIcon data-icon="inline-start" /> Record bank reply
        </Button>
      )}
      <Button size="icon-xs" variant="ghost" onClick={() => download(f)} aria-label={`Download ${f.id} (demo CSV)`}>
        <DownloadIcon />
      </Button>
    </div>
  );
}

const fcol = createColumns<WpsFile>();
const fileColumns = fcol.columns([
  fcol.accessor("id", {
    header: "File",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-mono text-xs font-medium">{row.original.id}</span>
        <span className="text-xs text-muted-foreground">{row.original.kind === "rejected_rows" ? `Rejected rows of ${row.original.parentFileId}` : "Full run"}</span>
      </div>
    ),
  }),
  fcol.accessor("periodName", {
    header: "Run · bank",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Link to={`/payroll/${row.original.runId}`} className="hover:underline">
          {row.original.periodName}
          {row.original.runKind !== "regular" && <span className="text-muted-foreground"> · {KIND_LABEL[row.original.runKind]}</span>}
        </Link>
        <span className="text-xs text-muted-foreground">Bank Muscat · template: {row.original.templateVersion}</span>
      </div>
    ),
  }),
  fcol.accessor((f) => f.rows.length, { id: "rows", header: () => <div className="text-end">Rows</div>, cell: (c) => <div className="text-end tabular-nums">{c.getValue()}</div> }),
  fcol.accessor("total", { header: () => <div className="text-end">Total (OMR)</div>, cell: (c) => <Money value={c.getValue()} bare className="font-medium" /> }),
  fcol.display({ id: "sha", header: "SHA-256", cell: ({ row }) => <Sha file={row.original} /> }),
  fcol.accessor("status", { header: "Status", cell: (c) => <StatusBadge tone={WPS_STATUS_TONE[c.getValue()]}>{WPS_STATUS_LABEL[c.getValue()]}</StatusBadge> }),
  fcol.accessor("generatedAt", {
    header: "Generated",
    cell: ({ row }) => (
      <div className="flex flex-col text-xs">
        <span className="tabular-nums">{displayMoment(row.original.generatedAt)}</span>
        <span className="text-muted-foreground">{accountName(row.original.generatedBy)}</span>
      </div>
    ),
  }),
  fcol.display({ id: "actions", header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <FileActions f={row.original} /> }),
]);

const rcol = createColumns<WpsResponse>();
const responseColumns = rcol.columns([
  rcol.accessor("fileId", { header: "File", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  rcol.accessor("workerName", {
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
  rcol.accessor("accountMask", { header: "Account", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  rcol.accessor("amount", { header: () => <div className="text-end">Amount</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
  rcol.accessor("reason", { header: "Bank's reason", cell: (c) => <span className="whitespace-normal">{c.getValue()}</span> }),
  rcol.accessor("resentInFileId", {
    header: "Resolution",
    cell: (c) => (c.getValue() ? <StatusBadge tone="ok">Resent in {c.getValue()}</StatusBadge> : <StatusBadge tone="expired">Open</StatusBadge>),
  }),
  rcol.display({
    id: "fix",
    header: () => <span className="sr-only">Fix</span>,
    cell: ({ row }) =>
      row.original.resentInFileId ? null : (
        <div className="flex justify-end">
          <Button size="xs" variant="outline" asChild>
            <Link to={`/workers/${row.original.workerId}`}>
              <WrenchIcon data-icon="inline-start" /> Worker file
            </Link>
          </Button>
        </div>
      ),
  }),
]);

export function WpsFiles() {
  const { account } = useSession();
  const q = useWpsFiles();
  const job = useWpsJob();
  const files = q.data?.files;
  const responses = q.data?.responses ?? [];
  const open = responses.filter((r) => !r.resentInFileId);
  const openFiles = [...new Set(open.map((r) => r.fileId))];
  const lastAck = files?.find((f) => f.status === "acknowledged");

  return (
    <Page>
      <PageHeader
        screen="S-25"
        sample
        title="WPS files"
        description="Salary files for Bank Muscat under the Wage Protection System. Each file's SHA-256 proves exactly which file went to the bank; rejected rows are fixed and re-sent on their own."
        actions={<GenerateDialog eligible={q.data?.eligible ?? []} job={job} account={account} />}
      />

      <Alert>
        <FileWarningIcon />
        <AlertTitle className="flex flex-wrap items-center gap-2">
          File template pending Bank Muscat's specification <StatusBadge tone="draft">template: draft (D8)</StatusBadge>
        </AlertTitle>
        <AlertDescription>
          The bank's salary information file (SIF) layout and test channel are an open decision (D8). Until then each file is a clearly marked demo CSV with masked accounts; it can't be uploaded for payment.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {files ? (
          <>
            <KpiCard label="Ready to generate" value={q.data!.eligible.length} footer={q.data!.eligible.length ? q.data!.eligible.map((r) => `${r.period.name} ${KIND_LABEL[r.kind].toLowerCase()}`).join(", ") : "Every approved run has a file"} hint="Approved or released runs without a file" />
            <KpiCard label="Rejected rows open" value={open.length} footer={open.length ? `OMR ${formatMoney(sumAmounts(open), { bare: true })} not yet paid` : "Nothing waiting on a fix"} hint={openFiles.length ? `On ${openFiles.join(", ")}` : "All rejections re-sent"} />
            <KpiCard label="Last acknowledged" value={lastAck?.id ?? "—"} footer={lastAck ? `${lastAck.rows.length} rows · ${formatMoney(lastAck.total)}` : undefined} hint={lastAck ? `${lastAck.periodName} · sent ${displayMoment(lastAck.sentAt)}` : undefined} />
          </>
        ) : (
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        )}
      </div>

      <section aria-labelledby="files-h" className="flex flex-col gap-3">
        <h2 id="files-h" className="text-base font-semibold">
          Files
        </h2>
        <DataTable
          label="WPS files"
          columns={fileColumns}
          data={files}
          loading={q.isPending}
          getRowId={(f) => f.id}
          search={(f, s) => f.id.toLowerCase().includes(s) || f.periodName.toLowerCase().includes(s)}
          searchPlaceholder="Filter by file or period…"
          empty="No WPS files yet. Generate one once a payroll run is approved."
        />
      </section>

      <section aria-labelledby="resp-h" className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="resp-h" className="text-base font-semibold">
              Bank responses: rejected rows
            </h2>
            <p className="text-sm text-muted-foreground">Fix each row in the worker file, then generate a new file for the rejected rows only. A paid run is never edited.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {openFiles.map((fid) => (
              <FixRejectedDialog key={fid} fileId={fid} rows={open.filter((r) => r.fileId === fid)} runId={files?.find((f) => f.id === fid)?.runId ?? ""} job={job} account={account} />
            ))}
          </div>
        </div>
        <DataTable label="Rejected rows" columns={responseColumns} data={q.data?.responses} loading={q.isPending} getRowId={(r) => r.id} empty="The bank hasn't rejected any rows." />
      </section>
      {job.loader}
    </Page>
  );
}

const sumAmounts = (rows: { amount: string }[]) => money.sum(rows.map((r) => r.amount));

function GenerateDialog({ eligible, job, account }: { eligible: PayrollRun[]; job: ReturnType<typeof useWpsJob>; account: DemoAccount | null }) {
  const [runId, setRunId] = useState<string>("");
  const [openState, setOpen] = useState(false);
  const run = eligible.find((r) => r.id === runId) ?? eligible[0];
  const why = canGenerate(account) ?? (eligible.length ? null : "No approved run is waiting for a file");
  return (
    <Dialog open={openState} onOpenChange={setOpen}>
      <WhyDisabled reason={why}>
        <DialogTrigger asChild>
          <Button disabled={!!why || job.busy}>
            <FileCogIcon data-icon="inline-start" /> Generate WPS file
          </Button>
        </DialogTrigger>
      </WhyDisabled>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a WPS file</DialogTitle>
          <DialogDescription>The file is validated, built and checksummed. Template: draft (D8), so the output is a demo CSV with masked accounts.</DialogDescription>
        </DialogHeader>
        {run && (
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="wps-run">Payroll run</Label>
              <Select value={run.id} onValueChange={setRunId}>
                <SelectTrigger id="wps-run" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.period.name} · {KIND_LABEL[r.kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <dl className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
              <dt className="text-muted-foreground">Salaries</dt>
              <dd className="text-end tabular-nums">{run.headcount}</dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd>
                <Money value={run.net!} />
              </dd>
              <dt className="text-muted-foreground">Bank</dt>
              <dd className="text-end">Bank Muscat</dd>
            </dl>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          {run && (
            <Button
              onClick={() => {
                setOpen(false);
                job.run({ runId: run.id, account });
              }}
            >
              Generate file for {run.headcount} salaries ({formatMoney(run.net!)})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FixRejectedDialog({ fileId, rows, runId, job, account }: { fileId: string; rows: WpsResponse[]; runId: string; job: ReturnType<typeof useWpsJob>; account: DemoAccount | null }) {
  const [openState, setOpen] = useState(false);
  const total = sumAmounts(rows);
  const why = canGenerate(account);
  return (
    <Dialog open={openState} onOpenChange={setOpen}>
      <WhyDisabled reason={why}>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={!!why || job.busy}>
            <WrenchIcon data-icon="inline-start" /> Fix rejected rows only · {fileId}
          </Button>
        </DialogTrigger>
      </WhyDisabled>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-send the rejected rows of {fileId}</DialogTitle>
          <DialogDescription>Correct each worker's bank details in their file first (a second person verifies bank changes). Only these rows go into the new file; the accepted rows are already paid.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <Link to={`/workers/${r.workerId}`} className="font-medium hover:underline">
                  {r.workerName}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-mono">{r.accountMask}</span> · {r.reason}
                </p>
              </div>
              <Money value={r.amount} className="shrink-0" />
            </li>
          ))}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => {
              setOpen(false);
              job.run({ runId, account, rejectedOf: fileId });
            }}
          >
            Generate file for {rows.length} rows ({formatMoney(total)})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
