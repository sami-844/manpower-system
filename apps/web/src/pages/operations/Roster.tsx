/**
 * S-17 Roster board (PRD 4.5: workers × days by site, drag to assign, colour by status, conflicts
 * flagged before saving; App Flow step 3: every assignment is checked by the compliance engine).
 *
 * Rows are the REAL workers deployed on the site (demo site mapping) plus assignments saved in
 * this session. Blocked days come from each worker's real compliance summary; leave is demo data.
 * Dropping a bench worker stages an assignment, runs the REAL `POST /api/compliance/check` and the
 * local leave / double-booking checks, and only clean ones are saved. Oman's weekend is Fri–Sat.
 * ~120 rows: each row is memoised and uses `content-visibility: auto`, so off-screen rows cost
 * nothing to paint.
 */
import { memo, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { documentLabel, rangesOverlap } from "@mms/core";
import { BanIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, GripVerticalIcon, PlusIcon, SearchIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { ComplianceBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, type EligibilityResult, type Site as ApiSite, type WorkerListItem } from "@/lib/api";
import { displayDate, humaniseDates } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dates, todayOman } from "@/demo/core";
import { OPS_KEY, assignWorkers, benchOf, demoLeave, papersProblem, useAssignments } from "@/demo/operations";
import { SITES, TRADES, siteById } from "@/demo/reference";
import { daysIdle, siteOf } from "@/demo/workforce";

type CellState = "site" | "rest" | "leave" | "blocked" | "none";

const CELL: Record<Exclude<CellState, "none">, { label: string; letter: string; className: string }> = {
  site: { label: "On site", letter: "", className: "bg-success/25 dark:bg-success/30" },
  rest: { label: "Rest day", letter: "R", className: "bg-muted text-muted-foreground" },
  leave: { label: "Leave", letter: "L", className: "bg-warning/35 text-warning-foreground dark:text-warning" },
  blocked: { label: "Blocked (papers)", letter: "B", className: "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/40" },
};

/** Why a worker cannot work on a day, from the real compliance summary. */
function blockedReason(w: WorkerListItem, day: string): string | null {
  const c = w.compliance;
  if (c.missing.length) return `Missing ${c.missing.map(documentLabel).join(", ").toLowerCase()}`;
  if (c.nextExpiry && day > c.nextExpiry.expiryDate) return `${documentLabel(c.nextExpiry.type)} expired ${displayDate(c.nextExpiry.expiryDate)}`;
  return null;
}

function cellFor(w: WorkerListItem, day: string, from?: string, to?: string): CellState {
  if ((from && day < from) || (to && day > to)) return "none";
  if (blockedReason(w, day)) return "blocked";
  const leave = demoLeave(w);
  if (leave && day >= leave.from && day <= leave.to) return "leave";
  return dates.isWeekend(day) ? "rest" : "site";
}

interface Staged {
  worker: WorkerListItem;
  siteId: string;
  from: string;
  to: string;
  checking: boolean;
  conflicts: string[];
  warnings: string[];
}

const GRID = "grid grid-cols-[minmax(11rem,14rem)_repeat(14,minmax(2.25rem,1fr))]";
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const dayName = (d: string) => WEEKDAY.format(new Date(`${d}T00:00:00Z`));

export function Roster() {
  const qc = useQueryClient();
  const { account } = useSession();
  const [params, setParams] = useSearchParams();
  const siteId = siteById(params.get("site") ?? "")?.id ?? SITES[0]!.id;
  const site = siteById(siteId)!;
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [benchQuery, setBenchQuery] = useState("");
  const [benchTrade, setBenchTrade] = useState("all");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [dragging, setDragging] = useState<WorkerListItem | null>(null);
  const [saving, setSaving] = useState(false);

  const asg = useAssignments();
  const workers = asg.workers;
  const apiSites = useQuery({ queryKey: ["sites"], queryFn: () => api.get<{ items: ApiSite[] }>("/api/sites") });

  const today = todayOman();
  const start = dates.addDays(today, -dates.weekday(today) + offset * 14);
  const days = useMemo(() => dates.range(start, dates.addDays(start, 13)), [start]);

  // Crew: real deployed workers on this site, then workers assigned here in this session.
  const crew = useMemo(() => {
    if (!workers || !asg.data) return undefined;
    const rows: { w: WorkerListItem; from?: string; to?: string }[] = workers.filter((w) => siteOf(w)?.id === siteId).map((w) => ({ w }));
    const seen = new Set(rows.map((r) => r.w.id));
    const byId = new Map(workers.map((w) => [w.id, w]));
    for (const a of asg.data) {
      const w = byId.get(a.workerId);
      if (a.siteId === siteId && w && !seen.has(w.id)) {
        seen.add(w.id);
        rows.push({ w, from: a.startDate, to: a.endDate });
      }
    }
    // New this session first, so a saved assignment is visible straight away.
    return rows.sort((a, b) => Number(!!b.from) - Number(!!a.from) || a.w.trade.localeCompare(b.w.trade) || a.w.fullName.localeCompare(b.w.fullName));
  }, [workers, asg.data, siteId]);

  const shownCrew = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? crew?.filter((r) => r.w.fullName.toLowerCase().includes(q) || r.w.code.toLowerCase().includes(q) || r.w.trade.toLowerCase().includes(q)) : crew;
  }, [crew, query]);

  const onSiteByDay = useMemo(() => days.map((d) => crew?.filter((r) => cellFor(r.w, d, r.from, r.to) === "site").length ?? 0), [crew, days]);
  const blockedCount = useMemo(() => crew?.filter((r) => days.some((d) => cellFor(r.w, d, r.from, r.to) === "blocked")).length ?? 0, [crew, days]);

  const stagedIds = new Set(staged.map((s) => s.worker.id));
  const bench = useMemo(() => {
    if (!workers || !asg.data) return undefined;
    const q = benchQuery.trim().toLowerCase();
    return benchOf(workers, asg.data)
      .filter((w) => (benchTrade === "all" || w.trade === benchTrade) && (!q || w.fullName.toLowerCase().includes(q) || w.code.toLowerCase().includes(q)))
      .sort((a, b) => daysIdle(b) - daysIdle(a));
  }, [workers, asg.data, benchQuery, benchTrade]);

  const here = staged.filter((s) => s.siteId === siteId);
  const ready = here.filter((s) => !s.checking && s.conflicts.length === 0);
  const blockedStaged = here.filter((s) => !s.checking && s.conflicts.length > 0);

  async function stage(w: WorkerListItem) {
    if (stagedIds.has(w.id)) {
      toast.info(`${w.fullName} is already staged for ${siteById(staged.find((s) => s.worker.id === w.id)!.siteId)?.name}.`);
      return;
    }
    const from = dates.addDays(today, 1);
    const to = dates.addDays(from, 89);
    // Local checks the engine does not know about: demo leave and bookings made in this session.
    const local: string[] = [];
    const leave = demoLeave(w);
    if (leave && rangesOverlap(leave, { from, to })) local.push(`On leave ${displayDate(leave.from)} – ${displayDate(leave.to)}`);
    const clash = asg.data?.find((a) => a.workerId === w.id && rangesOverlap({ from: a.startDate, to: a.endDate }, { from, to }));
    if (clash) local.push(`Double booking: already at ${siteById(clash.siteId)?.name} from ${displayDate(clash.startDate)}`);
    const papers = papersProblem(w, to);
    const conflicts = papers ? [papers, ...local] : local;
    setStaged((p) => [...p, { worker: w, siteId, from, to, checking: true, conflicts, warnings: [] }]);

    const apiSite = apiSites.data?.items.find((s) => s.code === site.code);
    try {
      const r = await api.post<EligibilityResult>("/api/compliance/check", { workerId: w.id, ...(apiSite ? { siteId: apiSite.id } : {}), from, to });
      const engine = r.blockers.map((b) => humaniseDates(b.message));
      // The engine is the authority on papers; the local preview is replaced by its verdict.
      setStaged((p) => p.map((s) => (s.worker.id === w.id ? { ...s, checking: false, conflicts: [...engine, ...local], warnings: r.warnings.map((x) => humaniseDates(x.message)) } : s)));
    } catch (e) {
      setStaged((p) => p.map((s) => (s.worker.id === w.id ? { ...s, checking: false, conflicts: [...s.conflicts, `Compliance check failed: ${e instanceof Error ? e.message : "server unavailable"}`] } : s)));
    }
  }

  async function save() {
    if (!workers || ready.length === 0) return;
    setSaving(true);
    try {
      const n = await assignWorkers(
        ready.map((s) => ({ worker: s.worker, siteId: s.siteId, requestId: null, lineId: null, startDate: s.from, endDate: s.to })),
        account?.username ?? "unknown",
        workers,
      );
      const savedIds = new Set(ready.map((s) => s.worker.id));
      setStaged((p) => p.filter((s) => !savedIds.has(s.worker.id)));
      await qc.invalidateQueries({ queryKey: OPS_KEY });
      toast.success(`${n} ${n === 1 ? "assignment" : "assignments"} saved for ${site.name}`, { description: `From ${displayDate(dates.addDays(today, 1))}. They appear on tomorrow's daily sheet.` });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const w = e.active.data.current?.worker as WorkerListItem | undefined;
    if (e.over?.id === "roster" && w) void stage(w);
  };

  return (
    <Page>
      <PageHeader
        screen="S-17"
        sample
        title="Roster board"
        description="Who works where, day by day. Drag a worker from the bench onto the board to assign them; every assignment is checked before it is saved."
        actions={
          <>
            {blockedStaged.length > 0 && <span className="text-sm text-destructive">{blockedStaged.length === 1 ? "1 conflict to resolve" : `${blockedStaged.length} conflicts to resolve`}</span>}
            <Button disabled={ready.length === 0 || saving} onClick={() => void save()}>
              {saving && <Spinner />}
              {ready.length ? `Save ${ready.length} ${ready.length === 1 ? "assignment" : "assignments"}` : "No changes to save"}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={siteId} onValueChange={(v) => setParams({ site: v }, { replace: true })}>
          <SelectTrigger className="w-full sm:w-72" aria-label="Site">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SITES.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} <span className="text-muted-foreground">· {s.code}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous two weeks" onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeftIcon className="rtl:rotate-180" />
          </Button>
          <span className="min-w-44 text-center text-sm font-medium tabular-nums">
            {displayDate(days[0])} – {displayDate(days[13])}
          </span>
          <Button variant="outline" size="icon-sm" aria-label="Next two weeks" onClick={() => setOffset((o) => o + 1)}>
            <ChevronRightIcon className="rtl:rotate-180" />
          </Button>
          {offset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setOffset(0)}>
              This fortnight
            </Button>
          )}
        </div>
        <InputGroup className="w-full sm:ms-auto sm:w-60">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find on this site…" aria-label="Find a worker on this site" />
        </InputGroup>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Legend">
        {Object.entries(CELL).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-flex size-4 items-center justify-center rounded-sm text-[10px] font-semibold", v.className)}>{v.letter}</span>
            {v.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex size-4 rounded-sm border border-dashed border-primary bg-primary/10" />
          Staged, not saved
        </span>
        <span className="ms-auto tabular-nums">
          {crew ? `${crew.length} workers · ${blockedCount} with blocked days in view` : ""} · Weekend is Friday and Saturday
        </span>
      </div>

      <DndContext sensors={sensors} onDragStart={(e) => setDragging((e.active.data.current?.worker as WorkerListItem) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <Board
            siteName={site.name}
            days={days}
            today={today}
            loading={!shownCrew}
            crew={shownCrew ?? []}
            staged={here}
            onSiteByDay={onSiteByDay}
            onUnstage={(id) => setStaged((p) => p.filter((s) => s.worker.id !== id))}
            dragging={!!dragging}
          />
          <section aria-label="Bench" className="flex min-h-0 flex-col gap-3 rounded-lg border bg-card p-3 xl:max-h-[calc(100svh-14rem)]">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Bench</h2>
              <Link to="/bench" className="text-xs text-primary underline-offset-4 hover:underline">
                {bench ? `${bench.length} available` : "Available"}
              </Link>
            </div>
            <div className="flex gap-2">
              <InputGroup className="flex-1">
                <InputGroupInput value={benchQuery} onChange={(e) => setBenchQuery(e.target.value)} placeholder="Name or code" aria-label="Filter the bench" />
              </InputGroup>
              <Select value={benchTrade} onValueChange={setBenchTrade}>
                <SelectTrigger className="w-32" aria-label="Trade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All trades</SelectItem>
                  {TRADES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ul className="-me-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pe-1" aria-label="Workers on the bench">
              {!bench
                ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 rounded-md" />)
                : bench.length === 0
                  ? <li className="py-6 text-center text-sm text-muted-foreground">Nobody on the bench matches. Clear the filter or choose another trade.</li>
                  : bench.slice(0, 80).map((w) => <BenchCard key={w.id} worker={w} staged={stagedIds.has(w.id)} onAssign={() => void stage(w)} siteName={site.name} />)}
            </ul>
            {bench && bench.length > 80 && <p className="text-xs text-muted-foreground">Showing the 80 longest idle. Filter by trade to see the rest.</p>}
          </section>
        </div>
        <DragOverlay dropAnimation={null}>{dragging ? <BenchCardBody worker={dragging} className="w-64 shadow-lg ring-2 ring-primary" /> : null}</DragOverlay>
      </DndContext>
    </Page>
  );
}

function Board({
  siteName,
  days,
  today,
  loading,
  crew,
  staged,
  onSiteByDay,
  onUnstage,
  dragging,
}: {
  siteName: string;
  days: string[];
  today: string;
  loading: boolean;
  crew: { w: WorkerListItem; from?: string; to?: string }[];
  staged: Staged[];
  onSiteByDay: number[];
  onUnstage: (id: string) => void;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "roster" });
  return (
    <div ref={setNodeRef} className={cn("relative min-w-0 overflow-hidden rounded-lg border bg-card", isOver && "ring-2 ring-primary", dragging && !isOver && "ring-1 ring-primary/40")}>
      {dragging && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-2">
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">Drop to assign to {siteName}</span>
        </div>
      )}
      <div className="max-h-[calc(100svh-17rem)] overflow-auto" role="table" aria-label={`Roster for ${siteName}`} aria-busy={loading}>
        <div className="min-w-[46rem]">
          <div role="row" className={cn(GRID, "sticky top-0 z-20 border-b bg-muted")}>
            <div role="columnheader" className="sticky start-0 z-10 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
              Worker
            </div>
            {days.map((d) => (
              <div role="columnheader" key={d} className={cn("flex flex-col items-center py-1.5 text-[11px] leading-tight", dates.isWeekend(d) ? "text-muted-foreground/70" : "text-muted-foreground", d === today && "font-semibold text-primary")}>
                <span>{dayName(d)}</span>
                <span className="tabular-nums">{Number(d.slice(8))}</span>
              </div>
            ))}
          </div>

          {staged.map((s) => (
            <StagedRow key={s.worker.id} s={s} days={days} onRemove={() => onUnstage(s.worker.id)} />
          ))}

          {loading
            ? Array.from({ length: 10 }, (_, i) => (
                <div key={i} className={cn(GRID, "items-center border-b px-0 py-1.5")}>
                  <Skeleton className="mx-3 h-4 w-32" />
                  {days.map((d) => (
                    <Skeleton key={d} className="mx-0.5 h-6" />
                  ))}
                </div>
              ))
            : crew.map((r) => <RosterRow key={r.w.id} w={r.w} from={r.from} to={r.to} days={days} />)}

          {!loading && crew.length === 0 && staged.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">Nobody is rostered on {siteName} yet. Drag a worker from the bench to start the crew.</div>
          )}

          {!loading && crew.length > 0 && (
            <div role="row" className={cn(GRID, "sticky bottom-0 z-20 border-t bg-muted")}>
              <div role="rowheader" className="sticky start-0 bg-muted px-3 py-1.5 text-xs font-medium">
                On site
              </div>
              {onSiteByDay.map((n, i) => (
                <div role="cell" key={days[i]} className="py-1.5 text-center text-xs font-medium tabular-nums">
                  {n}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const RosterRow = memo(function RosterRow({ w, from, to, days }: { w: WorkerListItem; from?: string; to?: string; days: string[] }) {
  const reason = days.map((d) => blockedReason(w, d)).find(Boolean);
  const leave = demoLeave(w);
  return (
    <div role="row" className={cn(GRID, "items-center border-b hover:bg-muted/40")}>
      <div role="rowheader" className="sticky start-0 z-10 flex min-w-0 items-center gap-1.5 bg-card px-3 py-1">
        <div className="flex min-w-0 flex-col">
          <Link to={`/workers/${w.id}`} className="truncate text-sm font-medium underline-offset-4 hover:underline">
            {w.fullName}
          </Link>
          <span className="truncate text-[11px] text-muted-foreground">
            {w.trade} · {w.code}
            {from ? " · new" : ""}
          </span>
        </div>
        {reason && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="ms-auto shrink-0 rounded text-destructive focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Conflict: ${reason}`}>
                <TriangleAlertIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{reason}. Renew the paper or replace this worker.</TooltipContent>
          </Tooltip>
        )}
      </div>
      {days.map((d) => {
        const s = cellFor(w, d, from, to);
        if (s === "none") return <div role="cell" key={d} className="mx-0.5 h-6" aria-label={`${displayDate(d)}: not assigned`} />;
        const c = CELL[s];
        const detail = s === "blocked" ? blockedReason(w, d) : s === "leave" && leave ? `Leave ${displayDate(leave.from)} – ${displayDate(leave.to)}` : c.label;
        return (
          <div role="cell" key={d} title={`${displayDate(d)}: ${detail}`} aria-label={`${displayDate(d)}: ${detail}`} className={cn("mx-0.5 flex h-6 items-center justify-center rounded-sm text-[10px] font-semibold", c.className)}>
            {c.letter}
          </div>
        );
      })}
    </div>
  );
});

function StagedRow({ s, days, onRemove }: { s: Staged; days: string[]; onRemove: () => void }) {
  const bad = s.conflicts.length > 0;
  return (
    <div role="row" className={cn(GRID, "items-start border-b", bad ? "bg-destructive/5" : "bg-primary/5")}>
      <div role="rowheader" className={cn("sticky start-0 z-10 flex min-w-0 flex-col gap-1 px-3 py-1.5", bad ? "bg-destructive/5" : "bg-primary/5")}>
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{s.worker.fullName}</span>
          <Button variant="ghost" size="icon-xs" className="ms-auto" aria-label={`Remove ${s.worker.fullName} from the changes`} onClick={onRemove}>
            <XIcon />
          </Button>
        </div>
        {s.checking ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Spinner className="size-3" /> Checking papers…
          </span>
        ) : bad ? (
          <ul className="flex flex-col gap-0.5">
            {s.conflicts.map((c) => (
              <li key={c} className="flex items-start gap-1 text-[11px] leading-snug text-destructive">
                <BanIcon aria-hidden className="mt-px size-3 shrink-0" />
                {c}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[11px] text-success">Clear to assign from {displayDate(s.from)}{s.warnings.length ? ` · ${s.warnings[0]}` : ""}</span>
        )}
      </div>
      {days.map((d) => {
        const on = d >= s.from && d <= s.to;
        return (
          <div role="cell" key={d} className="mx-0.5 mt-1.5 h-6" aria-label={on ? `${displayDate(d)}: staged` : undefined}>
            {on && <div className={cn("h-full rounded-sm border border-dashed", bad ? "border-destructive/60 bg-destructive/10" : dates.isWeekend(d) ? "border-primary/40 bg-muted" : "border-primary bg-primary/10")} />}
          </div>
        );
      })}
    </div>
  );
}

function BenchCardBody({ worker: w, className }: { worker: WorkerListItem; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-md border bg-card p-2", className)}>
      <GripVerticalIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{w.fullName}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{daysIdle(w)}d idle</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{w.trade}</span>
          <ComplianceBadge state={w.compliance.state} daysLeft={w.compliance.nextExpiry?.daysLeft} />
        </div>
      </div>
    </div>
  );
}

function BenchCard({ worker, staged, onAssign, siteName }: { worker: WorkerListItem; staged: boolean; onAssign: () => void; siteName: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: worker.id, data: { worker }, disabled: staged });
  return (
    <li className={cn("flex items-center gap-1", isDragging && "opacity-40")}>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-label={staged ? `${worker.fullName}, staged` : `Drag ${worker.fullName} onto the roster`}
        className={cn("min-w-0 flex-1 cursor-grab rounded-md focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing", staged && "cursor-default opacity-50")}
      >
        <BenchCardBody worker={worker} />
      </div>
      {staged ? (
        <span className="w-6 text-center text-[11px] text-muted-foreground" title="Staged">
          <CheckIcon aria-label="Staged" className="mx-auto size-3.5" />
        </span>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Assign ${worker.fullName} to ${siteName}`} onClick={onAssign}>
              <PlusIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Assign to {siteName}</TooltipContent>
        </Tooltip>
      )}
    </li>
  );
}
