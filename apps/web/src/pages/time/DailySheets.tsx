/**
 * S-39 Daily sheets (TR-CLI-12, App Flow "daily attendance to locked timesheet" step 1): tomorrow's
 * pre-filled sheet for every staffed site, printed in the office or sent to the supervisor by
 * WhatsApp, plus the last week's sheets and whether their scan came back (TR-CLI-14).
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EyeIcon, MessageCircleIcon, PrinterIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { DataTable, createColumns } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { dates, todayOman } from "@/demo/core";
import { clientById, siteById } from "@/demo/reference";
import { crewOf, getDailySheets, getRecentSheets, markPrinted, markSent, type DailySheetRow } from "@/demo/time";
import type { WorkerListItem } from "@/lib/api";
import { LoadError, SheetBadge, SheetPrint, dayLabel, fmtDateTime, fmtTime, usePrintSheets, useTimeQuery } from "./shared";

const col = createColumns<DailySheetRow>();

export function DailySheets() {
  const tomorrow = dates.addDays(todayOman(), 1);
  const qc = useQueryClient();
  const sheets = useTimeQuery(["sheets", tomorrow], (w) => getDailySheets(w, tomorrow));
  const recent = useTimeQuery(["sheets", "recent"], (w) => getRecentSheets(w));
  const [preview, setPreview] = useState<DailySheetRow | null>(null);
  const { portal, print } = usePrintSheets();
  const workers = sheets.workers;

  const printed = useMutation({
    mutationFn: (rows: DailySheetRow[]) => markPrinted(rows.map((r) => r.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["time", "sheets"] }),
  });
  const sent = useMutation({
    mutationFn: (rows: DailySheetRow[]) => markSent(rows.map((r) => r.id)),
    onSuccess: (_, rows) => {
      void qc.invalidateQueries({ queryKey: ["time", "sheets"] });
      toast.success(rows.length === 1 ? `Sheet sent to ${rows[0]!.supervisor} by WhatsApp` : `${rows.length} sheets sent to their supervisors by WhatsApp`, {
        description: rows.length === 1 ? `${rows[0]!.sheetNo} · PDF with QR code` : "Each supervisor gets their own site's PDF.",
      });
    },
  });

  const doPrint = (rows: DailySheetRow[]) => {
    if (!workers || !rows.length) return;
    print(rows.map((r) => <SheetPrint key={r.id} siteId={r.siteId} date={r.date} sheetNo={r.sheetNo} token={r.qrToken} crew={crewOf(workers, r.siteId)} />));
    printed.mutate(rows);
    toast(rows.length === 1 ? `Printing ${rows[0]!.sheetNo}` : `Printing ${rows.length} sheets`, { description: "Web uses the browser print dialog; the desktop app prints silently to the office printer." });
  };

  const rows = sheets.data ?? [];
  const unsent = rows.filter((r) => r.status !== "sent");
  const missing = (recent.data ?? []).filter((r) => r.status === "missing");
  const crewTotal = rows.reduce((s, r) => s + r.crewCount, 0);

  // Rebuilt each render: the row actions close over the latest workers and mutations (6 rows).
  const columns = col.columns([
        col.accessor("sheetNo", { header: "Sheet no.", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
        col.accessor("siteId", {
          header: "Site",
          cell: (c) => {
            const site = siteById(c.getValue());
            return (
              <div className="min-w-0">
                <div className="truncate font-medium">{site?.name}</div>
                <div className="truncate text-xs text-muted-foreground">{clientById(c.row.original.clientId)?.legalName}</div>
              </div>
            );
          },
        }),
        col.accessor("supervisor", { header: "Supervisor" }),
        col.accessor("crewCount", {
          header: () => <div className="text-end">Crew</div>,
          cell: (c) => <div className="text-end tabular-nums">{c.getValue()}</div>,
        }),
        col.display({
          id: "shift",
          header: "Shifts",
          cell: ({ row }) => (
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {row.original.dayShift} day{row.original.nightShift ? ` · ${row.original.nightShift} night` : ""}
            </span>
          ),
        }),
        col.accessor("status", {
          header: "Status",
          cell: (c) => {
            const r = c.row.original;
            const when = r.status === "sent" ? r.sentAt : r.status === "printed" ? r.printedAt : r.status === "scan_filed" ? r.scanFiledAt : null;
            return (
              <div className="flex items-center gap-2">
                <SheetBadge status={c.getValue()} />
                {when && <span className="text-xs text-muted-foreground tabular-nums">{r.date > todayOman() ? fmtTime(when) : fmtDateTime(when)}</span>}
              </div>
            );
          },
        }),
        col.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <IconAction label={`Preview ${row.original.sheetNo}`} onClick={() => setPreview(row.original)} icon={<EyeIcon />} />
              <IconAction label={`Print ${row.original.sheetNo}`} onClick={() => doPrint([row.original])} icon={<PrinterIcon />} />
              <IconAction label={`Send to ${row.original.supervisor} by WhatsApp`} onClick={() => sent.mutate([row.original])} icon={<MessageCircleIcon />} />
            </div>
          ),
        }),
      ]);

  const recentColumns = useMemo(
    () =>
      col.columns([
        col.accessor("date", { header: "Date", cell: (c) => <span className="whitespace-nowrap tabular-nums">{dayLabel(c.getValue())}</span> }),
        col.accessor("siteId", { header: "Site", cell: (c) => <span className="font-medium">{siteById(c.getValue())?.name}</span> }),
        col.accessor("sheetNo", { header: "Sheet no.", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
        col.accessor("crewCount", { header: () => <div className="text-end">Crew</div>, cell: (c) => <div className="text-end tabular-nums">{c.getValue()}</div> }),
        col.accessor("status", {
          header: "Scan",
          cell: (c) => (
            <div className="flex items-center gap-2">
              <SheetBadge status={c.getValue()} />
              {c.row.original.scanFiledAt && <span className="text-xs text-muted-foreground tabular-nums">{fmtDateTime(c.row.original.scanFiledAt)}</span>}
            </div>
          ),
        }),
        col.display({
          id: "next",
          header: () => <span className="sr-only">Next step</span>,
          cell: ({ row }) =>
            row.original.status === "missing" ? (
              <div className="flex justify-end">
                <Button size="xs" variant="outline" onClick={() => toast.success(`Reminder sent to ${row.original.supervisor}`, { description: `WhatsApp: "Please send the photo of sheet ${row.original.sheetNo}."` })}>
                  <SendIcon data-icon="inline-start" />
                  Ask for the photo
                </Button>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button size="xs" variant="ghost" asChild>
                  <Link to={`/attendance?sd=${encodeURIComponent(row.original.id)}`}>Open entry</Link>
                </Button>
              </div>
            ),
        }),
      ]),
    [],
  );

  return (
    <Page>
      <PageHeader
        screen="S-39"
        sample
        title="Daily sheets"
        description="Tomorrow's attendance sheet for every staffed site, pre-filled from the roster with a QR code for the site, date and sheet number. Print them here or send them to the supervisor by WhatsApp."
        actions={
          <>
            <Button variant="outline" disabled={!unsent.length || sent.isPending} onClick={() => sent.mutate(unsent)}>
              <MessageCircleIcon data-icon="inline-start" />
              Send {unsent.length || ""} by WhatsApp
            </Button>
            <Button disabled={!rows.length} onClick={() => doPrint(rows)}>
              <PrinterIcon data-icon="inline-start" />
              Print all {rows.length || ""}
            </Button>
          </>
        }
      />
      <LoadError error={sheets.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={`Sheets for ${dayLabel(tomorrow)}`} value={sheets.loading ? "…" : rows.length} hint="One per staffed site" />
        <KpiCard label="Workers on the sheets" value={sheets.loading ? "…" : crewTotal} hint="Deployed crew from the roster" />
        <KpiCard label="Printed or sent" value={sheets.loading ? "…" : `${rows.filter((r) => r.status !== "generated").length} of ${rows.length}`} hint="Sheets leave the office by 18:00" />
        <KpiCard label="Scans missing (7 days)" value={recent.loading ? "…" : missing.length} hint={missing.length ? "Flagged the next morning" : "Every site-day has its scan"} className={missing.length ? "border-destructive/30" : undefined} />
      </div>

      <Tabs defaultValue="tomorrow">
        <TabsList>
          <TabsTrigger value="tomorrow">Tomorrow</TabsTrigger>
          <TabsTrigger value="recent">
            Last 7 days
            {missing.length > 0 && (
              <Badge variant="destructive" className="ms-1 h-4 px-1.5 tabular-nums">
                {missing.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tomorrow" className="mt-3">
          <DataTable
            label={`Daily sheets for ${dayLabel(tomorrow)}`}
            columns={columns}
            data={sheets.data}
            loading={sheets.loading}
            getRowId={(r) => r.id}
            onRowClick={setPreview}
            selectable
            bulkActions={(sel, clear) => (
              <>
                <Button size="sm" variant="outline" onClick={() => (doPrint(sel), clear())}>
                  <PrinterIcon data-icon="inline-start" />
                  Print {sel.length}
                </Button>
                <Button size="sm" variant="outline" onClick={() => (sent.mutate(sel), clear())}>
                  <MessageCircleIcon data-icon="inline-start" />
                  Send {sel.length} by WhatsApp
                </Button>
              </>
            )}
            empty="No sheets for tomorrow: no site has a rostered crew that day. Assign workers on the roster board to generate sheets."
          />
        </TabsContent>
        <TabsContent value="recent" className="mt-3 space-y-3">
          {missing.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <TriangleAlertIcon aria-hidden className="size-4" />
              {missing.length} site-{missing.length === 1 ? "day has" : "days have"} no filed scan. Hours for those days cannot be entered until the photo arrives.
            </p>
          )}
          <DataTable label="Daily sheets, last 7 days" columns={recentColumns} data={recent.data} loading={recent.loading} getRowId={(r) => r.id} search={(r, q) => `${siteById(r.siteId)?.name} ${r.sheetNo}`.toLowerCase().includes(q)} searchPlaceholder="Filter by site or sheet…" empty="No sheets in the last 7 days." />
        </TabsContent>
      </Tabs>

      <SheetPreview row={preview} workers={workers} onClose={() => setPreview(null)} onPrint={(r) => doPrint([r])} onSend={(r) => sent.mutate([r])} />
      {portal}
    </Page>
  );
}

function IconAction({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SheetPreview({ row, workers, onClose, onPrint, onSend }: { row: DailySheetRow | null; workers: WorkerListItem[] | undefined; onClose: () => void; onPrint: (r: DailySheetRow) => void; onSend: (r: DailySheetRow) => void }) {
  const site = row ? siteById(row.siteId) : null;
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92svh] flex-col gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="flex-row flex-wrap items-center gap-3 border-b px-4 py-3 pe-12">
          <div className="min-w-0 flex-1 text-start">
            <DialogTitle>{site?.name} · {row && dayLabel(row.date)}</DialogTitle>
            <DialogDescription className="text-xs">
              <span className="font-mono">{row?.sheetNo}</span> · A4 print layout · {row?.crewCount} workers
            </DialogDescription>
          </div>
          {row && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onSend(row)}>
                <MessageCircleIcon data-icon="inline-start" />
                Send to {row.supervisor.split(" ")[0]}
              </Button>
              <Button size="sm" onClick={() => onPrint(row)}>
                <PrinterIcon data-icon="inline-start" />
                Print
              </Button>
            </div>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-muted p-3 sm:p-6">
          {row && workers && <SheetPrint siteId={row.siteId} date={row.date} sheetNo={row.sheetNo} token={row.qrToken} crew={crewOf(workers, row.siteId)} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
