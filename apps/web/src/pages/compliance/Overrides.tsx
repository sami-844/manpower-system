/**
 * S-11 Overrides (CLAUDE.md rule 5: an override is a record — who, why, until when — never a
 * silent bypass; rule 6: a second person approves). Approving calls the REAL
 * `POST /api/workers/:id/overrides` (`overrideSchema`), which the eligibility engine then honours
 * until `validUntil`. The API has no list endpoint yet, so the list is sample history plus every
 * override approved in this session.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DOCUMENT_TYPES, documentLabel, daysBetween, type DocumentType } from "@mms/core";
import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { displayDate, userLabel } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dates, todayOman } from "@/demo/core";
import {
  listOverrides,
  OVERRIDE_CODE_LABELS,
  OVERRIDE_CODES,
  OVERRIDES_QUERY_KEY,
  overrideState,
  recordApprovedOverride,
  requestOverride,
  type OverrideCode,
  type OverrideRecord,
  type OverrideState,
} from "@/demo/compliance";
import { useWorkforce } from "@/demo/workforce";
import { FieldErrors } from "@/components/FieldErrors";
import { Page, PageHeader } from "@/components/page-header";
import { createColumns, DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NativeSelect, WorkerPicker } from "../workforce/shared";

const VIEWS: { value: OverrideState | "all"; label: string }[] = [
  { value: "awaiting", label: "Awaiting approval" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "all", label: "All" },
];
const STATE_BADGE: Record<OverrideState, React.ReactNode> = {
  awaiting: <StatusBadge tone="due">Awaiting approval</StatusBadge>,
  active: <StatusBadge tone="ok">Active</StatusBadge>,
  ended: <StatusBadge tone="draft">Ended on its own</StatusBadge>,
};

interface Draft {
  mode: "approve" | "request";
  requestId?: string;
  requestedBy?: string;
  workerId: string | null;
  code: OverrideCode;
  documentType: DocumentType | "";
  validUntil: string;
  reason: string;
}

export function Overrides() {
  const { account } = useSession();
  const isOps = account?.role === "ops_manager";
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<OverrideState | "all">("active");
  const [draft, setDraft] = useState<Draft | null>(null);
  const workforce = useWorkforce();
  const q = useQuery({ queryKey: OVERRIDES_QUERY_KEY, queryFn: () => listOverrides(workforce.data ?? []), enabled: !!workforce.data });
  const today = todayOman();

  const blank = (mode: Draft["mode"], workerId: string | null = null): Draft => ({ mode, workerId, code: "DOCUMENT_EXPIRED", documentType: "", validUntil: dates.addDays(today, 7), reason: "" });

  // Arriving from a worker file or an eligibility result: open the form already filled in.
  useEffect(() => {
    const worker = params.get("worker");
    if (!worker) return;
    const code = params.get("code") as OverrideCode | null;
    const doc = params.get("doc") as DocumentType | null;
    setDraft({ ...blank(isOps ? "approve" : "request", worker), ...(code && OVERRIDE_CODES.includes(code) ? { code } : {}), ...(doc ? { documentType: doc } : {}) });
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per arrival link
  }, [params]);

  const all = q.data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { awaiting: 0, active: 0, ended: 0, all: 0 };
    for (const o of all) {
      c[overrideState(o, today)]! += 1;
      c.all! += 1;
    }
    return c;
  }, [all, today]);
  const rows = useMemo(() => all.filter((o) => view === "all" || overrideState(o, today) === view), [all, view, today]);

  const col = createColumns<OverrideRecord>();
  const columns = col.columns([
    col.accessor("workerName", {
      header: "Worker",
      cell: ({ row }) => (
        <div className="leading-tight">
          <Link to={`/workers/${row.original.workerId}`} className="font-medium hover:underline">
            {row.original.workerName}
          </Link>
          <div className="font-mono text-xs text-muted-foreground">{row.original.workerCode}</div>
        </div>
      ),
    }),
    col.accessor("code", {
      header: "Lifts",
      cell: ({ row }) => (
        <div className="leading-tight">
          <div>{OVERRIDE_CODE_LABELS[row.original.code]}</div>
          {row.original.documentType && <div className="text-xs text-muted-foreground">{documentLabel(row.original.documentType)}</div>}
        </div>
      ),
    }),
    col.accessor("reason", {
      header: "Reason",
      cell: (c) => (
        <p className="line-clamp-2 max-w-72 text-sm whitespace-normal" title={c.getValue()}>
          {c.getValue()}
        </p>
      ),
    }),
    col.accessor("requestedBy", {
      header: "Raised by",
      cell: ({ row }) => (
        <div className="leading-tight">
          <div>{userLabel(row.original.requestedBy)}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{displayDate(row.original.requestedOn)}</div>
        </div>
      ),
    }),
    col.accessor((o) => o.approvedBy ?? "", {
      id: "approvedBy",
      header: "Approved by",
      cell: ({ row }) =>
        row.original.approvedBy ? (
          <div className="leading-tight">
            <div>{userLabel(row.original.approvedBy)}</div>
            <div className="text-xs text-muted-foreground tabular-nums">{displayDate(row.original.approvedOn)}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    col.accessor("validUntil", {
      header: "Valid until",
      cell: ({ row }) => {
        const d = daysBetween(today, row.original.validUntil);
        return (
          <div className="leading-tight tabular-nums">
            <div>{displayDate(row.original.validUntil)}</div>
            <div className={cn("text-xs", d >= 0 && d <= 2 ? "text-warning-foreground dark:text-warning" : "text-muted-foreground")}>
              {d < 0 ? `Ended ${-d} ${d === -1 ? "day" : "days"} ago` : d === 0 ? "Ends tonight" : `Ends in ${d} ${d === 1 ? "day" : "days"}`}
            </div>
          </div>
        );
      },
    }),
    col.display({
      id: "state",
      header: "State",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          {STATE_BADGE[overrideState(row.original, today)]}
          {row.original.source === "api" && <span className="text-xs text-muted-foreground">Live in the engine</span>}
        </div>
      ),
    }),
    col.display({
      id: "act",
      header: () => <span className="sr-only">Approve</span>,
      cell: ({ row }) => {
        const o = row.original;
        if (o.approvedBy) return null;
        const own = account?.username === o.requestedBy;
        const why = !isOps ? "Only the operations manager approves overrides." : own ? "You raised this request; a second person must approve it." : null;
        const open = () => setDraft({ mode: "approve", requestId: o.id, requestedBy: o.requestedBy, workerId: o.workerId, code: o.code, documentType: o.documentType ?? "", validUntil: o.validUntil, reason: o.reason });
        return why ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button size="xs" variant="outline" disabled>
                  Approve
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>{why}</TooltipContent>
          </Tooltip>
        ) : (
          <Button size="xs" onClick={open} aria-label={`Review and approve override for ${o.workerName}`}>
            Approve
          </Button>
        );
      },
    }),
  ]);

  return (
    <Page>
      <PageHeader
        screen="S-11"
        sample
        title="Overrides"
        description="Dated exceptions that let a worker be deployed despite one named blocker. HR raises the request, the operations manager approves it, and it ends on its own at midnight on the end date."
        actions={
          <>
            {!isOps && (
              <Button variant="outline" onClick={() => setDraft(blank("request"))}>
                <ShieldAlertIcon aria-hidden />
                Request override
              </Button>
            )}
            {isOps ? (
              <Button onClick={() => setDraft(blank("approve"))}>
                <ShieldCheckIcon aria-hidden />
                Approve override
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button disabled>
                      <ShieldCheckIcon aria-hidden />
                      Approve override
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">Only the operations manager approves overrides (four eyes). Raise a request and it goes to them.</TooltipContent>
              </Tooltip>
            )}
          </>
        }
      />

      <DataTable
        label="Overrides"
        columns={columns}
        data={rows}
        loading={q.isPending}
        getRowId={(o) => o.id}
        search={(o, s) => o.workerName.toLowerCase().includes(s) || o.workerCode.toLowerCase().includes(s) || o.reason.toLowerCase().includes(s)}
        searchPlaceholder="Search worker or reason"
        toolbar={
          <div className="inline-flex flex-wrap rounded-lg border bg-muted p-0.5" role="group" aria-label="Show">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                aria-pressed={view === v.value}
                onClick={() => setView(v.value)}
                className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50", view === v.value && "bg-background text-foreground shadow-sm")}
              >
                {v.label}
                <span className="text-xs tabular-nums opacity-70">{q.isPending ? "" : counts[v.value]}</span>
              </button>
            ))}
          </div>
        }
        empty={
          view === "awaiting"
            ? "No requests waiting. HR raises one from a worker's eligibility check when a paper can't be fixed in time."
            : view === "active"
              ? "No active overrides. Every deployed worker is covered by their own papers."
              : "No overrides yet."
        }
      />

      {draft && <OverrideDialog key={draft.requestId ?? draft.mode} draft={draft} onClose={() => setDraft(null)} workers={workforce.data} />}
    </Page>
  );
}

function OverrideDialog({ draft: initial, onClose, workers }: { draft: Draft; onClose: () => void; workers: ReturnType<typeof useWorkforce>["data"] }) {
  const qc = useQueryClient();
  const { account } = useSession();
  const [d, setD] = useState(initial);
  const [touched, setTouched] = useState(false);
  const today = todayOman();
  const worker = workers?.find((w) => w.id === d.workerId);
  const approving = d.mode === "approve";

  const save = useMutation({
    mutationFn: async () => {
      const common = { workerName: worker!.fullName, workerCode: worker!.code, workerId: worker!.id, code: d.code, documentType: d.documentType || null, validUntil: d.validUntil, reason: d.reason.trim() };
      if (!approving) return requestOverride({ ...common, requestedBy: account?.username ?? "hr.officer" }, workers ?? []);
      await api.post(`/api/workers/${worker!.id}/overrides`, { code: d.code, ...(d.documentType ? { documentType: d.documentType } : {}), validUntil: d.validUntil, reason: d.reason.trim() });
      return recordApprovedOverride({ ...common, approvedBy: account!.username, requestId: d.requestId }, workers ?? []);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: OVERRIDES_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["worker", d.workerId] });
      void qc.invalidateQueries({ queryKey: ["audit", d.workerId] });
      toast.success(approving ? `Override approved for ${worker!.fullName}` : `Override requested for ${worker!.fullName}`, {
        description: approving ? `Lifts “${OVERRIDE_CODE_LABELS[d.code].toLowerCase()}” until ${displayDate(d.validUntil)}, then ends on its own.` : "Sent to the operations manager for approval.",
      });
      onClose();
    },
  });

  const errors = {
    worker: !d.workerId ? "Choose the worker" : null,
    validUntil: !d.validUntil ? "Give an end date" : d.validUntil < today ? "An override cannot end in the past" : null,
    reason: d.reason.trim().length < 5 ? "Give a reason of at least 5 characters" : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const days = d.validUntil >= today ? daysBetween(today, d.validUntil) + 1 : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{approving ? "Approve override" : "Request override"}</DialogTitle>
          <DialogDescription>
            {approving
              ? "Lifts one blocker for one worker until the end date. Recorded in the audit trail with your name and reason."
              : "Goes to the operations manager. Nothing changes until they approve it."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!invalid) save.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="ov-worker">Worker</Label>
            {d.requestId ? (
              <p className="text-sm font-medium">
                {worker?.fullName} <span className="font-mono text-xs text-muted-foreground">{worker?.code}</span>
              </p>
            ) : (
              <WorkerPicker id="ov-worker" workers={workers} loading={!workers} value={d.workerId} invalid={touched && !!errors.worker} onChange={(w) => setD({ ...d, workerId: w.id })} />
            )}
            {touched && errors.worker && <p className="text-xs text-destructive">{errors.worker}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ov-code">Blocker to lift</Label>
              <NativeSelect id="ov-code" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value as OverrideCode })}>
                {OVERRIDE_CODES.map((c) => (
                  <option key={c} value={c}>
                    {OVERRIDE_CODE_LABELS[c]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ov-doc">Document</Label>
              <NativeSelect id="ov-doc" value={d.documentType} onChange={(e) => setD({ ...d, documentType: e.target.value as DocumentType | "" })}>
                <option value="">Any document</option>
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {documentLabel(t)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ov-until">Valid until</Label>
            <Input id="ov-until" type="date" min={today} value={d.validUntil} aria-invalid={(touched && !!errors.validUntil) || undefined} onChange={(e) => setD({ ...d, validUntil: e.target.value })} />
            <p className={cn("text-xs", touched && errors.validUntil ? "text-destructive" : "text-muted-foreground")}>
              {touched && errors.validUntil ? errors.validUntil : `Covers ${days} ${days === 1 ? "day" : "days"} and ends on its own. Keep it as short as the fix needs.`}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ov-reason">Reason</Label>
            <Textarea
              id="ov-reason"
              rows={3}
              maxLength={500}
              value={d.reason}
              aria-invalid={(touched && !!errors.reason) || undefined}
              onChange={(e) => setD({ ...d, reason: e.target.value })}
              placeholder="What is being done about the paper, and why the worker is needed before it is fixed."
            />
            {touched && errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
          </div>
          {approving && account && (
            <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
              Approving as <span className="font-medium">{account.displayName}</span> ({ROLE_LABELS[account.role]})
              {d.requestedBy ? (
                <>
                  {" "}
                  · raised by <span className="font-medium">{userLabel(d.requestedBy)}</span>
                </>
              ) : null}
              .
            </p>
          )}
          <FieldErrors error={save.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || (touched && invalid)}>
              {approving ? `Approve until ${displayDate(d.validUntil)}` : "Send request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
