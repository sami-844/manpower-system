/**
 * S-14 Contract and rate card detail (App Flow: "Rates by trade and hour type, with versions";
 * PRD 4.4 margin preview; Backend Schema `rate_cards`: no overlapping versions, changes need a
 * second person to approve). Demo data; the margin uses the REAL workforce's trades and the demo
 * basic wages, and is labelled an estimate.
 */
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { omr, roundBaisa } from "@mms/core";
import { CheckIcon, FileTextIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Money, formatMoney } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { displayDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dates, todayOman } from "@/demo/core";
import {
  COST_LOADING,
  HOUR_TYPES,
  MONTH_HOURS,
  RATE_APPROVER_ROLES,
  approveRateCard,
  averageBasicByTrade,
  fetchContract,
  loadedHourly,
  marginPct,
  proposeRateCard,
  type RateCardView,
} from "@/demo/commercial";
import { TRADES, type Contract } from "@/demo/reference";
import { useWorkforce } from "@/demo/workforce";

const KEY = ["demo", "commercial"] as const;
const CHARGE_LABEL = { accommodation: "Accommodation", transport: "Transport", mobilisation: "Mobilisation", other: "Other" } as const;

export function ContractDetail() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: [...KEY, "contract", id], queryFn: () => fetchContract(id) });
  const [tab, setTab] = useState<string | null>(null);

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>Contract not found</EmptyTitle>
            <EmptyDescription>No contract has this reference. Open it from the contracts list.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link to="/contracts">Back to contracts</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }

  const { contract: ct, cards } = q.data;
  const selected = tab ?? ct.current?.id ?? cards.at(-1)?.id ?? "";

  return (
    <Page>
      <PageHeader
        screen="S-14"
        sample
        title={ct.reference}
        description={
          <>
            Master service agreement with{" "}
            <Link to={`/clients/${ct.clientId}`} className="text-primary underline-offset-4 hover:underline">
              {ct.client.legalName}
            </Link>
            .
          </>
        }
        meta={
          <>
            <StatusBadge tone="ok">In force</StatusBadge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {displayDate(ct.startDate)} – {displayDate(ct.endDate)}
            </span>
            {ct.pending && <StatusBadge tone="due">v{ct.pending.version} needs a second approver</StatusBadge>}
          </>
        }
        actions={<NewVersion contract={ct} cards={cards} onCreated={setTab} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Terms</CardTitle>
            <CardDescription>Billing rules the timesheet and invoice engines apply.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">Timesheet auto-approval</dt>
              <dd>{ct.autoApproveDays} days after the pack is sent, if the client has not replied</dd>
              <dt className="text-muted-foreground">Minimum billable hours</dt>
              <dd className="tabular-nums">{ct.minBillableHours} hours a day per worker</dd>
              <dt className="text-muted-foreground">Price escalation</dt>
              <dd>{ct.escalationDate ? displayDate(ct.escalationDate) : "No escalation date in this contract"}</dd>
              <dt className="text-muted-foreground">Payment terms</dt>
              <dd className="tabular-nums">{ct.client.paymentTermsDays} days from invoice</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fixed charges</CardTitle>
            <CardDescription>Added to every invoice, per deployed worker.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table aria-label="Fixed charges">
              <TableHeader>
                <TableRow>
                  <TableHead>Charge</TableHead>
                  <TableHead className="hidden sm:table-cell">Frequency</TableHead>
                  <TableHead className="text-end">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ct.charges.map((c) => (
                  <TableRow key={c.kind}>
                    <TableCell>{CHARGE_LABEL[c.kind]}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{c.frequency === "monthly" ? "Monthly, per worker" : "Once"}</TableCell>
                    <TableCell>
                      <Money value={c.amount} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rate card</CardTitle>
          <CardDescription>Hourly billing rates by trade and hour type (OMR). Each version is dated; a change is a new version, never an edit.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selected} onValueChange={setTab} className="gap-4">
            <div className="overflow-x-auto">
              <TabsList>
                {cards.map((c) => (
                  <TabsTrigger key={c.id} value={c.id} className="px-3">
                    v{c.version}
                    {c.status === "pending" ? <span className="text-xs text-warning-foreground dark:text-warning">Pending</span> : c.id === ct.current?.id ? <span className="text-xs text-muted-foreground">In force</span> : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {cards.map((c) => (
              <TabsContent key={c.id} value={c.id} className="flex flex-col gap-4">
                <VersionMeta card={c} contractId={ct.id} inForce={c.id === ct.current?.id} />
                <RateMatrix card={c} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </Page>
  );
}

function VersionMeta({ card, contractId, inForce }: { card: RateCardView; contractId: string; inForce: boolean }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between", card.status === "pending" ? "border-warning/40 bg-warning/8" : "bg-muted/40")}>
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {card.status === "pending" ? <StatusBadge tone="due">Awaiting second approver</StatusBadge> : inForce ? <StatusBadge tone="ok">In force</StatusBadge> : <StatusBadge tone="locked">{card.validFrom > todayOman() ? "Approved, starts later" : "Closed"}</StatusBadge>}
          <span className="font-medium tabular-nums">
            Valid {displayDate(card.validFrom)} – {card.validTo ? displayDate(card.validTo) : "open-ended"}
          </span>
          {card.upliftPct && <span className="text-muted-foreground tabular-nums">{Number(card.upliftPct) >= 0 ? "+" : ""}{card.upliftPct}% on the previous version</span>}
        </div>
        <p className="text-muted-foreground">
          {card.reason}. Requested by <span className="font-medium text-foreground">{card.requestedBy}</span> on {displayDate(card.requestedOn)}
          {card.approvedBy ? (
            <>
              {" "}
              · approved by <span className="font-medium text-foreground">{card.approvedBy}</span>
            </>
          ) : null}
          .
        </p>
      </div>
      {card.status === "pending" && <ApproveButton card={card} contractId={contractId} />}
    </div>
  );
}

/** Four-eyes: the maker of a version can never approve it; only owner or finance approve. */
function ApproveButton({ card, contractId }: { card: RateCardView; contractId: string }) {
  const qc = useQueryClient();
  const { account } = useSession();
  const approve = useMutation({
    mutationFn: () => approveRateCard({ contractId, cardId: card.id, by: account?.username ?? "" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success(`Rate card v${card.version} approved`, { description: `In force from ${displayDate(card.validFrom)}. The previous version closes the day before.` });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not approve"),
  });

  const isMaker = account?.username === card.requestedBy;
  const mayApprove = !!account && (RATE_APPROVER_ROLES as readonly string[]).includes(account.role);
  const blocked = isMaker
    ? `Needs a second approver. You created this version, so someone else must approve it: sign in as the owner or finance.`
    : !mayApprove
      ? "Only the owner or finance can approve a rate card."
      : null;

  if (blocked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-ring">
            <Button disabled className="pointer-events-none">
              <CheckIcon /> Approve v{card.version}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{blocked}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <ConfirmDialog
      trigger={
        <Button disabled={approve.isPending}>
          <CheckIcon /> Approve v{card.version}
        </Button>
      }
      title={`Approve rate card v${card.version}?`}
      description={
        <>
          <p>
            {card.lines.length} rates take effect from <span className="font-medium text-foreground">{displayDate(card.validFrom)}</span>. The version in force closes on {displayDate(dates.addDays(card.validFrom, -1))}; its rates stay as they were for
            earlier invoices.
          </p>
          <p>
            Requested by {card.requestedBy}. You are approving as {account?.username}.
          </p>
        </>
      }
      confirmLabel={`Approve v${card.version} from ${displayDate(card.validFrom)}`}
      onConfirm={() => approve.mutate()}
    />
  );
}

function RateMatrix({ card }: { card: RateCardView }) {
  const workforce = useWorkforce();
  const avg = useMemo(() => averageBasicByTrade(workforce.data ?? []), [workforce.data]);
  const rate = useMemo(() => new Map(card.lines.map((l) => [`${l.trade}:${l.hourType}`, l.rate])), [card.lines]);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table aria-label={`Rate card v${card.version}`}>
          <TableHeader className="bg-muted/60">
            <TableRow>
              <TableHead className="min-w-36">Trade</TableHead>
              {HOUR_TYPES.map((h) => (
                <TableHead key={h.key} className="text-end">
                  {h.label}
                </TableHead>
              ))}
              <TableHead className="border-s text-end">Loaded cost / h</TableHead>
              <TableHead className="text-end">Margin (normal)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {TRADES.map((t) => {
              const normal = rate.get(`${t}:normal`) ?? "0.000";
              const basic = avg.get(t);
              const cost = basic ? loadedHourly(basic) : null;
              const m = cost ? marginPct(normal, cost) : null;
              const low = m != null && Number(m) < 15;
              return (
                <TableRow key={t}>
                  <TableCell className="font-medium">{t}</TableCell>
                  {HOUR_TYPES.map((h) => (
                    <TableCell key={h.key}>
                      <Money bare value={rate.get(`${t}:${h.key}`) ?? "0.000"} />
                    </TableCell>
                  ))}
                  <TableCell className="border-s text-muted-foreground">{workforce.isLoading ? <Skeleton className="ms-auto h-4 w-12" /> : cost ? <Money bare value={cost} /> : <span className="block text-end">—</span>}</TableCell>
                  <TableCell className="text-end tabular-nums">
                    {workforce.isLoading ? (
                      <Skeleton className="ms-auto h-4 w-12" />
                    ) : m ? (
                      <span className={cn("inline-flex items-center gap-1", low && "font-medium text-destructive")}>
                        {low && <TriangleAlertIcon aria-label="Low margin" className="size-3.5" />}
                        {m}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Margin preview is an estimate: average basic wage of the trade × {COST_LOADING} loading (allowances, visa amortisation, insurance, camp, transport, end-of-service accrual), over {MONTH_HOURS} hours a month. Below 15% is flagged. Final
        cost comes from payroll once the pay engine runs.
      </p>
    </div>
  );
}

const PCT_RE = /^-?\d{1,2}(\.\d{1,2})?$/;

function NewVersion({ contract, cards, onCreated }: { contract: Contract; cards: RateCardView[]; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const { account } = useSession();
  const pending = cards.find((c) => c.status === "pending");
  const base = cards.filter((c) => c.status === "approved").at(-1);
  const defaultFrom = dates.addMonths(todayOman(), 1);
  const [open, setOpen] = useState(false);
  const [validFrom, setValidFrom] = useState(defaultFrom);
  const [pct, setPct] = useState("3.0");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  const pctErr = PCT_RE.test(pct) && Math.abs(Number(pct)) <= 30 ? null : "Enter a percentage between -30 and 30.";
  const fromErr = !validFrom ? "Choose a start date." : base && validFrom <= base.validFrom ? `Must start after v${base.version} (${displayDate(base.validFrom)}).` : validFrom < todayOman() ? "A new version cannot start in the past." : null;
  const reasonErr = reason.trim().length < 5 ? "Say why the rates change (at least 5 characters)." : null;

  const create = useMutation({
    mutationFn: () => proposeRateCard({ contractId: contract.id, upliftPct: pct, validFrom, reason: reason.trim(), by: account?.username ?? "unknown" }),
    onSuccess: (card) => {
      void qc.invalidateQueries({ queryKey: KEY });
      onCreated(card.id);
      setOpen(false);
      toast.success(`Rate card v${card.version} created`, { description: "It needs a second approver (owner or finance) before it takes effect." });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create the version"),
  });

  if (pending) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-ring">
            <Button disabled className="pointer-events-none">
              <PlusIcon /> New rate card version
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">v{pending.version} is waiting for a second approver. Approve it or let it lapse before starting another version.</TooltipContent>
      </Tooltip>
    );
  }

  const sample = base?.lines.filter((l) => l.hourType === "normal").slice(0, 4) ?? [];
  const uplift = (r: string) => (pctErr ? r : roundBaisa(omr(r).times(omr("1").plus(omr(pct).div(100)))).toFixed(3));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValidFrom(defaultFrom);
          setPct("3.0");
          setReason("");
          setTouched(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> New rate card version
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New rate card version</DialogTitle>
          <DialogDescription>
            Creates v{(cards.at(-1)?.version ?? 0) + 1} from v{base?.version}'s rates. It stays pending until a second person approves it; v{base?.version} is not changed.
          </DialogDescription>
        </DialogHeader>
        <form
          id="new-rate-card"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!pctErr && !fromErr && !reasonErr) create.mutate();
          }}
        >
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={touched && !!fromErr}>
                <FieldLabel htmlFor="rc-from">Valid from</FieldLabel>
                <Input id="rc-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} aria-invalid={touched && !!fromErr} />
                {touched && fromErr && <FieldError>{fromErr}</FieldError>}
              </Field>
              <Field data-invalid={touched && !!pctErr}>
                <FieldLabel htmlFor="rc-pct">Change on every rate (%)</FieldLabel>
                <Input id="rc-pct" inputMode="decimal" className="text-end tabular-nums" value={pct} onChange={(e) => setPct(e.target.value)} aria-invalid={touched && !!pctErr} />
                {touched && pctErr && <FieldError>{pctErr}</FieldError>}
              </Field>
            </div>
            <Field data-invalid={touched && !!reasonErr}>
              <FieldLabel htmlFor="rc-reason">Reason</FieldLabel>
              <Textarea id="rc-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Annual escalation agreed with the client" aria-invalid={touched && !!reasonErr} />
              {touched && reasonErr ? <FieldError>{reasonErr}</FieldError> : <FieldDescription>Shown to the approver and kept in the audit log.</FieldDescription>}
            </Field>
            {sample.length > 0 && (
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Preview, normal hour</p>
                <ul className="grid gap-1 text-sm">
                  {sample.map((l) => (
                    <li key={l.trade} className="flex items-center justify-between gap-3 tabular-nums">
                      <span>{l.trade}</span>
                      <span>
                        <span className="text-muted-foreground">{formatMoney(l.rate, { bare: true })}</span> → <span className="font-medium">{formatMoney(uplift(l.rate), { bare: true })}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="new-rate-card" disabled={create.isPending}>
            Create v{(cards.at(-1)?.version ?? 0) + 1} for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
