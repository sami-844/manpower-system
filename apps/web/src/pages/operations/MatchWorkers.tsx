/**
 * S-16 Match workers (App Flow "client request to workers on site", steps 2–3; PRD 4.5 match
 * engine). Ranks the REAL workers of the line's trade: eligible first, then skill, camp distance
 * and basic wage. Ineligible workers stay visible, greyed, with the reason. Before saving, every
 * pick goes through the REAL compliance engine (`POST /api/compliance/check`); only workers it
 * clears are assigned (in-memory demo assignment store).
 */
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { documentLabel, type DocumentType } from "@mms/core";
import { ArrowLeftIcon, BanIcon, CheckIcon, CircleCheckIcon, ClipboardListIcon, InfoIcon, MapPinIcon, TriangleAlertIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { DataTable, createColumns } from "@/components/data-table";
import { Money } from "@/components/money";
import { ComplianceBadge, StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type EligibilityResult, type Site as ApiSite } from "@/lib/api";
import { displayDate, humaniseDates } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { CLIENTS_KEY } from "@/pages/commercial/Clients";
import { fetchClients, overLimit } from "@/demo/commercial";
import { OPS_KEY, REQUEST_STATUS, assignWorkers, rankCandidates, useAssignments, useRequests, type Candidate, type LineView, type RequestView } from "@/demo/operations";
import { clientById, siteById } from "@/demo/reference";
import { FillMeter } from "./Requests";

export function MatchWorkers() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const requests = useRequests();
  const req = requests.data?.find((r) => r.id === id);

  if (requests.isLoading) {
    return (
      <Page>
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </Page>
    );
  }
  if (!req) {
    return (
      <Page>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardListIcon />
            </EmptyMedia>
            <EmptyTitle>Request not found</EmptyTitle>
            <EmptyDescription>This request does not exist. Open matching from the requests list.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link to="/requests">Back to requests</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }
  const initialLine = req.lines.find((l) => l.id === params.get("line")) ?? req.lines.find((l) => l.filled < l.quantity) ?? req.lines[0]!;
  return <Matcher key={req.id} req={req} initialLine={initialLine.id} pick={params.get("pick")} />;
}

function Matcher({ req, initialLine, pick }: { req: RequestView; initialLine: string; pick: string | null }) {
  const [lineId, setLineId] = useState(initialLine);
  const line = req.lines.find((l) => l.id === lineId) ?? req.lines[0]!;
  const client = clientById(req.clientId);
  const site = siteById(req.siteId);
  const clients = useQuery({ queryKey: CLIENTS_KEY, queryFn: fetchClients });
  const balance = clients.data?.find((c) => c.id === req.clientId);
  const creditHold = client?.status === "on_hold" || (balance ? overLimit(balance.balance, balance) : false);

  return (
    <Page>
      <PageHeader
        screen="S-16"
        sample
        title="Match workers"
        description={
          <>
            <span className="font-mono">{req.reference}</span> ·{" "}
            <Link to={`/clients/${req.clientId}`} className="text-primary underline-offset-4 hover:underline">
              {client?.legalName}
            </Link>{" "}
            · {site?.name}, {site?.city}
          </>
        }
        meta={
          <>
            <StatusBadge tone={REQUEST_STATUS[req.status].tone}>{REQUEST_STATUS[req.status].label}</StatusBadge>
            <span className="text-xs text-muted-foreground">
              {req.filled} of {req.quantity} positions filled
            </span>
          </>
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/requests">
              <ArrowLeftIcon className="rtl:rotate-180" /> All requests
            </Link>
          </Button>
        }
      />

      {creditHold && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{client?.legalName} is on credit hold</AlertTitle>
          <AlertDescription>
            It is over its credit limit. You can prepare the match, but agree it with finance before the workers travel.{" "}
            <Link to={`/clients/${req.clientId}`}>Open the client file</Link>
          </AlertDescription>
        </Alert>
      )}

      {req.lines.length > 1 && (
        <Tabs value={line.id} onValueChange={setLineId}>
          <TabsList>
            {req.lines.map((l) => (
              <TabsTrigger key={l.id} value={l.id} className="px-3">
                {l.trade}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {l.filled}/{l.quantity}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <LineMatcher key={line.id} req={req} line={line} pick={pick} />
    </Page>
  );
}

const col = createColumns<Candidate>();

function LineMatcher({ req, line, pick }: { req: RequestView; line: LineView; pick: string | null }) {
  const qc = useQueryClient();
  const { account } = useSession();
  const asg = useAssignments();
  const workers = asg.workers;
  const site = siteById(req.siteId);
  const remaining = Math.max(line.quantity - line.filled, 0);

  const candidates = useMemo(() => (workers && asg.data ? rankCandidates(line, req.siteId, workers, asg.data) : undefined), [workers, asg.data, line, req.siteId]);
  const assigned = useMemo(() => asg.data?.filter((a) => a.lineId === line.id) ?? [], [asg.data, line.id]);
  const eligibleCount = candidates?.filter((c) => c.eligible).length ?? 0;

  const [picked, setPicked] = useState<Set<string>>(() => new Set(pick ? [pick] : []));
  const [showAll, setShowAll] = useState(true);
  const [results, setResults] = useState<{ c: Candidate; r: EligibilityResult }[] | null>(null);

  // Real site for the compliance engine, matched by code; demo-only sites are checked without one.
  const apiSites = useQuery({ queryKey: ["sites"], queryFn: () => api.get<{ items: ApiSite[] }>("/api/sites") });
  const apiSite = apiSites.data?.items.find((s) => s.code === site?.code);

  const pickedList = candidates?.filter((c) => picked.has(c.worker.id) && c.eligible) ?? [];
  const full = pickedList.length >= remaining;

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const check = useMutation({
    mutationFn: () =>
      Promise.all(
        pickedList.map(async (c) => ({
          c,
          r: await api.post<EligibilityResult>("/api/compliance/check", { workerId: c.worker.id, ...(apiSite ? { siteId: apiSite.id } : {}), from: line.startDate, to: line.endDate }),
        })),
      ),
    onSuccess: setResults,
    onError: (e) => toast.error("The compliance check could not run", { description: e instanceof Error ? e.message : "Check the server is running, then try again." }),
  });

  const cleared = results?.filter((x) => x.r.eligible) ?? [];
  const assign = useMutation({
    mutationFn: () =>
      assignWorkers(
        cleared.map(({ c }) => ({ worker: c.worker, siteId: req.siteId, requestId: req.id, lineId: line.id, startDate: line.startDate, endDate: line.endDate })),
        account?.username ?? "unknown",
        workers ?? [],
      ),
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: OPS_KEY });
      toast.success(`${n} ${n === 1 ? "worker" : "workers"} assigned to ${site?.name}`, {
        description: `${line.trade} from ${displayDate(line.startDate)}. They join the site's daily sheet and the roster.`,
      });
      setResults(null);
      setPicked(new Set());
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not assign"),
  });

  const columns = useMemo(
    () =>
      col.columns([
        col.display({
          id: "pick",
          header: () => <span className="sr-only">Pick</span>,
          cell: ({ row }) => {
            const c = row.original;
            const on = picked.has(c.worker.id);
            const disabled = !c.eligible || (!on && full);
            return (
              <Checkbox
                checked={on && c.eligible}
                disabled={disabled}
                onCheckedChange={(v) => toggle(c.worker.id, !!v)}
                onClick={(e) => e.stopPropagation()}
                aria-label={!c.eligible ? `${c.worker.fullName}: not eligible, ${c.reasons[0]}` : disabled ? `${c.worker.fullName}: every open position is already picked` : `Pick ${c.worker.fullName}`}
              />
            );
          },
        }),
        col.display({
          id: "worker",
          header: "Worker",
          cell: ({ row }) => {
            const c = row.original;
            return (
              <div className={cn("flex flex-col", !c.eligible && "opacity-60")}>
                <Link to={`/workers/${c.worker.id}`} className="font-medium underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {c.worker.fullName}
                </Link>
                <span className="font-mono text-xs text-muted-foreground">
                  {c.worker.code} · {c.worker.nationality}
                </span>
              </div>
            );
          },
        }),
        col.accessor("skill", { header: "Skill", cell: (x) => <span className={cn("tabular-nums", !x.row.original.eligible && "opacity-60")}>Level {x.getValue()}</span> }),
        col.accessor("km", {
          header: "Camp distance",
          cell: ({ row }) => (
            <div className={cn("flex flex-col", !row.original.eligible && "opacity-60")}>
              <span className="tabular-nums">{row.original.km} km</span>
              <span className="text-xs text-muted-foreground">{row.original.camp.name}</span>
            </div>
          ),
        }),
        col.accessor("wage", {
          header: () => <div className="text-end">Basic wage</div>,
          cell: ({ row }) => <Money value={row.original.wage} className={cn(!row.original.eligible && "opacity-60")} />,
        }),
        col.display({ id: "papers", header: "Papers", cell: ({ row }) => <ComplianceBadge state={row.original.worker.compliance.state} daysLeft={row.original.worker.compliance.nextExpiry?.daysLeft} /> }),
        col.display({
          id: "fit",
          header: "Fit for this request",
          cell: ({ row }) =>
            row.original.eligible ? (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <CheckIcon aria-hidden className="size-3.5" /> Eligible
              </span>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {row.original.reasons.map((r) => (
                  <li key={r} className="inline-flex items-start gap-1 text-xs text-destructive">
                    <BanIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            ),
        }),
      ]),
    // `toggle` uses functional setState, so it is safe to leave out of the deps.
    [picked, full],
  );

  const rows = showAll ? candidates : candidates?.filter((c) => c.eligible);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_18rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium">
              {line.quantity} × {line.trade} · <span className="capitalize">{line.shift}</span> shift
            </span>
            <span className="text-muted-foreground tabular-nums">
              {displayDate(line.startDate)} – {displayDate(line.endDate)} · skill level {line.skillLevelMin}+ · {remaining} {remaining === 1 ? "position" : "positions"} open
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm tabular-nums text-muted-foreground">
              Picked <span className="font-medium text-foreground">{pickedList.length}</span> of {remaining}
            </span>
            <Button disabled={pickedList.length === 0 || check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? <Spinner /> : <CircleCheckIcon />}
              {pickedList.length ? `Check papers and assign ${pickedList.length}` : "Pick workers to assign"}
            </Button>
          </div>
        </div>

        <DataTable
          label={`Workers for ${line.trade}`}
          columns={columns}
          data={rows}
          loading={!candidates}
          getRowId={(c) => c.worker.id}
          pageSize={50}
          search={(c, q) => c.worker.fullName.toLowerCase().includes(q) || c.worker.code.toLowerCase().includes(q) || c.camp.name.toLowerCase().includes(q)}
          searchPlaceholder="Filter by name, code or camp…"
          onRowClick={(c) => c.eligible && (picked.has(c.worker.id) || !full) && toggle(c.worker.id, !picked.has(c.worker.id))}
          toolbar={
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground tabular-nums">
                <span className="font-medium text-foreground">{eligibleCount}</span> eligible · {(candidates?.length ?? 0) - eligibleCount} not eligible
              </span>
              <div className="flex items-center gap-2">
                <Switch id="show-ineligible" checked={showAll} onCheckedChange={setShowAll} />
                <Label htmlFor="show-ineligible">Show workers who are not eligible</Label>
              </div>
            </div>
          }
          empty={
            <span>
              No {line.trade.toLowerCase()} is free for these dates. Offer the client a later start, or raise a recruitment need.
            </span>
          }
        />
      </div>

      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Already assigned</CardTitle>
            <CardDescription>
              <FillMeter filled={line.filled} quantity={line.quantity} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            {assigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody yet.</p>
            ) : (
              <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto text-sm">
                {assigned.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <Link to={`/workers/${a.workerId}`} className="truncate underline-offset-4 hover:underline">
                      {a.workerName}
                    </Link>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{a.workerCode}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <InfoIcon aria-hidden className="size-4 text-muted-foreground" />
              How workers are ranked
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ol className="list-decimal space-y-1 ps-4">
              <li>Eligible for the whole period (status, papers, leave, bookings)</li>
              <li>Skill level, highest first</li>
              <li>Distance from the worker's camp to the site</li>
              <li>Basic wage, lowest first</li>
            </ol>
            <p className="mt-3 flex items-start gap-1.5">
              <MapPinIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {apiSite
                ? `The compliance check also applies ${site?.name}'s own requirements${site?.requiredDocuments.length ? ` (${site.requiredDocuments.map((d) => documentLabel(d as DocumentType).toLowerCase()).join(", ")})` : ""}, which this list cannot see.`
                : `${site?.name} is not in the live system yet, so the check covers standard papers only.`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!results} onOpenChange={(o) => !o && setResults(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Compliance check</DialogTitle>
            <DialogDescription>
              {line.trade} at {site?.name}, {displayDate(line.startDate)} – {displayDate(line.endDate)}. Only workers the engine clears can be assigned.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[50vh] flex-col divide-y overflow-y-auto rounded-lg border">
            {results?.map(({ c, r }) => (
              <li key={c.worker.id} className="flex flex-col gap-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.worker.fullName}</span>
                  {r.eligible ? <StatusBadge tone="ok">Clear to deploy</StatusBadge> : <StatusBadge tone="blocked">Blocked</StatusBadge>}
                </div>
                {r.blockers.map((b) => (
                  <p key={b.code + (b.documentType ?? "")} className="flex items-start gap-1 text-xs text-destructive">
                    <BanIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
                    {humaniseDates(b.message)}
                  </p>
                ))}
                {r.warnings.map((w, i) => (
                  <p key={i} className="flex items-start gap-1 text-xs text-muted-foreground">
                    <TriangleAlertIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
                    {humaniseDates(w.message)}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          {results && cleared.length < results.length && (
            <p className="text-sm text-muted-foreground">Blocked workers stay unassigned. Fix their papers in the worker file, or ask the operations manager for an override.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResults(null)}>
              Back to the list
            </Button>
            <Button disabled={cleared.length === 0 || assign.isPending} onClick={() => assign.mutate()}>
              {assign.isPending && <Spinner />}
              {cleared.length ? `Assign ${cleared.length} ${cleared.length === 1 ? "worker" : "workers"} to ${site?.name}` : "Nobody cleared"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
