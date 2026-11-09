/**
 * S-09 Renewals (PRD 4.3 expiry engine, tiers 90/60/30/7). Real API: `GET /api/compliance/renewals`
 * (expired and due documents, most urgent first) joined with the real worker list for status and
 * site. "Start renewal" opens a government transaction (S-10, sample data until its API).
 */
import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { documentLabel } from "@mms/core";
import { ArrowUpRightIcon, PlayIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { api, type RenewalItem } from "@/lib/api";
import { describeExpiry, displayDate, renewalTone, statusTone } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { createGovTransaction, GOV_QUERY_KEY, GOV_STATUS_LABELS, GOV_TYPE_LABELS, listGovTransactions, renewalTypeFor } from "@/demo/compliance";
import { siteOf, useWorkforce } from "@/demo/workforce";
import type { Site } from "@/demo/reference";
import { Page, PageHeader } from "@/components/page-header";
import { createColumns, DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { WorkerStatusText } from "./workforce/shared";

const TIERS = [
  { key: "expired", label: "Expired", hint: "Blocked from rostering", test: (d: number) => d < 0 },
  { key: "7", label: "Within 7 days", hint: "Act today", test: (d: number) => d >= 0 && d <= 7 },
  { key: "30", label: "8–30 days", hint: "Submit this week", test: (d: number) => d > 7 && d <= 30 },
  { key: "60", label: "31–60 days", hint: "Prepare papers", test: (d: number) => d > 30 && d <= 60 },
  { key: "90", label: "61–90 days", hint: "On the radar", test: (d: number) => d > 60 && d <= 90 },
] as const;

type Row = RenewalItem & { status: string | null; site: Site | null; renewal: { id: string; label: string } | null };

export function Renewals() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { account } = useSession();
  const [params, setParams] = useSearchParams();
  const tier = params.get("tier") ?? "";
  const deployedOnly = params.get("deployed") === "1";
  const q = useQuery({ queryKey: ["renewals"], queryFn: () => api.get<{ items: RenewalItem[] }>("/api/compliance/renewals") });
  const workforce = useWorkforce();
  const gov = useQuery({ queryKey: GOV_QUERY_KEY, queryFn: () => listGovTransactions(workforce.data ?? []), enabled: !!workforce.data });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const all = useMemo<Row[]>(() => {
    const byId = new Map((workforce.data ?? []).map((w) => [w.id, w]));
    const openByWorkerType = new Map<string, { id: string; label: string }>();
    for (const t of gov.data ?? []) {
      if (t.status === "completed" || t.status === "rejected") continue;
      openByWorkerType.set(`${t.workerId}:${t.type}`, { id: t.id, label: `${GOV_TYPE_LABELS[t.type]} · ${GOV_STATUS_LABELS[t.status]}` });
    }
    return (q.data?.items ?? []).map((r) => {
      const w = byId.get(r.workerId);
      const type = renewalTypeFor(r.type);
      return { ...r, status: w?.status ?? null, site: w ? siteOf(w) : null, renewal: type ? (openByWorkerType.get(`${r.workerId}:${type}`) ?? null) : null };
    });
  }, [q.data, workforce.data, gov.data]);

  const counts = useMemo(() => TIERS.map((t) => all.filter((r) => t.test(r.daysLeft)).length), [all]);
  const deployedExpired = all.filter((r) => r.daysLeft < 0 && r.status === "deployed");
  const rows = useMemo(() => {
    const t = TIERS.find((x) => x.key === tier);
    return all.filter((r) => (!t || t.test(r.daysLeft)) && (!deployedOnly || r.status === "deployed"));
  }, [all, tier, deployedOnly]);

  const start = useMutation({
    mutationFn: (r: Row) =>
      createGovTransaction({
        worker: { id: r.workerId, fullName: r.workerName, code: r.workerCode },
        type: renewalTypeFor(r.type)!,
        documentId: r.id,
        documentType: r.type,
        createdBy: account?.username ?? "hr.officer",
        allWorkers: workforce.data ?? [],
      }),
    onSuccess: (tx) => {
      void qc.invalidateQueries({ queryKey: GOV_QUERY_KEY });
      toast.success(`${GOV_TYPE_LABELS[tx.type]} started for ${tx.workerName}`, {
        description: "Draft application waiting on the company: prepare it and pay the fee.",
        action: { label: "Open", onClick: () => navigate("/gov-transactions") },
      });
    },
  });

  const col = createColumns<Row>();
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
    col.accessor("type", { header: "Document", cell: (c) => documentLabel(c.getValue()) }),
    col.accessor("expiryDate", { header: "Expires", cell: (c) => <span className="tabular-nums">{displayDate(c.getValue())}</span> }),
    col.accessor("daysLeft", {
      header: "Urgency",
      cell: ({ row }) => <StatusBadge tone={statusTone(renewalTone(row.original.state, row.original.daysLeft))}>{describeExpiry(row.original.daysLeft)}</StatusBadge>,
    }),
    col.accessor((r) => r.status ?? "", {
      id: "where",
      header: "Worker status",
      cell: ({ row }) => {
        const r = row.original;
        if (!r.status) return <span className="text-muted-foreground">—</span>;
        const risky = r.status === "deployed" && r.daysLeft < 0;
        return (
          <div className="leading-tight">
            <WorkerStatusText status={r.status} />
            {r.site && (
              <div className={cn("flex items-center gap-1 text-xs", risky ? "font-medium text-destructive" : "text-muted-foreground")}>
                {risky && <TriangleAlertIcon aria-hidden className="size-3" />}
                {risky ? "On site with expired paper · " : ""}
                <span className="font-mono">{r.site.code}</span>
              </div>
            )}
          </div>
        );
      },
    }),
    col.display({
      id: "action",
      header: () => <span className="sr-only">Renewal</span>,
      cell: ({ row }) => {
        const r = row.original;
        if (r.renewal)
          return (
            <Link to="/gov-transactions" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              {r.renewal.label}
              <ArrowUpRightIcon aria-hidden className="size-3 rtl:-scale-x-100" />
            </Link>
          );
        if (!renewalTypeFor(r.type)) return <span className="text-xs text-muted-foreground">Worker renews directly</span>;
        return (
          <Button size="xs" variant="outline" disabled={start.isPending || !workforce.data} onClick={() => start.mutate(r)} aria-label={`Start renewal for ${r.workerName}, ${documentLabel(r.type)}`}>
            <PlayIcon aria-hidden />
            Start renewal
          </Button>
        );
      },
    }),
  ]);

  return (
    <Page>
      <PageHeader
        screen="S-09"
        title="Renewals"
        description="Expired documents and everything expiring in the next 90 days, most urgent first. Alert tiers follow the expiry engine (90 / 60 / 30 / 7 days)."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Filter by urgency">
        {TIERS.map((t, i) => {
          const pressed = tier === t.key;
          const urgent = i < 2;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={pressed}
              onClick={() => update("tier", pressed ? "" : t.key)}
              className={cn(
                "group flex flex-col items-start gap-1 rounded-xl border bg-card p-3 text-start shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                pressed && "border-primary ring-1 ring-primary",
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span aria-hidden className={cn("size-2 rounded-full", i === 0 ? "bg-destructive" : i <= 2 ? "bg-warning" : "bg-muted-foreground/50")} />
                {t.label}
              </span>
              <span className={cn("text-2xl font-semibold tabular-nums", urgent && counts[i]! > 0 && "text-destructive")}>{q.isPending ? "…" : counts[i]}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </button>
          );
        })}
      </div>

      {deployedExpired.length > 0 && (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <TriangleAlertIcon aria-hidden />
          <AlertTitle>
            {deployedExpired.length} deployed {deployedExpired.length === 1 ? "worker has" : "workers have"} an expired paper
          </AlertTitle>
          <AlertDescription>
            <p>They can't be rostered for new dates and are flagged in payroll until the paper is renewed and verified, or an operations manager approves a dated override.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => setParams({ tier: "expired", deployed: "1" }, { replace: true })}>
              Show them
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        label="Renewals"
        columns={columns}
        data={rows}
        loading={q.isPending}
        getRowId={(r) => r.id}
        search={(r, s) => r.workerName.toLowerCase().includes(s) || r.workerCode.toLowerCase().includes(s)}
        searchPlaceholder="Search worker or code"
        toolbar={
          <div className="flex items-center gap-2">
            <Switch id="deployed-only" checked={deployedOnly} onCheckedChange={(v) => update("deployed", v ? "1" : "")} />
            <Label htmlFor="deployed-only" className="text-sm font-normal">
              Deployed workers only
            </Label>
            {(tier || deployedOnly) && (
              <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </Button>
            )}
            <span className="ms-2 text-sm text-muted-foreground tabular-nums">{q.isPending ? "" : `${rows.length} documents`}</span>
          </div>
        }
        empty={q.isError ? "Couldn't load renewals. Check the server is running, then reload." : "Nothing in this tier. Every paper here is valid for more than 90 days."}
        pageSize={50}
      />
    </Page>
  );
}
