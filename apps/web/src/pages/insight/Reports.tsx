/**
 * S-34 Reports (PRD §4.16: about 40 standard reports, saved views, scheduled email/WhatsApp
 * delivery, export to Excel/PDF). Workforce and Compliance previews use LIVE data; the other
 * groups preview demo rows from src/demo/insight.ts until their modules' APIs exist.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { documentLabel } from "@mms/core";
import { BookmarkPlusIcon, CalendarClockIcon, ChevronRightIcon, FileSpreadsheetIcon, FileTextIcon, MailIcon, MessageCircleIcon, SearchIcon } from "lucide-react";
import { api, type RenewalItem } from "@/lib/api";
import { describeExpiry, displayDate, statusLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import { dates, todayOman } from "@/demo/core";
import { useWorkforce } from "@/demo/workforce";
import {
  createSchedule,
  displayMoment,
  fetchSavedViews,
  fetchSchedules,
  personOf,
  REPORT_GROUPS,
  REPORT_SAMPLES,
  REPORTS,
  saveView,
  type Channel,
  type Frequency,
  type Report,
  type ReportGroup,
  type SavedView,
  type Schedule,
} from "@/demo/insight";
import { Page, PageHeader } from "@/components/page-header";
import { createColumns, DataTable } from "@/components/data-table";
import { ComplianceBadge, StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const reportById = (id: string) => REPORTS.find((r) => r.id === id);
const FREQ_LABEL: Record<Frequency, string> = { daily: "Daily, 07:00", weekly: "Weekly, Sunday 07:00", monthly: "Monthly, 1st at 07:00" };
const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", whatsapp: "WhatsApp" };

function exportToast(report: Report, format: "Excel" | "PDF") {
  toast.success(`${report.name} exported to ${format}`, { description: "Demo build: in the live system the file downloads straight away." });
}

export function Reports() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ReportGroup | "all">("all");
  const [preview, setPreview] = useState<Report | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Report | "pick" | null>(null);
  const [saveFor, setSaveFor] = useState<Report | null>(null);
  const views = useQuery({ queryKey: ["report-views"], queryFn: fetchSavedViews });
  const schedules = useQuery({ queryKey: ["report-schedules"], queryFn: fetchSchedules });
  const vColumns = useMemo(() => viewColumns(setPreview), []);

  const q = query.trim().toLowerCase();
  const visible = REPORTS.filter((r) => (group === "all" || r.group === group) && (!q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)));
  const groups = REPORT_GROUPS.filter((g) => visible.some((r) => r.group === g));

  return (
    <Page>
      <PageHeader
        screen="S-34"
        title="Reports"
        sample
        description={`${REPORTS.length} standard reports. Preview any of them, save the filters you use, or have them delivered by email or WhatsApp.`}
        actions={
          <Button onClick={() => setScheduleFor("pick")}>
            <CalendarClockIcon aria-hidden /> Schedule delivery
          </Button>
        }
      />

      <Tabs defaultValue="catalogue" className="gap-4">
        <TabsList>
          <TabsTrigger value="catalogue">Catalogue ({REPORTS.length})</TabsTrigger>
          <TabsTrigger value="views">Saved views{views.data ? ` (${views.data.length})` : ""}</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled{schedules.data ? ` (${schedules.data.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="catalogue" className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <InputGroup className="lg:max-w-xs">
              <InputGroupAddon>
                <SearchIcon aria-hidden />
              </InputGroupAddon>
              <InputGroupInput aria-label="Search reports" placeholder="Search reports…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </InputGroup>
            <ToggleGroup type="single" variant="outline" size="sm" value={group} onValueChange={(v) => setGroup((v || "all") as ReportGroup | "all")} className="flex-wrap" aria-label="Filter by group">
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              {REPORT_GROUPS.map((g) => (
                <ToggleGroupItem key={g} value={g}>
                  {g}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {groups.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No report matches “{query}”. Try a word like “overtime” or “ageing”.</p>
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {groups.map((g) => {
                const rows = visible.filter((r) => r.group === g);
                return (
                  <Card key={g} className="gap-2 py-4">
                    <CardHeader className="px-4">
                      <CardTitle className="flex items-center justify-between text-base">
                        {g}
                        <span className="text-xs font-normal text-muted-foreground tabular-nums">{rows.length} reports</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2">
                      <ul>
                        {rows.map((r) => (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => setPreview(r)}
                              className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-start transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">{r.name}</span>
                                <span className="block text-xs text-muted-foreground text-pretty">{r.description}</span>
                              </span>
                              <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="views">
          <DataTable
            label="Saved views"
            columns={vColumns}
            data={views.data}
            loading={views.isPending}
            getRowId={(r) => r.id}
            onRowClick={(v) => setPreview(reportById(v.reportId) ?? null)}
            search={(r, q2) => r.name.toLowerCase().includes(q2)}
            empty="No saved views yet. Open a report and choose Save view."
          />
        </TabsContent>

        <TabsContent value="scheduled">
          <DataTable
            label="Scheduled deliveries"
            columns={scheduleColumns}
            data={schedules.data}
            loading={schedules.isPending}
            getRowId={(r) => r.id}
            empty="Nothing is scheduled. Use Schedule delivery to send a report automatically."
          />
        </TabsContent>
      </Tabs>

      <PreviewSheet
        report={preview}
        onClose={() => setPreview(null)}
        onSchedule={(r) => setScheduleFor(r)}
        onSave={(r) => setSaveFor(r)}
      />
      <ScheduleDialog initial={scheduleFor} onClose={() => setScheduleFor(null)} />
      <SaveViewDialog report={saveFor} onClose={() => setSaveFor(null)} />
    </Page>
  );
}

function PreviewSheet({ report, onClose, onSchedule, onSave }: { report: Report | null; onClose: () => void; onSchedule: (r: Report) => void; onSave: (r: Report) => void }) {
  return (
    <Sheet open={report !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        {report && (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{report.group}</Badge>
                {report.group === "Workforce" || report.group === "Compliance" ? <StatusBadge tone="ok">Live data</StatusBadge> : <StatusBadge tone="incomplete">Sample rows</StatusBadge>}
              </div>
              <SheetTitle className="text-lg">{report.name}</SheetTitle>
              <SheetDescription>{report.description}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-auto p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Preview of the first rows · as of {displayDate(todayOman())} · all sites and clients
              </p>
              <PreviewTable report={report} />
            </div>
            <SheetFooter className="flex-row flex-wrap gap-2 border-t">
              <Button onClick={() => exportToast(report, "Excel")}>
                <FileSpreadsheetIcon aria-hidden /> Export Excel
              </Button>
              <Button variant="outline" onClick={() => exportToast(report, "PDF")}>
                <FileTextIcon aria-hidden /> Export PDF
              </Button>
              <Button variant="outline" onClick={() => onSave(report)}>
                <BookmarkPlusIcon aria-hidden /> Save view
              </Button>
              <Button variant="outline" onClick={() => onSchedule(report)}>
                <CalendarClockIcon aria-hidden /> Schedule
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PreviewTable({ report }: { report: Report }) {
  const workforce = useWorkforce();
  const renewals = useQuery({ queryKey: ["renewals"], queryFn: () => api.get<{ items: RenewalItem[] }>("/api/compliance/renewals"), enabled: report.group === "Compliance" });

  if (report.group === "Workforce" || report.group === "Compliance") {
    const loading = report.group === "Workforce" ? workforce.isPending : renewals.isPending;
    if (loading) return <Skeleton className="h-64 w-full" />;
    if (report.group === "Workforce") {
      return (
        <Table aria-label={`${report.name} preview`}>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Trade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Papers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(workforce.data ?? []).slice(0, 12).map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-mono text-xs">{w.code}</TableCell>
                <TableCell className="font-medium">{w.fullName}</TableCell>
                <TableCell>{w.trade}</TableCell>
                <TableCell>{statusLabel(w.status)}</TableCell>
                <TableCell>
                  <ComplianceBadge state={w.compliance.state} daysLeft={w.compliance.nextExpiry?.daysLeft} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }
    return (
      <Table aria-label={`${report.name} preview`}>
        <TableHeader>
          <TableRow>
            <TableHead>Worker</TableHead>
            <TableHead>Document</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(renewals.data?.items ?? []).slice(0, 12).map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="font-medium">{r.workerName}</div>
                <div className="font-mono text-xs text-muted-foreground">{r.workerCode}</div>
              </TableCell>
              <TableCell>{documentLabel(r.type)}</TableCell>
              <TableCell className="tabular-nums">{displayDate(r.expiryDate)}</TableCell>
              <TableCell>
                <StatusBadge tone={r.daysLeft < 0 ? "expired" : r.daysLeft <= 30 ? "due" : "info"}>{describeExpiry(r.daysLeft)}</StatusBadge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  const sample = REPORT_SAMPLES[report.group];
  return (
    <Table aria-label={`${report.name} preview`}>
      <TableHeader>
        <TableRow>
          {sample.columns.map((c, i) => (
            <TableHead key={c} className={cn(sample.numeric.includes(i) && "text-end")}>
              {c}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sample.rows.map((row) => (
          <TableRow key={row[0]}>
            {row.map((cell, i) => (
              <TableCell key={i} className={cn(i === 0 && "font-medium", sample.numeric.includes(i) && "text-end tabular-nums")}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function nextRun(f: Frequency): string {
  const today = todayOman();
  if (f === "daily") return dates.addDays(today, 1);
  if (f === "monthly") return dates.addMonths(today, 1);
  let d = dates.addDays(today, 1);
  while (dates.weekday(d) !== 0) d = dates.addDays(d, 1);
  return d;
}

function ScheduleDialog({ initial, onClose }: { initial: Report | "pick" | null; onClose: () => void }) {
  const open = initial !== null;
  return <Dialog open={open} onOpenChange={(o) => !o && onClose()}>{open && <ScheduleForm key={initial === "pick" ? "pick" : initial.id} initial={initial === "pick" ? null : initial} onDone={onClose} />}</Dialog>;
}

function ScheduleForm({ initial, onDone }: { initial: Report | null; onDone: () => void }) {
  const { account } = useSession();
  const qc = useQueryClient();
  const [reportId, setReportId] = useState(initial?.id ?? "");
  const [channels, setChannels] = useState<Channel[]>(["email"]);
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [format, setFormat] = useState<"excel" | "pdf">("excel");
  const [recipients, setRecipients] = useState(account?.email ?? "");
  const [submitted, setSubmitted] = useState(false);

  const list = recipients.split(/[,;\s]+/).filter(Boolean);
  const errors = {
    report: reportId ? null : "Choose the report to send.",
    channels: channels.length ? null : "Pick at least one way to deliver it.",
    recipients: list.length === 0 ? "Add at least one recipient." : list.find((r) => !/^\S+@\S+\.\S+$/.test(r) && !/^\+?\d[\d ]{7,}$/.test(r)) ? "Use email addresses or phone numbers with country code, separated by commas." : null,
  };
  const valid = !errors.report && !errors.channels && !errors.recipients;

  const create = useMutation({
    mutationFn: () => createSchedule({ reportId, channels, frequency, format, recipients: list, nextRun: nextRun(frequency), createdBy: account?.username ?? "" }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      toast.success(`${reportById(s.reportId)?.name} scheduled`, { description: `${FREQ_LABEL[s.frequency]} by ${s.channels.map((c) => CHANNEL_LABEL[c]).join(" and ")}. First run ${displayDate(s.nextRun)}.` });
      onDone();
    },
    onError: (e) => toast.error("Couldn't schedule the report", { description: String(e) }),
  });

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Schedule delivery</DialogTitle>
        <DialogDescription>The report runs on its own and arrives as a file, with a link that opens it in the app.</DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
          if (valid) create.mutate();
        }}
      >
        <FieldGroup className="gap-5">
          <Field data-invalid={submitted && !!errors.report}>
            <FieldLabel htmlFor="sched-report">Report</FieldLabel>
            <Select value={reportId} onValueChange={setReportId}>
              <SelectTrigger id="sched-report" className="w-full" aria-invalid={submitted && !!errors.report}>
                <SelectValue placeholder="Choose a report" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {REPORT_GROUPS.map((g) => (
                  <SelectGroup key={g}>
                    <SelectLabel>{g}</SelectLabel>
                    {REPORTS.filter((r) => r.group === g).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {submitted && errors.report && <FieldError>{errors.report}</FieldError>}
          </Field>

          <FieldSet data-invalid={submitted && !!errors.channels}>
            <FieldLegend variant="label">Send by</FieldLegend>
            <div className="flex gap-6">
              {(["email", "whatsapp"] as const).map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <Checkbox
                    id={`ch-${c}`}
                    checked={channels.includes(c)}
                    onCheckedChange={(v) => setChannels((cur) => (v ? [...cur, c] : cur.filter((x) => x !== c)))}
                  />
                  <Label htmlFor={`ch-${c}`} className="font-normal">
                    {c === "email" ? <MailIcon aria-hidden className="size-4 text-muted-foreground" /> : <MessageCircleIcon aria-hidden className="size-4 text-muted-foreground" />}
                    {CHANNEL_LABEL[c]}
                  </Label>
                </div>
              ))}
            </div>
            {submitted && errors.channels && <FieldError>{errors.channels}</FieldError>}
          </FieldSet>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel id="freq-label">How often</FieldLabel>
              <ToggleGroup type="single" variant="outline" size="sm" value={frequency} onValueChange={(v) => v && setFrequency(v as Frequency)} aria-labelledby="freq-label">
                <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
                <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
                <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>{FREQ_LABEL[frequency]} · first run {displayDate(nextRun(frequency))}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel id="fmt-label">File</FieldLabel>
              <ToggleGroup type="single" variant="outline" size="sm" value={format} onValueChange={(v) => v && setFormat(v as "excel" | "pdf")} aria-labelledby="fmt-label">
                <ToggleGroupItem value="excel">Excel</ToggleGroupItem>
                <ToggleGroupItem value="pdf">PDF</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </div>

          <Field data-invalid={submitted && !!errors.recipients}>
            <FieldLabel htmlFor="sched-to">Recipients</FieldLabel>
            <Input id="sched-to" value={recipients} onChange={(e) => setRecipients(e.target.value)} aria-invalid={submitted && !!errors.recipients} placeholder="name@company.example, +968 9000 0000" />
            {submitted && errors.recipients ? <FieldError>{errors.recipients}</FieldError> : <FieldDescription>Separate with commas. WhatsApp needs a phone number.</FieldDescription>}
          </Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" disabled={create.isPending}>
            Schedule
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function SaveViewDialog({ report, onClose }: { report: Report | null; onClose: () => void }) {
  const { account } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: () => saveView({ name: name.trim(), reportId: report!.id, filters: "Period: this month · All sites", owner: account?.username ?? "" }),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["report-views"] });
      toast.success(`Saved “${v.name}”`, { description: "Find it under Saved views." });
      setName("");
      onClose();
    },
  });
  return (
    <Dialog open={report !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
          <DialogDescription>Keeps {report?.name}'s current filters under a name you'll recognise.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate();
          }}
          className="space-y-4"
        >
          <Field>
            <FieldLabel htmlFor="view-name">Name</FieldLabel>
            <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sohar sites this month" autoFocus />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              Save view
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const vcol = createColumns<SavedView>();
const viewColumns = (open: (r: Report) => void) =>
  vcol.columns([
    vcol.accessor("name", { header: "View", cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
    vcol.accessor("reportId", { header: "Report", cell: (c) => reportById(c.getValue())?.name ?? "—" }),
    vcol.accessor("filters", { header: "Filters", cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span> }),
    vcol.accessor("owner", { header: "Owner", cell: (c) => personOf(c.getValue()) }),
    vcol.accessor("lastRun", { header: "Last run", cell: (c) => <span className="whitespace-nowrap tabular-nums">{displayMoment(c.getValue())}</span> }),
    vcol.display({
      id: "open",
      header: () => <span className="sr-only">Open</span>,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            const r = reportById(row.original.reportId);
            if (r) open(r);
          }}
        >
          Open
        </Button>
      ),
    }),
  ]);

const scol = createColumns<Schedule>();
const scheduleColumns = scol.columns([
  scol.accessor("reportId", { header: "Report", cell: (c) => <span className="font-medium">{reportById(c.getValue())?.name ?? "—"}</span> }),
  scol.accessor("channels", {
    header: "Send by",
    cell: (c) => (
      <div className="flex gap-1">
        {c.getValue().map((ch) => (
          <Badge key={ch} variant="outline">
            {ch === "email" ? <MailIcon aria-hidden /> : <MessageCircleIcon aria-hidden />}
            {CHANNEL_LABEL[ch]}
          </Badge>
        ))}
      </div>
    ),
  }),
  scol.accessor("frequency", { header: "How often", cell: (c) => FREQ_LABEL[c.getValue()] }),
  scol.accessor("recipients", { header: "Recipients", cell: (c) => <span className="text-muted-foreground">{c.getValue().join(", ")}</span> }),
  scol.accessor("format", { header: "File", cell: (c) => (c.getValue() === "excel" ? "Excel" : "PDF") }),
  scol.accessor("nextRun", { header: "Next run", cell: (c) => <span className="whitespace-nowrap tabular-nums">{displayDate(c.getValue())}</span> }),
]);
