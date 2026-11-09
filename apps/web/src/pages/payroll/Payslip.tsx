/**
 * S-24 Payslip — every line with how it was derived (PRD §4.7: "every line traceable to its
 * source (hours, rule, rate)"). A4-style and printable from the browser; chrome is data-print-hide.
 */
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, MessageCircleIcon, PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ruleTag, RUN_STATUS_LABEL, usePayslip, type PayslipLine } from "@/demo/payroll";
import { displayDate, statusLabel } from "@/lib/format";
import { KIND_LABEL } from "./PayrollRuns";


export function Payslip() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const q = usePayslip(id);
  const d = q.data;

  if (q.isPending) {
    return (
      <Page>
        <Skeleton className="h-12 w-full max-w-lg" />
        <Skeleton className="mx-auto h-[60rem] w-full max-w-[210mm]" />
      </Page>
    );
  }
  if (!d) {
    return (
      <Page>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No payslip with this ID</EmptyTitle>
            <EmptyDescription>Open payslips from a payroll run's review.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/payroll">Payroll runs</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }

  const { payslip: p, run } = d;
  const earnings = p.lines.filter((l) => l.kind === "earning");
  const deductions = p.lines.filter((l) => l.kind === "deduction");
  const employer = p.lines.filter((l) => l.kind === "employer");

  return (
    <Page>
      <div data-print-hide className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" asChild className="-ms-2 w-fit text-muted-foreground">
          <Link to={`/payroll/${run.id}`}>
            <ArrowLeftIcon data-icon="inline-start" className="rtl:rotate-180" /> {run.period.name} review
          </Link>
        </Button>
        <PageHeader
          screen="S-24"
          sample
          title={`Payslip · ${p.workerName}`}
          description="Every line shows how it was derived: quantity × rate, the rule version it used and the record it came from."
          actions={
            <>
              <div className="flex items-center gap-1" role="group" aria-label="Other payslips in this run">
                <Button variant="outline" size="icon" disabled={!d.prevId} onClick={() => d.prevId && navigate(`/payslips/${d.prevId}`)} aria-label="Previous worker">
                  <ChevronLeftIcon className="rtl:rotate-180" />
                </Button>
                <span className="px-1 text-sm text-muted-foreground tabular-nums">
                  {d.index + 1} of {d.count}
                </span>
                <Button variant="outline" size="icon" disabled={!d.nextId} onClick={() => d.nextId && navigate(`/payslips/${d.nextId}`)} aria-label="Next worker">
                  <ChevronRightIcon className="rtl:rotate-180" />
                </Button>
              </div>
              <Button variant="outline" onClick={() => window.print()}>
                <PrinterIcon data-icon="inline-start" /> Print
              </Button>
              <Button onClick={() => toast.success(`Payslip link sent by WhatsApp to ${p.workerName}`, { description: "Demo: no message left the system." })}>
                <MessageCircleIcon data-icon="inline-start" /> Send by WhatsApp
              </Button>
            </>
          }
        />
      </div>

      <article aria-label={`Payslip for ${p.workerName}, ${run.period.name}`} className="mx-auto flex w-full max-w-[210mm] flex-col gap-6 rounded-xl border bg-card p-5 shadow-xs sm:p-8 md:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Manpower Management System — demo entity OM-01</p>
            <p className="text-xs text-muted-foreground">Fictional sample data · not a legal document</p>
          </div>
          <div className="sm:text-end">
            <h2 className="text-lg font-semibold text-balance">Payslip · {run.period.name}</h2>
            <p className="text-xs text-muted-foreground">
              {KIND_LABEL[run.kind]} run · {RUN_STATUS_LABEL[run.status]} · ref {p.id}
            </p>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Fact k="Worker">
            <Link to={`/workers/${p.workerId}`} className="font-medium hover:underline">
              {p.workerName}
            </Link>
          </Fact>
          <Fact k="Code">
            <span className="font-mono">{p.workerCode}</span>
          </Fact>
          <Fact k="Trade">{p.trade}</Fact>
          <Fact k="Site">{p.siteName}</Fact>
          <Fact k="Status">{statusLabel(p.workerStatus)}</Fact>
          <Fact k="Pay period">
            {displayDate(run.period.startDate)} – {displayDate(run.period.endDate)}
          </Fact>
          <Fact k="Payment">
            WPS · Bank Muscat <span className="font-mono">{p.accountMask}</span>
          </Fact>
          <Fact k="Pay by">{displayDate(run.period.wpsDueDate)}</Fact>
          <Fact k="Run status">
            <StatusBadge tone={run.status === "released" ? "locked" : "draft"}>{run.status === "released" ? "Locked" : RUN_STATUS_LABEL[run.status]}</StatusBadge>
          </Fact>
        </dl>

        <Lines title="Earnings" lines={earnings} total={p.gross} totalLabel="Gross pay" />
        {deductions.length > 0 ? (
          <Lines title="Deductions" lines={deductions} total={p.deductions} totalLabel="Total deductions" />
        ) : (
          <section aria-label="Deductions" className="text-sm">
            <h3 className="mb-1 text-sm font-semibold">Deductions</h3>
            <p className="text-muted-foreground">No deductions this period.</p>
          </section>
        )}

        <div className="flex flex-col gap-1 rounded-lg border bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Net pay</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              Gross OMR {p.gross} − deductions OMR {p.deductions}
            </p>
          </div>
          <Money value={p.net} className="text-2xl font-semibold" />
        </div>

        <Lines title="Employer contributions" note="Paid by the employer on top of pay; not taken from the net." lines={employer} />

        <footer className="border-t pt-4 text-xs text-muted-foreground">
          Calculated from locked timesheets and the rule versions in force for {run.period.name}. Every rule shown is a demo value awaiting the labour lawyer's signature. Questions about this payslip: the payroll office, quoting ref {p.id}.
        </footer>
      </article>
    </Page>
  );
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

export function Lines({ title, note, lines, total, totalLabel }: { title: string; note?: string; lines: PayslipLine[]; total?: string; totalLabel?: string }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <div className="overflow-x-auto">
        <Table aria-label={title}>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 text-xs sm:w-[30%]">Item</TableHead>
              <TableHead className="hidden h-8 text-xs sm:table-cell">How it was derived</TableHead>
              <TableHead className="h-8 w-28 text-end text-xs">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.componentKey + l.sourceRef} className="align-top hover:bg-transparent">
                <TableCell className="py-2.5 whitespace-normal">
                  <div className="font-medium">{l.label}</div>
                  <div className="text-xs text-muted-foreground">{l.sourceRef}</div>
                  <div className="mt-1 text-sm sm:hidden">{l.trace}</div>
                  <div className="font-mono text-[11px] text-muted-foreground sm:hidden">{l.rule ? ruleTag(l.rule) : "contract term · not a legal rule"}</div>
                </TableCell>
                <TableCell className="hidden py-2.5 whitespace-normal sm:table-cell">
                  <div className="text-sm">{l.trace}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{l.rule ? ruleTag(l.rule) : "contract term · not a legal rule"}</div>
                </TableCell>
                <TableCell className="py-2.5">{l.amount === null ? <span className="block text-end text-xs text-muted-foreground">Pending D9</span> : <Money value={l.amount} bare />}</TableCell>
              </TableRow>
            ))}
            {total && (
              <TableRow className="border-t-2 hover:bg-transparent">
                <TableCell className="py-2 font-medium">
                  {totalLabel}
                </TableCell>
                <TableCell className="hidden sm:table-cell" />
                <TableCell className="py-2">
                  <Money value={total} bare className="font-semibold" />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
