/**
 * S-05 Workers list (App Flow screen inventory; PRD 4.1). Real API: every worker from
 * `GET /api/workers` (via `useWorkforce`), filtered here so each chip shows its count.
 * A row opens a quick view in a Sheet so the list and its filters stay in place (Design Brief).
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { documentLabel, type DocumentType } from "@mms/core";
import { ArrowUpRightIcon, DownloadIcon, IdCardIcon, MapPinIcon, PlusIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { api, type WorkerDetail, type WorkerListItem } from "@/lib/api";
import { describeExpiry, displayDate, maskTail, renewalTone, statusLabel, statusTone, workerTag } from "@/lib/format";
import { cn } from "@/lib/utils";
import { siteOf, useWorkforce } from "@/demo/workforce";
import type { Site } from "@/demo/reference";
import { Page, PageHeader } from "@/components/page-header";
import { createColumns, DataTable } from "@/components/data-table";
import { ComplianceBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkerStatusText } from "./workforce/shared";

const PAPER_FILTERS = [
  { value: "", label: "All" },
  { value: "ok", label: "In order" },
  { value: "due", label: "Renewal due" },
  { value: "expired", label: "Expired" },
  { value: "incomplete", label: "Papers missing" },
] as const;

const ALL = "all";
type Row = WorkerListItem & { site: Site | null };

function nextExpiryText(w: WorkerListItem) {
  if (w.compliance.missing.length > 0) return { main: `Missing ${w.compliance.missing.map(documentLabel).join(", ").toLowerCase()}`, sub: null, short: null };
  const next = w.compliance.nextExpiry;
  if (!next) return { main: "—", sub: null, short: null };
  const d = next.daysLeft;
  return { main: `${documentLabel(next.type)} · ${displayDate(next.expiryDate)}`, sub: describeExpiry(d), short: d < 0 ? `${-d}d ago` : d === 0 ? "today" : `in ${d}d` };
}

const col = createColumns<Row>();
const columns = col.columns([
  col.accessor("code", { header: "Code", cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.getValue()}</span> }),
  col.accessor("fullName", { header: "Name", cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
  col.accessor("trade", { header: "Trade" }),
  col.accessor("nationality", { header: "Nationality", cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span> }),
  col.accessor("status", { header: "Status", cell: (c) => <WorkerStatusText status={c.getValue()} /> }),
  col.accessor((r) => r.compliance.state, {
    id: "papers",
    header: "Papers",
    cell: ({ row }) => <ComplianceBadge state={row.original.compliance.state} daysLeft={row.original.compliance.nextExpiry?.daysLeft} />,
  }),
  col.accessor((r) => r.compliance.nextExpiry?.expiryDate ?? "", {
    id: "nextExpiry",
    header: "Next expiry",
    cell: ({ row }) => {
      const t = nextExpiryText(row.original);
      return (
        <span className="whitespace-nowrap text-sm" title={t.sub ?? undefined}>
          {t.main}
          {t.short && <span className="ms-1.5 text-xs text-muted-foreground tabular-nums">{t.short}</span>}
        </span>
      );
    },
  }),
  col.accessor((r) => r.site?.code ?? "", {
    id: "site",
    header: "Site",
    cell: ({ row }) =>
      row.original.site ? (
        <span className="inline-flex items-center gap-1 text-sm" title={row.original.site.name}>
          <MapPinIcon aria-hidden className="size-3 text-muted-foreground" />
          <span className="font-mono text-xs">{row.original.site.code}</span>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  }),
]);

function exportCsv(rows: Row[]) {
  const head = ["Code", "Name", "Trade", "Nationality", "Status", "Papers", "Next expiry", "Site"];
  const lines = rows.map((r) =>
    [r.code, r.fullName, r.trade, r.nationality, statusLabel(r.status), workerTag(r.compliance).label, r.compliance.nextExpiry?.expiryDate ?? "", r.site?.code ?? ""]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`)
      .join(","),
  );
  const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `workers-${rows.length}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export function Workers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // The paper chip is local state mirrored to the URL: React Router applies URL changes in a
  // transition, so the rows would otherwise lag the address bar for a frame (e2e reads both).
  const urlCompliance = params.get("compliance") ?? "";
  const [compliance, setCompliance] = useState(urlCompliance);
  useEffect(() => setCompliance(urlCompliance), [urlCompliance]);
  const status = params.get("status") ?? ALL;
  const trade = params.get("trade") ?? ALL;
  const [openId, setOpenId] = useState<string | null>(null);
  const workforce = useWorkforce();

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const all = useMemo<Row[]>(() => (workforce.data ?? []).map((w) => ({ ...w, site: siteOf(w) })), [workforce.data]);
  const trades = useMemo(() => [...new Set(all.map((w) => w.trade))].sort(), [all]);
  const statuses = useMemo(() => [...new Set(all.map((w) => w.status))], [all]);

  // Chip counts respect the other filters, so "Expired 12" means 12 rows when clicked.
  const { base, counts } = useMemo(() => {
    const base = all.filter((w) => (status === ALL || w.status === status) && (trade === ALL || w.trade === trade));
    const counts: Record<string, number> = { "": base.length, ok: 0, due: 0, expired: 0, incomplete: 0 };
    for (const w of base) counts[w.compliance.state]! += 1;
    return { base, counts };
  }, [all, status, trade]);
  const rows = useMemo(() => (compliance ? base.filter((w) => w.compliance.state === compliance) : base), [base, compliance]);
  const open = all.find((w) => w.id === openId) ?? null;

  return (
    <Page>
      <PageHeader
        screen="S-05"
        title="Workers"
        description="Everyone on the company's books, with their paper status at a glance. Open a row for a quick look; the full file has documents, assignments, pay and history."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/documents/upload">
                <UploadIcon aria-hidden />
                Upload scans
              </Link>
            </Button>
            <Button onClick={() => navigate("/workers/new")}>
              <PlusIcon aria-hidden />
              Add worker
            </Button>
          </>
        }
      />

      {workforce.isError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Couldn't load workers. Check the server is running, then reload.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by paper status">
          {PAPER_FILTERS.map((f) => {
            const pressed = compliance === f.value;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={pressed}
                onClick={() => {
                  setCompliance(f.value);
                  update("compliance", f.value);
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  pressed ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {f.label}
                <span aria-hidden className={cn("tabular-nums text-xs", pressed ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {workforce.isPending ? "…" : counts[f.value]}
                </span>
              </button>
            );
          })}
        </div>

        <DataTable
          label="Workers"
          columns={columns}
          data={rows}
          loading={workforce.isPending}
          getRowId={(r) => r.id}
          search={(r, q) => r.fullName.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.nationality.toLowerCase().includes(q)}
          searchPlaceholder="Search name, code or nationality"
          toolbar={
            <>
              <Select value={status} onValueChange={(v) => update("status", v)}>
                <SelectTrigger className="w-40" aria-label="Worker status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={trade} onValueChange={(v) => update("trade", v)}>
                <SelectTrigger className="w-44" aria-label="Trade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All trades</SelectItem>
                  {trades.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="ms-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">
                {workforce.isPending ? "Loading…" : `${rows.length} of ${all.length} workers`}
              </span>
            </>
          }
          empty={
            <div className="space-y-2">
              <p>No workers match these filters.</p>
              <Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </Button>
            </div>
          }
          onRowClick={(r) => setOpenId(r.id)}
          selectable
          bulkActions={(selected, clear) => (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  toast.success(`${selected.length} ID ${selected.length === 1 ? "card" : "cards"} sent to the print queue`, {
                    description: "The desktop app prints them silently; on the web the browser print dialog opens.",
                  });
                  clear();
                }}
              >
                <IdCardIcon aria-hidden />
                Print ID cards
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  exportCsv(selected);
                  toast.success(`Exported ${selected.length} workers to CSV`);
                }}
              >
                <DownloadIcon aria-hidden />
                Export
              </Button>
              <Button size="sm" variant="ghost" onClick={clear}>
                Clear selection
              </Button>
            </>
          )}
        />
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-lg">{open && <QuickView worker={open} />}</SheetContent>
      </Sheet>
    </Page>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-end text-sm font-medium">{children}</dd>
    </div>
  );
}

function QuickView({ worker }: { worker: Row }) {
  const detail = useQuery({ queryKey: ["worker", worker.id], queryFn: () => api.get<WorkerDetail>(`/api/workers/${worker.id}`) });
  const next = nextExpiryText(worker);
  return (
    <>
      <SheetHeader className="border-b pe-12">
        <SheetTitle className="text-lg">{worker.fullName}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{worker.code}</span>
          <span aria-hidden>·</span>
          <span>{worker.trade}</span>
          <span aria-hidden>·</span>
          <span>{worker.nationality}</span>
        </SheetDescription>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <WorkerStatusText status={worker.status} />
          <ComplianceBadge state={worker.compliance.state} daysLeft={worker.compliance.nextExpiry?.daysLeft} />
        </div>
      </SheetHeader>
      <Tabs defaultValue="overview" className="flex-1 overflow-y-auto p-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="papers">Papers</TabsTrigger>
          <TabsTrigger value="assignment">Assignment</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-2">
          <dl>
            <Fact label="Status">{statusLabel(worker.status)}</Fact>
            <Fact label="Trade">{worker.trade}</Fact>
            <Fact label="Nationality">{worker.nationality}</Fact>
            <Fact label="Phone">{detail.data ? (detail.data.phone ?? "—") : <Skeleton className="h-4 w-24" />}</Fact>
            <Fact label="Joined">{detail.data ? displayDate(detail.data.joinedOn) : <Skeleton className="h-4 w-20" />}</Fact>
            <Fact label="Next expiry">
              <span className="block">{next.main}</span>
              {next.sub && <span className="block text-xs font-normal text-muted-foreground">{next.sub}</span>}
            </Fact>
          </dl>
        </TabsContent>
        <TabsContent value="papers" className="pt-2">
          {detail.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : detail.data && detail.data.documents.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {detail.data.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{documentLabel(d.type as DocumentType)}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {maskTail(d.number)} · expires {displayDate(d.expiryDate)}
                    </div>
                  </div>
                  {d.renewal ? (
                    <StatusBadge tone={statusTone(renewalTone(d.renewal.state, d.renewal.daysLeft))}>
                      {d.renewal.state === "ok" ? "Valid" : describeExpiry(d.renewal.daysLeft)}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="incomplete">No expiry date</StatusBadge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No documents yet. Add the passport, residence visa, labour card and medical from the full file.</p>
          )}
        </TabsContent>
        <TabsContent value="assignment" className="pt-2">
          {worker.site ? (
            <dl>
              <Fact label="Site">{worker.site.name}</Fact>
              <Fact label="Site code">
                <span className="font-mono text-xs">{worker.site.code}</span>
              </Fact>
              <Fact label="City">{worker.site.city}</Fact>
              <Fact label="Supervisor">{worker.site.supervisor}</Fact>
            </dl>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Not on a site right now. {worker.status === "available" ? "Available for matching once the papers allow it." : `Status: ${statusLabel(worker.status)}.`}
            </p>
          )}
        </TabsContent>
      </Tabs>
      <SheetFooter className="border-t sm:flex-row sm:justify-end">
        <Button asChild>
          <Link to={`/workers/${worker.id}`}>
            Open full file
            <ArrowUpRightIcon aria-hidden className="rtl:-scale-x-100" />
          </Link>
        </Button>
      </SheetFooter>
    </>
  );
}
