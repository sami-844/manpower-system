/**
 * S-40 Attendance entry (TR-CLI-13, TR-CLI-14, Design Brief "Attendance entry"): pick a site-day,
 * type only the exceptions into a grid pre-filled with the rostered crew while the sheet scan is
 * docked beside it. Fully keyboard driven (see ./entry-grid.ts); Ctrl+Enter saves and opens the
 * next waiting site-day. Lines that differ from the roster are highlighted; workers not eligible
 * that day and hours over the daily maximum are flagged with the reason (App Flow step 4).
 */
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BanIcon, CheckIcon, ClockIcon, LockIcon, MessageCircleIcon, ShieldCheckIcon, TriangleAlertIcon, UsersIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { todayOman } from "@/demo/core";
import { siteById } from "@/demo/reference";
import {
  MARK_LABEL,
  RULES,
  crewOf,
  differsFromRoster,
  enteredLines,
  enterersOf,
  getSiteDays,
  getTimesheetsSync,
  lineFlags,
  periods,
  personName,
  rosterLines,
  ruleSource,
  saveEntry,
  scanMarks,
  timesheetId,
  type CrewMember,
  type EntryLine,
  type Mark,
  type SiteDay,
} from "@/demo/time";
import type { WorkerListItem } from "@/lib/api";
import { gridReducer, keyToAction } from "./entry-grid";
import { LoadError, PaperScan, ScanViewer, SiteDayBadge, dayLabel, fmtElapsed, fmtDateTime, useTimeQuery } from "./shared";

export function AttendanceEntry() {
  const [params, setParams] = useSearchParams();
  const days = useTimeQuery(["site-days"], (w) => getSiteDays(w));
  const list = days.data ?? [];
  const firstWaiting = list.find((d) => d.status === "waiting") ?? list[0];
  const selectedId = params.get("sd") ?? firstWaiting?.id ?? null;
  const selected = list.find((d) => d.id === selectedId) ?? null;
  const select = (id: string) => setParams({ sd: id }, { replace: true });

  const waiting = list.filter((d) => d.status === "waiting").length;
  const noScan = list.filter((d) => d.overdue).length;

  return (
    <Page>
      <PageHeader
        screen="S-40"
        sample
        title="Attendance entry"
        description="Open a site-day, type only the exceptions from the supervisor's sheet into the pre-filled grid, and save. The scan stays beside the grid as evidence."
        meta={
          days.loading ? (
            <Skeleton className="h-5 w-48" />
          ) : (
            <>
              <StatusBadge tone="due">{waiting} waiting for entry</StatusBadge>
              {noScan > 0 && <StatusBadge tone="expired">{noScan} with no scan received</StatusBadge>}
            </>
          )
        }
      />
      <LoadError error={days.error} />
      <div className="grid gap-4 xl:h-[calc(100svh-14.5rem)] xl:min-h-[34rem] xl:grid-cols-[12rem_minmax(0,1fr)]">
        <SiteDayList days={list} loading={days.loading} selectedId={selected?.id ?? null} onSelect={select} />
        {days.loading || !days.workers ? (
          <div className="space-y-2 rounded-lg border bg-card p-4">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : selected ? (
          <Workspace key={selected.id} day={selected} workers={days.workers} list={list} onNext={select} />
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No site-days to enter</EmptyTitle>
              <EmptyDescription>Site-days appear here once tomorrow's sheets are generated on Daily sheets.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild variant="outline">
                <Link to="/daily-sheets">Open daily sheets</Link>
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------
function SiteDayList({ days, loading, selectedId, onSelect }: { days: SiteDay[]; loading: boolean; selectedId: string | null; onSelect: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, SiteDay[]>();
    for (const d of days) m.set(d.date, [...(m.get(d.date) ?? []), d]);
    return [...m.entries()];
  }, [days]);
  const today = todayOman();
  return (
    <nav aria-label="Site-days" className="flex max-h-80 min-h-0 flex-col overflow-hidden rounded-lg border bg-card xl:max-h-none">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Site-days · last 6 days</div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading
          ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="mx-3 my-2 h-9" />)
          : groups.map(([date, items]) => (
              <div key={date}>
                <div className="sticky top-0 z-10 border-b bg-muted/95 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                  {dayLabel(date)}
                  {date === today && " · today"}
                </div>
                <ul>
                  {items.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(d.id)}
                        aria-current={d.id === selectedId ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 border-s-2 border-transparent px-3 py-1.5 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                          d.id === selectedId && "border-s-primary bg-primary/5",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{siteById(d.siteId)?.name}</span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-muted-foreground tabular-nums">
                              {d.entry ? `${d.entry.exceptions} exceptions` : `${d.crewCount} crew`}
                            </span>
                            <SiteDayBadge status={d.status} overdue={d.overdue} />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------
const MARK_STYLE: Record<Mark, string> = {
  P: "text-muted-foreground",
  A: "bg-destructive/10 text-destructive border-destructive/30",
  S: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning",
  L: "bg-warning/15 text-warning-foreground border-warning/40 dark:text-warning",
};

function Workspace({ day, workers, list, onNext }: { day: SiteDay; workers: WorkerListItem[]; list: SiteDay[]; onNext: (id: string) => void }) {
  const { account } = useSession();
  const me = account?.username ?? "";
  const qc = useQueryClient();
  const site = siteById(day.siteId)!;
  const crew = useMemo(() => crewOf(workers, day.siteId), [workers, day.siteId]);
  const marks = useMemo(() => scanMarks(day.siteId, day.date, crew), [day.siteId, day.date, crew]);
  const [state, dispatch] = useReducer(gridReducer, null, () => ({ lines: enteredLines(day.siteId, day.date, crew) ?? rosterLines(crew), row: 0, col: 0, buffer: "" }));
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.25);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const gridRef = useRef<HTMLTableElement>(null);
  const scanRef = useRef<HTMLDivElement>(null);

  const period = periods().find((p) => day.date >= p.start && day.date <= p.end);
  const ts = period ? getTimesheetsSync(workers).find((t) => t.id === timesheetId(day.siteId, period.start)) : undefined;
  const readOnly = !!ts && ts.status !== "draft";
  const canEnter = day.status !== "no_scan";
  const enterers = period ? enterersOf(day.siteId, period.start, period.end) : [];

  const flagsByRow = useMemo(() => state.lines.map((l, i) => lineFlags(l, crew[i]!, day.date)), [state.lines, crew, day.date]);
  const exceptions = state.lines.filter(differsFromRoster).length;
  const flagged = flagsByRow.filter((f) => f.length).length;
  const elapsed = Math.round((now - started) / 1000);

  useEffect(() => {
    if (day.entry || !canEnter) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [day.entry, canEnter]);

  // Keyboard first: the grid takes focus when a site-day opens.
  useEffect(() => {
    if (canEnter && !readOnly) gridRef.current?.focus({ preventScroll: true });
  }, [canEnter, readOnly]);

  // Open the scan on the marks side (names and exception columns).
  useEffect(() => {
    const s = scanRef.current;
    if (s) s.scrollLeft = s.scrollWidth;
  }, []);

  // Keep the focus row in view, in the grid and on the scan.
  useEffect(() => {
    document.getElementById(`row-${day.id}-${state.row}`)?.scrollIntoView({ block: "nearest" });
    const s = scanRef.current;
    if (s && crew.length) {
      const svgH = s.scrollHeight;
      const y = ((132 + state.row * 17) / (132 + crew.length * 17 + 130)) * svgH;
      if (y < s.scrollTop + 40 || y > s.scrollTop + s.clientHeight - 60) s.scrollTo({ top: Math.max(0, y - s.clientHeight / 3) });
    }
  }, [state.row, day.id, crew.length, zoom]);

  const save = useMutation({
    mutationFn: () => saveEntry({ siteId: day.siteId, date: day.date, lines: state.lines, by: me, seconds: elapsed }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["time"] });
      const next = list.find((d) => d.status === "waiting" && d.id !== day.id);
      toast.success(`Saved ${site.name} · ${dayLabel(day.date)}`, {
        description: `${exceptions} exceptions${flagged ? `, ${flagged} flagged lines` : ""} · ${fmtElapsed(elapsed)}. ${next ? `Opened ${siteById(next.siteId)?.name}, ${dayLabel(next.date)}.` : "No more sheets waiting."}`,
      });
      if (next) onNext(next.id);
    },
  });
  const blocked = !canEnter || readOnly || save.isPending;

  // Ctrl+Enter saves and opens the next site-day, wherever focus is on the page.
  const saveRef = useRef(() => {});
  saveRef.current = () => !blocked && save.mutate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onGridKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || readOnly) return;
    if (state.col === 2 && (e.key === "F2" || (e.key.length === 1 && e.key !== " "))) {
      e.preventDefault();
      setEditing(e.key === "F2" ? state.lines[state.row]!.remarks : state.lines[state.row]!.remarks + e.key);
      return;
    }
    const a = keyToAction(e.key, state.col);
    if (!a) return;
    e.preventDefault();
    dispatch(a);
  };
  const commitRemarks = (value: string, move: boolean) => {
    dispatch({ type: "remarks", value });
    setEditing(null);
    if (move) dispatch({ type: "move", dRow: 1, dCol: 0 });
    gridRef.current?.focus({ preventScroll: true });
  };

  const others = enterers.filter((u) => u !== me);
  const iEntered = enterers.includes(me) || (!day.entry && canEnter && !readOnly);

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
      <section aria-label="Entry grid" className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">
              {site.name} <span className="font-normal text-muted-foreground">· {dayLabel(day.date)}</span>
            </h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums" aria-live="polite">
              <span className="font-mono">{day.sheetNo}</span>
              <span>{crew.length} rostered</span>
              <span className={cn(exceptions > 0 && "font-medium text-foreground")}>{exceptions} exceptions</span>
              {flagged > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-destructive">
                  <TriangleAlertIcon aria-hidden className="size-3" />
                  {flagged} flagged
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <ClockIcon aria-hidden className="size-3" />
                {day.entry ? `entered in ${fmtElapsed(day.entry.seconds ?? 0)}` : `${fmtElapsed(elapsed)} elapsed`}
              </span>
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={blocked ? 0 : -1}>
                <Button onClick={() => save.mutate()} disabled={blocked}>
                  <CheckIcon data-icon="inline-start" />
                  {day.entry ? "Save changes" : "Save & next"}
                  <Kbd className="ms-1 bg-primary-foreground/15 text-primary-foreground">Ctrl ↵</Kbd>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              {!canEnter ? "No scan has been filed for this site-day; hours need the sheet as evidence." : readOnly ? "This day is in a submitted timesheet. Corrections go through the timesheet." : "Saves every line as an office-entry attendance event and opens the next waiting site-day."}
            </TooltipContent>
          </Tooltip>
        </div>

        {!canEnter ? (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BanIcon />
              </EmptyMedia>
              <EmptyTitle>{day.overdue ? "No scan received" : "Scan not received yet"}</EmptyTitle>
              <EmptyDescription>
                Hours for {site.name} on {dayLabel(day.date)} can only be entered against the filed sheet photo.{" "}
                {day.overdue ? "This site-day was flagged this morning." : "Photos usually arrive by 19:00."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => toast.success(`Reminder sent to ${site.supervisor}`, { description: `WhatsApp: "Please send the photo of sheet ${day.sheetNo}."` })}>
                <MessageCircleIcon data-icon="inline-start" />
                Ask {site.supervisor.split(" ")[0]} for the photo
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              {readOnly ? (
                <span className="inline-flex items-center gap-1">
                  <LockIcon aria-hidden className="size-3" /> Read only: the {period?.label} timesheet is {ts?.status.replace("_", " ")}.
                  <Link className="text-primary underline-offset-4 hover:underline" to={`/timesheets/${ts?.id}`}>
                    Open timesheet
                  </Link>
                </span>
              ) : (
                <>
                  <Key k="P" label="present" />
                  <Key k="A" label="absent" />
                  <Key k="S" label="sick" />
                  <Key k="L" label="late" />
                  <Key k="0–9" label="overtime h" />
                  <Key k="↵" label="down" />
                  <Key k="⌫" label="clear" />
                  <Key k="F2" label="remarks" />
                </>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto has-[table:focus-visible]:ring-2 has-[table:focus-visible]:ring-ring/40 has-[table:focus-visible]:ring-inset max-xl:max-h-[32rem]">
              <table
                ref={gridRef}
                role="grid"
                aria-label={`Attendance for ${site.name}, ${dayLabel(day.date)}`}
                aria-activedescendant={`cell-${day.id}-${state.row}-${state.col}`}
                tabIndex={0}
                onKeyDown={onGridKey}
                className="w-full min-w-[34rem] table-fixed border-collapse text-sm outline-none"
              >
                <thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur">
                  <tr className="h-8 text-start">
                    <th className="w-9 ps-3 text-start font-medium">#</th>
                    <th className="text-start font-medium">Worker</th>
                    <th className="w-[5.5rem] text-start font-medium">Status</th>
                    <th className="w-11 pe-2 text-end font-medium">OT h</th>
                    <th className="w-24 text-start font-medium">Remarks</th>
                    <th className="w-28 pe-3 text-start font-medium">Checks</th>
                  </tr>
                </thead>
                <tbody>
                  {state.lines.map((l, i) => (
                    <GridRow
                      key={l.code}
                      dayId={day.id}
                      i={i}
                      line={l}
                      member={crew[i]!}
                      flags={flagsByRow[i]!}
                      active={i === state.row}
                      col={state.col}
                      editing={i === state.row && editing !== null ? editing : null}
                      onCell={(col) => {
                        dispatch({ type: "goto", row: i, col });
                        gridRef.current?.focus({ preventScroll: true });
                      }}
                      onCommit={commitRemarks}
                      onCancel={() => {
                        setEditing(null);
                        gridRef.current?.focus({ preventScroll: true });
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {canEnter && <RowDetail i={state.row} member={crew[state.row]} line={state.lines[state.row]} flags={flagsByRow[state.row] ?? []} />}
        <FourEyes me={me} enterers={enterers} others={others} iEntered={iEntered} siteName={site.name} periodLabel={period?.label ?? ""} entry={day.entry} />
      </section>

      <ScanViewer
        className="max-xl:h-[30rem]"
        zoom={zoom}
        setZoom={setZoom}
        scrollRef={scanRef}
        title={day.scan ? "Sample scan" : "No scan filed"}
        meta={day.scan ? `Supervisor's photo · filed by QR ${fmtDateTime(day.scan.filedAt)} · ${day.scan.via}` : `Expected for sheet ${day.sheetNo}`}
      >
        {day.scan ? (
          <PaperScan crew={crew} marks={marks} siteId={day.siteId} date={day.date} sheetNo={day.sheetNo} token={day.qrToken} activeRow={canEnter ? state.row : undefined} zoom={zoom} />
        ) : (
          <div className="grid h-full min-h-60 place-items-center p-6 text-center text-sm text-muted-foreground">The photo is filed here automatically when its QR code is read.</div>
        )}
      </ScanViewer>
    </div>
  );
}

function Key({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Kbd>{k}</Kbd>
      {label}
    </span>
  );
}

function GridRow({ dayId, i, line, member, flags, active, col, editing, onCell, onCommit, onCancel }: { dayId: string; i: number; line: EntryLine; member: CrewMember; flags: ReturnType<typeof lineFlags>; active: boolean; col: number; editing: string | null; onCell: (col: number) => void; onCommit: (v: string, move: boolean) => void; onCancel: () => void }) {
  const changed = differsFromRoster(line);
  const cellCls = (c: number) => cn("relative", active && col === c && "outline-2 -outline-offset-2 outline-ring bg-primary/5");
  return (
    <tr
      id={`row-${dayId}-${i}`}
      aria-selected={active}
      className={cn("h-8 border-b border-border/60", changed && "bg-highlight/10", flags.length > 0 && "bg-destructive/5", active && "bg-muted")}
    >
      <td className={cn("border-s-2 ps-2.5 text-xs text-muted-foreground tabular-nums", changed ? "border-s-highlight" : "border-s-transparent", flags.length > 0 && "border-s-destructive")}>{i + 1}</td>
      <td className="truncate pe-2">
        <span className="me-2 font-mono text-[11px] text-muted-foreground">{member.code}</span>
        <Link to={`/workers/${member.workerId}`} tabIndex={-1} className="hover:underline">
          {member.fullName}
        </Link>
        {member.shift === "night" && <span className="ms-1.5 text-[11px] text-muted-foreground">night</span>}
      </td>
      <td id={`cell-${dayId}-${i}-0`} className={cellCls(0)} onClick={() => onCell(0)}>
        <span className={cn("inline-flex h-5 items-center gap-1 rounded border border-transparent px-1.5 text-xs font-medium", MARK_STYLE[line.mark])}>
          <span className="font-mono">{line.mark}</span>
          {MARK_LABEL[line.mark]}
        </span>
      </td>
      <td id={`cell-${dayId}-${i}-1`} className={cn(cellCls(1), "pe-2 text-end tabular-nums")} onClick={() => onCell(1)}>
        {line.ot > 0 ? <span className="font-medium">{line.ot}</span> : <span className="text-muted-foreground/50">0</span>}
      </td>
      <td id={`cell-${dayId}-${i}-2`} className={cn(cellCls(2), "truncate pe-2 text-xs")} onClick={() => onCell(2)}>
        {editing !== null ? (
          <input
            autoFocus
            defaultValue={editing}
            aria-label={`Remarks for ${member.fullName}`}
            className="h-6 w-full rounded border bg-background px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
            onKeyDown={(e) => {
              // Mark the input done first: unmounting it fires blur, which must not commit again.
              if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                e.currentTarget.dataset.done = "1";
                onCommit(e.currentTarget.value, true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.currentTarget.dataset.done = "1";
                onCancel();
              }
              e.stopPropagation();
            }}
            onBlur={(e) => !e.currentTarget.dataset.done && onCommit(e.currentTarget.value, false)}
          />
        ) : (
          line.remarks || <span className="text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="truncate pe-3 text-xs">
        {flags.length > 0 ? (
          <span title={flags.map((f) => f.reason).join(" · ")} className="inline-flex items-center gap-1 font-medium text-destructive">
            {flags[0]!.kind === "not_eligible" ? <BanIcon aria-hidden className="size-3 shrink-0" /> : <TriangleAlertIcon aria-hidden className="size-3 shrink-0" />}
            {flags.map((f) => (f.kind === "not_eligible" ? "Not eligible" : "Over max h")).join(" · ")}
          </span>
        ) : changed ? (
          <span className="text-muted-foreground">Differs from roster</span>
        ) : null}
      </td>
    </tr>
  );
}

function RowDetail({ i, member, line, flags }: { i: number; member: CrewMember | undefined; line: EntryLine | undefined; flags: ReturnType<typeof lineFlags> }) {
  if (!member || !line) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-3 py-1.5 text-xs" aria-live="polite">
      <span className="text-muted-foreground tabular-nums">Row {i + 1}</span>
      <span className="font-mono">{member.code}</span>
      <span className="font-medium">{member.fullName}</span>
      <span className="text-muted-foreground">
        {member.trade} · {member.shift === "day" ? "day" : "night"} shift
      </span>
      {flags.map((f) => (
        <span key={f.kind} className="inline-flex items-center gap-1 text-destructive">
          {f.kind === "not_eligible" ? <BanIcon aria-hidden className="size-3" /> : <TriangleAlertIcon aria-hidden className="size-3" />}
          {f.reason}
        </span>
      ))}
      {!flags.length && <span className="text-muted-foreground">{differsFromRoster(line) ? `· differs from roster (${MARK_LABEL[line.mark].toLowerCase()}${line.ot ? `, ${line.ot} h overtime` : ""})` : "· as rostered"}</span>}
    </div>
  );
}

function FourEyes({ me, enterers, others, iEntered, siteName, periodLabel, entry }: { me: string; enterers: string[]; others: string[]; iEntered: boolean; siteName: string; periodLabel: string; entry: SiteDay["entry"] }) {
  return (
    <div className="space-y-1 border-t bg-muted/30 px-3 py-2 text-xs">
      <p className="flex items-start gap-2">
        <ShieldCheckIcon aria-hidden className="mt-px size-3.5 shrink-0 text-primary" />
        <span>
          <span className="font-medium">Four eyes: </span>
          {iEntered
            ? `you ${entry?.by === me ? "entered" : "are entering"} this sheet, so another operations user must review and submit ${siteName}'s ${periodLabel} timesheet.`
            : `${others.map(personName).join(", ") || "Someone else"} entered this site's ${periodLabel} sheets and cannot review or submit them; you can.`}
        </span>
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 ps-5.5 text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <UsersIcon aria-hidden className="size-3" />
          Entered this period by {enterers.length ? enterers.map(personName).join(", ") : "nobody yet"}
          {entry && ` · this day ${personName(entry.by)}, ${fmtDateTime(entry.at)}`}
        </span>
        <span>
          Max {RULES.maxDaily.value} h a day · {ruleSource(RULES.maxDaily)}
        </span>
      </p>
    </div>
  );
}
