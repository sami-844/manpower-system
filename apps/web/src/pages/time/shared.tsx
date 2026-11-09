/**
 * Shared pieces for the Time screens (S-19, S-20, S-21, S-39, S-40, S-41): data hooks over the
 * demo layer, status words → badge tones, the QR stand-in, the printable A4 daily sheet and
 * the photographed-sheet mock used as the "scan".
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { MinusIcon, PlusIcon, ScanIcon, TriangleAlertIcon } from "lucide-react";
import type { WorkerListItem } from "@/lib/api";
import { displayDate } from "@/lib/format";
import { useWorkforce } from "@/demo/workforce";
import { rng } from "@/demo/core";
import { clientById, siteById } from "@/demo/reference";
import {
  LEAVE_STATUS_LABEL,
  PACK_STATUS_LABEL,
  SHIFT_LABEL,
  TIMESHEET_STATUS_LABEL,
  type CrewMember,
  type EntryLine,
  type LeaveStatus,
  type PackStatus,
  type SheetStatus,
  type SiteDayStatus,
  type TimesheetStatus,
} from "@/demo/time";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------
/** A demo query that needs the real worker list first. Key always starts with "time". */
export function useTimeQuery<T>(key: readonly unknown[], fn: (workers: WorkerListItem[]) => Promise<T>) {
  const wf = useWorkforce();
  const q = useQuery({ queryKey: ["time", ...key], queryFn: () => fn(wf.data!), enabled: !!wf.data });
  return { ...q, workers: wf.data, loading: wf.isPending || q.isPending, error: wf.error ?? q.error };
}

export function LoadError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>Couldn't load the worker list</AlertTitle>
      <AlertDescription>Crews come from the live API (/api/workers). Check the API server is running, then reload. {error instanceof Error ? `(${error.message})` : null}</AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------------------------
// Status words (Design Brief "Status system": icon + word, the same everywhere)
// ---------------------------------------------------------------------------------------------
const SHEET: Record<SheetStatus, [StatusTone, string]> = { generated: ["draft", "Generated"], printed: ["info", "Printed"], sent: ["released", "Sent by WhatsApp"], scan_filed: ["ok", "Scan filed"], missing: ["expired", "Scan missing"] };
export const SheetBadge = ({ status }: { status: SheetStatus }) => <StatusBadge tone={SHEET[status][0]}>{SHEET[status][1]}</StatusBadge>;

export function SiteDayBadge({ status, overdue }: { status: SiteDayStatus; overdue: boolean }) {
  if (status === "entered") return <StatusBadge tone="ok">Entered</StatusBadge>;
  if (status === "waiting") return <StatusBadge tone="due">Waiting</StatusBadge>;
  return overdue ? <StatusBadge tone="expired">No scan</StatusBadge> : <StatusBadge tone="incomplete">No scan yet</StatusBadge>;
}

const TS_TONE: Record<TimesheetStatus, StatusTone> = { draft: "draft", submitted: "due", client_approved: "ok", locked: "locked" };
export const TimesheetBadge = ({ status }: { status: TimesheetStatus }) => <StatusBadge tone={TS_TONE[status]}>{TIMESHEET_STATUS_LABEL[status]}</StatusBadge>;

const PACK_TONE: Record<PackStatus, StatusTone> = { not_sent: "incomplete", sent: "released", awaiting: "due", signed: "ok", auto_approved: "ok", late: "expired" };
export const PackBadge = ({ status }: { status: PackStatus }) => <StatusBadge tone={PACK_TONE[status]}>{PACK_STATUS_LABEL[status]}</StatusBadge>;

const LEAVE_TONE: Record<LeaveStatus, StatusTone> = { pending_ops: "due", pending_hr: "due", approved: "ok", rejected: "blocked", returned: "draft" };
export const LeaveBadge = ({ status }: { status: LeaveStatus }) => <StatusBadge tone={LEAVE_TONE[status]}>{LEAVE_STATUS_LABEL[status]}</StatusBadge>;

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------
const HOURS = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
/** Hours with tabular figures; zero shows as a dash so exceptions stand out. */
export const fmtHours = (n: number) => (n === 0 ? "—" : HOURS.format(n));
export const fmtNumber = (n: number) => HOURS.format(n);
const DOW = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
export const weekday = (d: string) => DOW.format(new Date(`${d}T00:00:00Z`));
export const dayLabel = (d: string) => `${weekday(d)} ${displayDate(d)}`;
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat" });
const DT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Muscat" });
export const fmtTime = (iso: string) => TIME.format(new Date(iso));
export const fmtDateTime = (iso: string) => DT.format(new Date(iso));
export const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// ---------------------------------------------------------------------------------------------
// QR stand-in: a deterministic QR-like pattern from the sheet's qr token. A visual placeholder;
// the real sheet PDF carries a real QR code (TR-CLI-12).
// ---------------------------------------------------------------------------------------------
const N = 25;
function qrPath(token: string): string {
  const r = rng(`qrbits:${token}`);
  const finder = (x: number, y: number) => {
    for (const [ox, oy] of [[0, 0], [N - 7, 0], [0, N - 7]] as const) {
      const dx = x - ox;
      const dy = y - oy;
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
        if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return 0;
        const ring = Math.min(dx, dy, 6 - dx, 6 - dy);
        return ring === 1 ? 0 : 1;
      }
    }
    return -1;
  };
  let d = "";
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const f = finder(x, y);
      const on = f === -1 ? (x === 6 || y === 6 ? (x + y) % 2 === 0 : r.chance(0.48)) : f === 1;
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }
  return d;
}
export function QrMock({ token, size = 88, className }: { token: string; size?: number; className?: string }) {
  return (
    <svg role="img" aria-label={`QR: site · date · sheet no. (${token})`} viewBox={`-2 -2 ${N + 4} ${N + 4}`} width={size} height={size} className={cn("shrink-0", className)} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={N + 4} height={N + 4} className="fill-card" />
      <path d={qrPath(token)} className="fill-foreground" />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// The A4 daily sheet (S-39 preview and print). Plain HTML table so it paginates when printed.
// ---------------------------------------------------------------------------------------------
export function SheetPrint({ siteId, date, sheetNo, token, crew }: { siteId: string; date: string; sheetNo: string; token: string; crew: readonly CrewMember[] }) {
  const site = siteById(siteId);
  const client = site ? clientById(site.clientId) : undefined;
  const cell = "border border-foreground/40 px-1.5 py-1";
  return (
    <article className="mx-auto w-full max-w-[794px] bg-card p-8 text-[11px] leading-tight text-card-foreground shadow-sm ring-1 ring-foreground/10 print:max-w-none print:p-0 print:shadow-none print:ring-0 [break-after:page] last:[break-after:auto]">
      <header className="flex items-start justify-between gap-6 border-b-2 border-foreground pb-3">
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase">Daily attendance sheet</p>
          <h2 className="text-lg font-semibold">{site?.name}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">Client</dt>
            <dd>{client?.legalName}</dd>
            <dt className="text-muted-foreground">Date</dt>
            <dd className="font-medium">{dayLabel(date)}</dd>
            <dt className="text-muted-foreground">Sheet no.</dt>
            <dd className="font-mono">{sheetNo}</dd>
            <dt className="text-muted-foreground">Supervisor</dt>
            <dd>{site?.supervisor}</dd>
          </dl>
        </div>
        <figure className="flex flex-col items-center gap-1">
          <QrMock token={token} size={92} />
          <figcaption className="text-[9px] text-muted-foreground">QR: site · date · sheet no.</figcaption>
        </figure>
      </header>
      <p className="py-2 text-[10px] text-muted-foreground">
        Mark exceptions only. Leave a row blank when the worker was present for the full shift. Overtime in hours. Sign and send a photo to the office the same day.
      </p>
      <table className="w-full border-collapse tabular-nums">
        <thead>
          <tr className="bg-muted/60 text-start">
            {["#", "Code", "Name", "Trade", "Shift", "Absent", "Late", "Sick", "OT hours", "Remarks"].map((h) => (
              <th key={h} scope="col" className={cn(cell, "text-start font-semibold", ["Absent", "Late", "Sick", "OT hours"].includes(h) && "w-12 text-center")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {crew.map((m, i) => (
            <tr key={m.code} className="[break-inside:avoid]">
              <td className={cn(cell, "w-6 text-muted-foreground")}>{i + 1}</td>
              <td className={cn(cell, "font-mono whitespace-nowrap")}>{m.code}</td>
              <td className={cell}>{m.fullName}</td>
              <td className={cell}>{m.trade}</td>
              <td className={cn(cell, "whitespace-nowrap")}>{m.shift === "day" ? "Day" : "Night"}</td>
              <td className={cell} />
              <td className={cell} />
              <td className={cell} />
              <td className={cell} />
              <td className={cn(cell, "w-32")} />
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="mt-8 grid grid-cols-2 gap-10 text-[10px] [break-inside:avoid]">
        <div>
          <div className="h-10 border-b border-foreground" />
          <p className="pt-1">Supervisor signature · {site?.supervisor} · time</p>
        </div>
        <div>
          <div className="h-10 border-b border-foreground" />
          <p className="pt-1">Client countersignature (optional)</p>
        </div>
      </footer>
      <p className="pt-4 text-[9px] text-muted-foreground">
        {crew.length} workers · {crew.filter((m) => m.shift === "day").length} {SHIFT_LABEL.day} · {crew.filter((m) => m.shift === "night").length} {SHIFT_LABEL.night} · generated from the roster
      </p>
    </article>
  );
}

/**
 * Browser print for a set of sheets (web: the print dialog; desktop: silent print later).
 * Renders the content into a body-level node and hides everything else while printing.
 */
export function usePrintSheets() {
  const [content, setContent] = useState<ReactNode>(null);
  useEffect(() => {
    if (!content) return;
    const done = () => setContent(null);
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [content]);
  const portal = content
    ? createPortal(
        <div data-print-root className="hidden bg-card print:block">
          <style>{"@media print { body > :not([data-print-root]) { display: none !important; } }"}</style>
          {content}
        </div>,
        document.body,
      )
    : null;
  return { portal, print: useCallback((node: ReactNode) => setContent(node), []) };
}

// ---------------------------------------------------------------------------------------------
// The sample scan: an SVG mock of a photographed paper sheet with the supervisor's pen marks.
// ---------------------------------------------------------------------------------------------
const ROW_H = 17;
const TOP = 132;
export function PaperScan({ crew, marks, siteId, date, sheetNo, token, activeRow, zoom }: { crew: readonly CrewMember[]; marks: Map<string, EntryLine>; siteId: string; date: string; sheetNo: string; token: string; activeRow?: number; zoom: number }) {
  const site = siteById(siteId);
  const h = TOP + crew.length * ROW_H + 90;
  const r = rng(`paper:${siteId}:${date}`);
  const tilt = (r.next() - 0.5) * 2.4;
  const hand = { fontFamily: "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive" };
  const cols = { n: 26, code: 46, name: 112, trade: 262, shift: 352, a: 398, l: 430, s: 462, ot: 496, rem: 532 };
  return (
    <svg viewBox={`0 0 640 ${h + 40}`} width={`${zoom * 100}%`} role="img" aria-label={`Sample scan of sheet ${sheetNo}`} className="block max-w-none">
      <rect width={640} height={h + 40} className="fill-muted" />
      <g transform={`rotate(${tilt.toFixed(2)} 320 ${h / 2})`}>
        <rect x={24} y={24} width={600} height={h} className="fill-ink/15" rx={2} />
        <rect x={18} y={18} width={600} height={h} className="fill-paper" />
        <line x1={18} x2={618} y1={18 + h * 0.48} y2={18 + h * 0.48} className="stroke-ink/5" strokeWidth={3} />
        <g className="fill-ink" fontSize={9}>
          <text x={cols.n} y={44} fontSize={8} className="fill-ink/60">
            DAILY ATTENDANCE SHEET
          </text>
          <text x={cols.n} y={64} fontSize={15} fontWeight={600}>
            {site?.name}
          </text>
          <text x={cols.n} y={82}>
            {dayLabel(date)} · {sheetNo}
          </text>
          <text x={cols.n} y={96} className="fill-ink/60">
            Supervisor {site?.supervisor}
          </text>
        </g>
        <g transform="translate(548 30)">
          <QrInline token={token} />
        </g>
        <g fontSize={8} className="fill-ink">
          {[["#", cols.n], ["Code", cols.code], ["Name", cols.name], ["Trade", cols.trade], ["Shift", cols.shift], ["Abs", cols.a + 3], ["Late", cols.l + 3], ["Sick", cols.s + 3], ["OT", cols.ot + 4], ["Remarks", cols.rem]].map(([t, x]) => (
            <text key={t as string} x={x as number} y={TOP - 6} fontWeight={600}>
              {t}
            </text>
          ))}
        </g>
        {crew.map((m, i) => {
          const y = TOP + i * ROW_H;
          const mk = marks.get(m.code);
          const jitter = (k: number) => ((rng(`j:${m.code}:${k}`).next() - 0.5) * 3).toFixed(1);
          return (
            <g key={m.code}>
              {i === activeRow && <rect x={20} y={y} width={596} height={ROW_H} className="fill-highlight/25" />}
              <line x1={cols.n - 4} x2={612} y1={y} y2={y} className="stroke-ink/25" strokeWidth={0.6} />
              <g fontSize={8} className="fill-ink/85">
                <text x={cols.n} y={y + 12}>{i + 1}</text>
                <text x={cols.code} y={y + 12} fontFamily="ui-monospace, monospace">{m.code}</text>
                <text x={cols.name} y={y + 12}>{m.fullName.length > 26 ? `${m.fullName.slice(0, 25)}…` : m.fullName}</text>
                <text x={cols.trade} y={y + 12}>{m.trade.length > 15 ? `${m.trade.slice(0, 14)}…` : m.trade}</text>
                <text x={cols.shift} y={y + 12}>{m.shift === "day" ? "Day" : "Night"}</text>
              </g>
              {mk && (
                <g className="fill-primary" style={hand} fontSize={12}>
                  {mk.mark !== "P" && (
                    <text x={(mk.mark === "A" ? cols.a : mk.mark === "L" ? cols.l : cols.s) + 9} y={y + 13} transform={`rotate(${jitter(1)} ${cols.a} ${y})`}>
                      ✓
                    </text>
                  )}
                  {mk.ot > 0 && <text x={cols.ot + 2} y={y + 13} transform={`rotate(${jitter(2)} ${cols.ot} ${y})`}>{mk.ot}</text>}
                  {mk.remarks && <text x={cols.rem} y={y + 13} fontSize={10}>{mk.remarks}</text>}
                </g>
              )}
            </g>
          );
        })}
        {[cols.code - 4, cols.name - 4, cols.trade - 4, cols.shift - 4, cols.a, cols.l, cols.s, cols.ot - 2, cols.rem - 4].map((x) => (
          <line key={x} x1={x} x2={x} y1={TOP - 18} y2={TOP + crew.length * ROW_H} className="stroke-ink/25" strokeWidth={0.6} />
        ))}
        <g transform={`translate(${cols.n} ${TOP + crew.length * ROW_H + 42})`}>
          <path d="M4 10c10-18 14 12 24-4s8-10 14 2 10 6 18-6 12 10 22 2" fill="none" className="stroke-primary" strokeWidth={1.6} strokeLinecap="round" />
          <line x1={0} x2={220} y1={18} y2={18} className="stroke-ink/50" strokeWidth={0.6} />
          <text y={30} fontSize={8} className="fill-ink/60">Supervisor signature · {site?.supervisor}</text>
        </g>
      </g>
    </svg>
  );
}
function QrInline({ token }: { token: string }) {
  return (
    <g transform="scale(2.4)">
      <rect x={-1} y={-1} width={N + 2} height={N + 2} className="fill-paper" />
      <path d={qrPath(token)} className="fill-ink/90" />
    </g>
  );
}

/** The scan docked beside the grid, with zoom (Design Brief "Attendance entry"). */
export function ScanViewer({ children, zoom, setZoom, title, meta, scrollRef, className }: { children: ReactNode; zoom: number; setZoom: (z: number) => void; title: string; meta?: ReactNode; scrollRef?: React.Ref<HTMLDivElement>; className?: string }) {
  return (
    <section aria-label="Sheet scan" className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card", className)}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <ScanIcon aria-hidden className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-xs" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.75, zoom - 0.25))} disabled={zoom <= 0.75}>
            <MinusIcon />
          </Button>
          <button type="button" onClick={() => setZoom(1)} className="w-11 rounded text-center text-xs tabular-nums text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="outline" size="icon-xs" aria-label="Zoom in" onClick={() => setZoom(Math.min(2.5, zoom + 0.25))} disabled={zoom >= 2.5}>
            <PlusIcon />
          </Button>
        </div>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-muted">
        {children}
      </div>
    </section>
  );
}
