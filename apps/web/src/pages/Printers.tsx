/**
 * S-35 Printers (desktop only, TR-CLI-07; Design Brief "Desktop: silent bulk printing, printer
 * picker remembered"): which printer each kind of job goes to on this PC, printed with no dialogs.
 * Native <select>s on purpose: no portal, instant keyboard use, and they keep Printers.test.tsx's
 * contract (label, value, options).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleCheckIcon, PrinterIcon, TriangleAlertIcon } from "lucide-react";
import { desktop, JOB_TYPES, saveProfile, savedProfiles, type JobType, type PrinterProfile, type RenderMode } from "@/lib/desktop";
import { Page, PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SELECT =
  "h-8 w-full min-w-44 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

export function Printers() {
  const printers = useQuery({ queryKey: ["printers"], queryFn: desktop.listPrinters });
  const [profiles, setProfiles] = useState(savedProfiles());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fallback = printers.data?.find((p) => p.is_default)?.name ?? printers.data?.[0]?.name ?? "";
  const profileFor = (job: JobType): PrinterProfile => profiles[job] ?? { printer: fallback, mode: "direct" };

  const update = (job: JobType, change: Partial<PrinterProfile>) => {
    const next = { ...profileFor(job), ...change };
    saveProfile(job, next);
    setProfiles((p) => ({ ...p, [job]: next }));
  };

  const testPrint = async (profile: PrinterProfile) => {
    setBusy(true);
    setMessage(null);
    try {
      const report = await desktop.printTestPage(profile);
      setMessage(
        report.failed.length
          ? { ok: false, text: `The printer refused the test page: ${report.failed[0]![1]}` }
          : { ok: true, text: `Test page sent to ${profile.printer}.` },
      );
    } catch (err) {
      setMessage({ ok: false, text: String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader
        screen="S-35"
        title="Printers"
        description="Choose where each kind of document prints on this PC. Batches print straight to the printer with no dialog."
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Printer for each job</CardTitle>
          <CardDescription>Saved on this PC only. Use PostScript if an older printer prints garbled pages.</CardDescription>
        </CardHeader>
        <CardContent>
          {printers.isPending ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Looking for printers…</p>
              {JOB_TYPES.map((j) => (
                <Skeleton key={j.key} className="h-10" />
              ))}
            </div>
          ) : printers.isError ? (
            <Alert variant="destructive">
              <TriangleAlertIcon aria-hidden />
              <AlertTitle>Couldn't read this PC's printers</AlertTitle>
              <AlertDescription>{String(printers.error)}</AlertDescription>
            </Alert>
          ) : printers.data.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PrinterIcon />
                </EmptyMedia>
                <EmptyTitle>No printers on this PC</EmptyTitle>
                <EmptyDescription>Add one in Windows Settings, then reopen this page.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table aria-label="Printer for each job">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Job</TableHead>
                  <TableHead scope="col">Printer</TableHead>
                  <TableHead scope="col">Send as</TableHead>
                  <TableHead scope="col">
                    <span className="sr-only">Test</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {JOB_TYPES.map((job) => {
                  const profile = profileFor(job.key);
                  return (
                    <TableRow key={job.key}>
                      <TableHead scope="row" className="font-medium text-foreground">
                        {job.label}
                      </TableHead>
                      <TableCell>
                        <select className={SELECT} aria-label={`${job.label} printer`} value={profile.printer} onChange={(e) => update(job.key, { printer: e.target.value })}>
                          {printers.data.map((p) => (
                            <option key={p.name} value={p.name}>
                              {p.name}
                              {p.is_default ? " (Windows default)" : ""}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <select className={SELECT} aria-label={`${job.label} format`} value={profile.mode} onChange={(e) => update(job.key, { mode: e.target.value as RenderMode })}>
                          <option value="direct">PDF (most printers)</option>
                          <option value="post_script">PostScript (older printers)</option>
                        </select>
                      </TableCell>
                      <TableCell className="text-end">
                        <Button variant="outline" size="sm" disabled={busy || !profile.printer} aria-label={`Print test page on ${job.label} printer`} onClick={() => testPrint(profile)}>
                          {busy ? <Spinner /> : <PrinterIcon aria-hidden />} Print test page
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {message &&
        (message.ok ? (
          <Alert role="status">
            <CircleCheckIcon aria-hidden className="text-success" />
            <AlertTitle>{message.text}</AlertTitle>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden />
            <AlertTitle>Test page not printed</AlertTitle>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ))}
    </Page>
  );
}
