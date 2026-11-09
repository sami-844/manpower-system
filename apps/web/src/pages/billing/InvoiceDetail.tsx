/**
 * S-28 detail: one tax invoice (route /invoices/:id). A4 layout that prints as the compliant tax
 * invoice (PRD 4.8), with status, payment allocations, credit notes and reminders beside it.
 * Issued invoices are locked (CLAUDE.md rule 7): corrections are credit notes, which need a second
 * approver (rule 6). Disputes mark specific lines; the original invoice is never edited.
 */
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { BanIcon, CheckIcon, FileMinusIcon, FlagIcon, LockIcon, MailIcon, PrinterIcon, ReceiptIcon, WrenchIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney, Money } from "@/components/money";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/lib/session";
import { displayDate } from "@/lib/format";
import { dates, money, todayOman } from "@/demo/core";
import { clientById, contractOf, siteById } from "@/demo/reference";
import {
  approveCreditNote,
  billingKeys,
  disputeLine,
  getInvoice,
  HOUR_LABEL,
  raiseCreditNote,
  read,
  recordPayment,
  REMINDER_STEPS,
  useDemoMutation,
  vatCodeOn,
  vatOf,
  vatRef,
  type InvoiceDetail as Detail,
  type InvoiceLine,
  type PaymentMethod,
} from "@/demo/billing";
import { InvoiceStatusBadge } from "./Invoices";
import { cn } from "@/lib/utils";

const AMOUNT = /^\d+(\.\d{1,3})?$/;
const METHOD_LABEL: Record<PaymentMethod, string> = { bank_transfer: "Bank transfer", cheque: "Cheque", cash: "Cash" };

export function InvoiceDetail() {
  const { id = "" } = useParams();
  const { account } = useSession();
  const me = account?.username ?? "finance.lead";
  const q = useQuery({ queryKey: billingKeys.invoice(id), queryFn: () => read(() => getInvoice(id)) });

  if (q.isPending) return <DetailSkeleton />;
  if (!q.data)
    return (
      <Page>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No invoice with this ID</EmptyTitle>
            <EmptyDescription>It may be a draft from another session. Drafts live until they are issued.</EmptyDescription>
          </EmptyHeader>
          <Button asChild variant="outline">
            <Link to="/invoices">Back to invoices</Link>
          </Button>
        </Empty>
      </Page>
    );

  const d = q.data;
  const inv = d.invoice;
  const client = clientById(inv.clientId)!;
  const draft = inv.status === "draft";
  const title = inv.number ?? `Draft · ${siteById(inv.siteId)!.name}`;
  const canPay = !draft && d.balance !== "0.000" && !d.balance.startsWith("-");

  return (
    <Page>
      <div data-print-hide>
        <PageHeader
          screen="S-28"
          sample
          title={title}
          description={
            <>
              <Link to={`/clients/${client.id}`} className="font-medium text-foreground hover:underline">
                {client.legalName}
              </Link>{" "}
              · {siteById(inv.siteId)!.name} · {dates.monthName(inv.periodStart)}
            </>
          }
          meta={
            <>
              <InvoiceStatusBadge view={d.view} />
              {!draft && (
                <StatusBadge tone="locked">Locked · corrections are credit notes</StatusBadge>
              )}
              <span className="text-xs text-muted-foreground tabular-nums">Balance {formatMoney(d.balance)}</span>
            </>
          }
          actions={
            <>
              <Button variant="outline" onClick={() => window.print()}>
                <PrinterIcon /> Print
              </Button>
              <Button
                variant="outline"
                disabled={draft}
                onClick={() => toast.success("PDF emailed", { description: `${title} sent to ${client.contacts.at(-1)!.email} with the timesheet summary attached.` })}
              >
                <MailIcon /> Email PDF
              </Button>
              {!draft && <CreditNoteDialog detail={d} me={me} />}
              {canPay && <PaymentDialog detail={d} me={me} />}
              {draft && (
                <Button asChild>
                  <Link to="/invoices">Issue from the Draft view</Link>
                </Button>
              )}
            </>
          }
        />
      </div>

      {inv.exceptions.length > 0 && (
        <Alert variant="destructive" data-print-hide>
          <BanIcon />
          <AlertTitle>Blocked: {inv.exceptions.length} line{inv.exceptions.length > 1 ? "s have" : " has"} no matching rate</AlertTitle>
          <AlertDescription>
            <p>{inv.exceptions.map((e) => e.message).join(". ")}. This draft can't be issued until the rate card has the rate or the lines are held.</p>
            <Button asChild size="sm" variant="outline" className="mt-2">
              <Link to={`/contracts/${inv.contractId}`}>
                <WrenchIcon /> Fix the rate card
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <TaxInvoice detail={d} me={me} />
        <aside className="flex flex-col gap-4" data-print-hide>
          <PaymentsCard detail={d} />
          <CreditNotesCard detail={d} me={me} />
          <RemindersCard detail={d} />
        </aside>
      </div>
    </Page>
  );
}

function DetailSkeleton() {
  return (
    <Page>
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[640px] w-full" />
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </Page>
  );
}

/** The printable A4 tax invoice. */
function TaxInvoice({ detail, me }: { detail: Detail; me: string }) {
  const inv = detail.invoice;
  const client = clientById(inv.clientId)!;
  const contract = contractOf(inv.clientId)!;
  const site = siteById(inv.siteId)!;
  const vat = vatCodeOn(inv.vatCode, inv.issuedOn ?? todayOman());
  const hours = inv.lines.filter((l) => l.kind === "hours");
  const charges = inv.lines.filter((l) => l.kind === "charge");
  const credited = money.sum(detail.creditNotes.filter((c) => c.status === "issued").map((c) => c.total));
  const paid = money.sum(detail.payments.map((p) => p.amount));
  const disputed = new Map(inv.disputes.filter((x) => !x.resolved).map((x) => [x.lineId, x]));
  const canDispute = inv.status !== "draft" && inv.status !== "paid";

  return (
    <article aria-label="Tax invoice" className="mx-auto w-full max-w-[52rem] rounded-lg border bg-card p-5 text-sm shadow-xs sm:p-8 print:max-w-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-base font-semibold">Manpower Management System — demo entity OM-01</p>
          <p className="text-muted-foreground">PO Box 0000, Ruwi, Muscat, Sultanate of Oman</p>
          <p className="text-muted-foreground tabular-nums">CR CR-DEMO-0001 · VATIN VAT-DEMO-OM01</p>
        </div>
        <div className="space-y-1 sm:text-end">
          <p className="text-xl font-semibold">{inv.status === "draft" ? "Draft tax invoice" : "Tax invoice"}</p>
          <p className="font-medium tabular-nums">{inv.number ?? "Number assigned on issue"}</p>
          {inv.status !== "draft" && (
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground sm:justify-end">
              <LockIcon aria-hidden className="size-3" /> Locked {displayDate(inv.issuedOn)}
            </p>
          )}
        </div>
      </header>

      <section className="grid gap-5 border-b py-5 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">Bill to</p>
          <p className="font-medium">{client.legalName}</p>
          <p className="text-muted-foreground">{client.city}, Sultanate of Oman</p>
          <p className="text-muted-foreground tabular-nums">
            CR {client.crNumber} · VATIN {client.vatNumber}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 sm:justify-self-end">
          <Meta label="Invoice date">{inv.issuedOn ? displayDate(inv.issuedOn) : "On issue"}</Meta>
          <Meta label="Service period">
            {displayDate(inv.periodStart)} – {displayDate(inv.periodEnd)}
          </Meta>
          <Meta label="Due date">{inv.dueDate ? displayDate(inv.dueDate) : `${client.paymentTermsDays} days from issue`}</Meta>
          <Meta label="Contract">{contract.reference}</Meta>
          <Meta label="Site">{site.name}</Meta>
          <Meta label="Rate card">{inv.rateCardRef}</Meta>
        </dl>
      </section>

      <section className="py-5" aria-labelledby="lines-h">
        <h2 id="lines-h" className="mb-2 text-xs font-medium text-muted-foreground uppercase">
          Labour from locked timesheet {inv.timesheetRef}
        </h2>
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm" aria-label="Labour lines">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="px-1.5 py-1.5 text-start font-medium">Trade</th>
                <th scope="col" className="px-1.5 py-1.5 text-start font-medium">Hour type</th>
                <th scope="col" className="px-1.5 py-1.5 text-end font-medium">Hours</th>
                <th scope="col" className="px-1.5 py-1.5 text-end font-medium">Rate</th>
                <th scope="col" className="px-1.5 py-1.5 text-end font-medium">Amount</th>
                {canDispute && <th scope="col" className="w-8 px-1 print:hidden"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {hours.map((l) => (
                <LineRow key={l.id} line={l} disputed={disputed.get(l.id)?.reason} action={canDispute && !disputed.has(l.id) ? <DisputeDialog invoiceId={inv.id} line={l} me={me} /> : null} showAction={canDispute} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-t pt-5 pb-2" aria-labelledby="charges-h">
        <h2 id="charges-h" className="mb-2 text-xs font-medium text-muted-foreground uppercase">
          Fixed charges ({contract.reference})
        </h2>
        <div className="-mx-1">
        <table className="w-full text-sm" aria-label="Fixed charges">
          <tbody>
            {charges.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-1.5 py-1.5">{l.description}</td>
                <td className="px-1.5 py-1.5">
                  <Money value={l.amount} bare />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section className="flex justify-end border-t pt-4">
        <dl className="grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5">
          <Total label="Subtotal" value={inv.subtotal} />
          <Total
            label={
              <span className="flex flex-col">
                {vatRef(vat).split(" · ")[0]}
                <span className="text-xs">vat_codes.{vat.key} v{vat.validFrom}</span>
              </span>
            }
            value={inv.vat}
            muted
          />
          <div className="col-span-2 my-1 border-t" />
          <Total label="Total" value={inv.total} strong />
          {credited !== "0.000" && <Total label="Less credit notes" value={`-${credited}`} muted />}
          {paid !== "0.000" && <Total label="Less payments" value={`-${paid}`} muted />}
          {inv.status !== "draft" && (
            <>
              <div className="col-span-2 my-1 border-t" />
              <Total label="Balance due" value={detail.balance} strong />
            </>
          )}
        </dl>
      </section>

      <footer className="mt-6 space-y-1 border-t pt-4 text-xs text-muted-foreground">
        <p>
          Pay by transfer to {/* masked: never a real account */}Bank Muscat account ••••0172, quoting the invoice number. Payment terms {client.paymentTermsDays} days.
        </p>
        <p>Backup: timesheet summary {inv.timesheetRef}, signed by the client, attached to the emailed PDF. Hours are invoiced once (each timesheet line at most once).</p>
      </footer>
    </article>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums sm:text-end">{children}</dd>
    </>
  );
}
function Total({ label, value, strong, muted }: { label: ReactNode; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <>
      <dt className={cn(strong ? "font-semibold" : "text-muted-foreground")}>{label}</dt>
      <dd>
        <Money value={value} className={cn(strong && "font-semibold", muted && "text-muted-foreground")} />
      </dd>
    </>
  );
}

function LineRow({ line, disputed, action, showAction }: { line: InvoiceLine; disputed?: string; action: ReactNode; showAction: boolean }) {
  const unmatched = line.rate === null;
  return (
    <tr className={cn("group border-b align-top last:border-0", unmatched && "bg-destructive/5", disputed && "bg-warning/8")}>
      <td className="px-1.5 py-1.5">
        <div>{line.trade}</div>
        {disputed && (
          <div className="mt-0.5 flex items-start gap-1 text-xs text-warning-foreground dark:text-warning">
            <FlagIcon aria-hidden className="mt-0.5 size-3 shrink-0" /> Disputed: {disputed}
          </div>
        )}
      </td>
      <td className="px-1.5 py-1.5 text-muted-foreground">{HOUR_LABEL[line.hourType!]}</td>
      <td className="px-1.5 py-1.5 text-end tabular-nums">{line.quantity.toLocaleString("en-GB")}</td>
      <td className="px-1.5 py-1.5 text-end tabular-nums">{unmatched ? <StatusBadge tone="blocked">No rate</StatusBadge> : line.rate}</td>
      <td className="px-1.5 py-1.5">{unmatched ? <span className="block text-end text-muted-foreground">—</span> : <Money value={line.amount} bare />}</td>
      {showAction && <td className="px-1 py-1 print:hidden">{action}</td>}
    </tr>
  );
}

function DisputeDialog({ invoiceId, line, me }: { invoiceId: string; line: InvoiceLine; me: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const m = useDemoMutation(
    () => disputeLine(invoiceId, line.id, reason, me),
    () => {
      toast.success("Line marked as disputed", { description: "Resolve it with a credit note or by confirming the line with evidence. The invoice itself is not edited." });
      setOpen(false);
      setReason("");
    },
  );
  const error = touched && !reason.trim() ? "Say what the client disputes, in their words." : null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`Dispute ${line.description}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100">
              <FlagIcon />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Dispute this line</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dispute {line.description}</DialogTitle>
          <DialogDescription>
            {line.quantity.toLocaleString("en-GB")} hours at {line.rate} = {formatMoney(line.amount)}. The invoice stays locked; the dispute is resolved by a credit note or by confirming the line.
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="dispute-reason">What the client disputes</FieldLabel>
          <Textarea id="dispute-reason" value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={!!error} placeholder="e.g. Overtime on 14–15 Sep not authorised by the site manager" />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={m.isPending}
            onClick={() => {
              setTouched(true);
              if (reason.trim()) m.mutate(undefined);
            }}
          >
            Mark line disputed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreditNoteDialog({ detail, me }: { detail: Detail; me: string }) {
  const inv = detail.invoice;
  const lines = inv.lines.filter((l) => l.rate);
  const firstDisputed = inv.disputes.find((x) => !x.resolved)?.lineId;
  const [open, setOpen] = useState(false);
  const [lineId, setLineId] = useState<string>(firstDisputed ?? "none");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const vat = vatCodeOn(inv.vatCode, todayOman());
  const amountError = submitted && !AMOUNT.test(amount) ? "Enter the amount before VAT, e.g. 120.500" : null;
  const reasonError = submitted && !reason.trim() ? "Give the reason the client will see." : null;
  const m = useDemoMutation(
    () => raiseCreditNote({ invoiceId: inv.id, lineId: lineId === "none" ? null : lineId, amount, reason, by: me }),
    (cn) => {
      toast.success("Credit note raised for approval", { description: `${formatMoney(cn.total)} incl. VAT. A second person approves it before it is issued.` });
      setOpen(false);
      setSubmitted(false);
      setAmount("");
      setReason("");
    },
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileMinusIcon /> Raise credit note
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise a credit note on {inv.number}</DialogTitle>
          <DialogDescription>The invoice is locked and stays as issued. A credit note corrects it, and a second person must approve it (four eyes).</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="cn-line">Line</FieldLabel>
            <Select
              value={lineId}
              onValueChange={(v) => {
                setLineId(v);
                const l = lines.find((x) => x.id === v);
                if (l && !amount) setAmount(l.amount);
              }}
            >
              <SelectTrigger id="cn-line" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Whole invoice (no specific line)</SelectItem>
                {lines.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.description} · {formatMoney(l.amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!!amountError}>
            <FieldLabel htmlFor="cn-amount">Amount before VAT (OMR)</FieldLabel>
            <Input id="cn-amount" inputMode="decimal" className="tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value.trim())} aria-invalid={!!amountError} placeholder="0.000" />
            <FieldDescription>
              {AMOUNT.test(amount) ? `Plus VAT ${formatMoney(vatOf(amount, vat))} · ` : ""}
              {vatRef(vat)}. Open balance {formatMoney(detail.balance)}.
            </FieldDescription>
            {amountError && <FieldError>{amountError}</FieldError>}
          </Field>
          <Field data-invalid={!!reasonError}>
            <FieldLabel htmlFor="cn-reason">Reason</FieldLabel>
            <Textarea id="cn-reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!reasonError} placeholder="e.g. Credit 64 overtime hours not authorised on 14–15 Sep" />
            {reasonError && <FieldError>{reasonError}</FieldError>}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={m.isPending}
            onClick={() => {
              setSubmitted(true);
              if (AMOUNT.test(amount) && reason.trim()) m.mutate(undefined);
            }}
          >
            Send for approval{AMOUNT.test(amount) ? ` (${formatMoney(money.sum([amount, vatOf(amount, vat)]))})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function PaymentDialog({ detail, me }: { detail: Detail; me: string }) {
  const inv = detail.invoice;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(detail.balance);
  const [on, setOn] = useState(todayOman());
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const amountError = submitted && !AMOUNT.test(amount) ? "Enter the amount received, e.g. 5000.000" : null;
  const m = useDemoMutation(
    () => recordPayment({ clientId: inv.clientId, receivedOn: on, amount, method, reference, allocations: [{ invoiceId: inv.id, amount }], by: me }),
    (p) => {
      toast.success(`Payment ${p.number} recorded`, { description: `${formatMoney(p.amount)} allocated to ${inv.number}. The receipt journal is posted.` });
      setOpen(false);
      setSubmitted(false);
    },
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setAmount(detail.balance);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <ReceiptIcon /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payment on {inv.number}</DialogTitle>
          <DialogDescription>Open balance {formatMoney(detail.balance)}. Part payments are allowed; the rest stays open. To split one receipt across invoices, match it from Receivables.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={!!amountError}>
            <FieldLabel htmlFor="pay-amount">Amount received (OMR)</FieldLabel>
            <Input id="pay-amount" inputMode="decimal" className="tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value.trim())} aria-invalid={!!amountError} />
            {amountError && <FieldError>{amountError}</FieldError>}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="pay-on">Received on</FieldLabel>
              <Input id="pay-on" type="date" value={on} max={todayOman()} onChange={(e) => setOn(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="pay-method">Method</FieldLabel>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger id="pay-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {METHOD_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="pay-ref">Bank or cheque reference</FieldLabel>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TRF 44120" />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={m.isPending}
            onClick={() => {
              setSubmitted(true);
              if (AMOUNT.test(amount)) m.mutate(undefined);
            }}
          >
            Record {AMOUNT.test(amount) ? formatMoney(amount) : "payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsCard({ detail }: { detail: Detail }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">Payments</CardTitle>
        <CardDescription>Allocations from receipts to this invoice.</CardDescription>
      </CardHeader>
      <CardContent>
        {detail.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{detail.invoice.status === "draft" ? "Payments are recorded once the invoice is issued." : "No payment allocated yet."}</p>
        ) : (
          <ul className="divide-y text-sm">
            {detail.payments.map((p) => (
              <li key={p.paymentId} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="font-medium tabular-nums">{p.payment.number}</div>
                  <div className="text-xs text-muted-foreground">
                    {displayDate(p.payment.receivedOn)} · {METHOD_LABEL[p.payment.method]} · {p.payment.reference}
                  </div>
                  {p.amount !== p.payment.amount && <div className="text-xs text-muted-foreground tabular-nums">Part of {formatMoney(p.payment.amount)}</div>}
                </div>
                <Money value={p.amount} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CreditNotesCard({ detail, me }: { detail: Detail; me: string }) {
  const approve = useDemoMutation(
    (id: string) => approveCreditNote(id, me),
    (cn) => toast.success(`Credit note ${cn.number} issued`, { description: `${formatMoney(cn.total)} credited. The client receives it by email.` }),
  );
  if (detail.invoice.status === "draft") return null;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">Credit notes</CardTitle>
        <CardDescription>Corrections to a locked invoice. Raised by one person, approved by another.</CardDescription>
      </CardHeader>
      <CardContent>
        {detail.creditNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">None. Raise one to correct a disputed or wrong line.</p>
        ) : (
          <ul className="divide-y text-sm">
            {detail.creditNotes.map((cn) => {
              const self = cn.requestedBy === me;
              return (
                <li key={cn.id} className="space-y-1.5 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">{cn.number ?? "Awaiting approval"}</span>
                      {cn.status === "issued" ? <StatusBadge tone="ok">Issued</StatusBadge> : <StatusBadge tone="due">Needs approval</StatusBadge>}
                    </div>
                    <Money value={cn.total} />
                  </div>
                  <p className="text-xs text-muted-foreground">{cn.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Raised by {cn.requestedBy} on {displayDate(cn.requestedOn)}
                    {cn.approvedBy && ` · approved by ${cn.approvedBy} on ${displayDate(cn.issuedOn)}`}
                  </p>
                  {cn.status === "pending_approval" &&
                    (self ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="inline-block">
                            <Button size="sm" disabled>
                              <CheckIcon /> Approve and issue
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Needs a second approver: you raised this credit note.</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(cn.id)}>
                        <CheckIcon /> Approve and issue ({formatMoney(cn.total)})
                      </Button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RemindersCard({ detail }: { detail: Detail }) {
  const inv = detail.invoice;
  if (inv.status === "draft" || inv.status === "paid") return null;
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">Reminders</CardTitle>
        <CardDescription>Sent automatically on the schedule; send one now from Receivables.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-1.5 text-sm">
          {REMINDER_STEPS.map((s, i) => {
            const sent = detail.reminders.find((r) => r.step === i);
            const on = dates.addDays(inv.dueDate!, s.days);
            return (
              <li key={s.label} className="flex items-center justify-between gap-2">
                <span className={cn(!sent && "text-muted-foreground")}>{s.label}</span>
                {sent ? <StatusBadge tone="ok">Sent {displayDate(sent.sentOn)}</StatusBadge> : <span className="text-xs text-muted-foreground tabular-nums">{displayDate(on)}</span>}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
