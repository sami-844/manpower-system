/**
 * S-33 Approvals inbox (App Flow "Behaviour everywhere: Approvals"; PRD §3 the owner).
 * Two taps from a phone: Approve, then confirm the amount. Four eyes (CLAUDE.md rule 6): the
 * person who made a request can never decide it — the buttons are disabled with the reason.
 * DEMO: src/demo/insight.ts until `/approvals` exists; decisions persist for the session.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightIcon, BadgeCheckIcon, BanknoteIcon, FileSignatureIcon, CheckIcon, FileX2Icon, InboxIcon, ShieldAlertIcon, TagsIcon, UserPenIcon, XIcon } from "lucide-react";
import { useSession } from "@/lib/session";
import { useWorkforce } from "@/demo/workforce";
import { APPROVAL_KIND_LABELS, decideApproval, displayMoment, fetchApprovals, personOf, type Approval, type ApprovalKind } from "@/demo/insight";
import { Page, PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createColumns, DataTable } from "@/components/data-table";
import { formatMoney, Money } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ApprovalKind, typeof BanknoteIcon> = {
  payroll: BanknoteIcon,
  contract: FileSignatureIcon,
  rate_card: TagsIcon,
  wage: UserPenIcon,
  override: ShieldAlertIcon,
  write_off: FileX2Icon,
};

const amountText = (a: Approval) => (a.amount ? formatMoney(a.amount) : a.count ? `${a.count.value} ${a.count.noun}` : "");

export function Approvals() {
  const approvals = useQuery({ queryKey: ["approvals"], queryFn: fetchApprovals });
  const pending = approvals.data?.pending ?? [];
  const history = approvals.data?.history ?? [];

  return (
    <Page>
      <PageHeader
        screen="S-33"
        title="Approvals"
        sample
        description="Everything waiting for a decision. The person who asks can never approve their own request."
      />
      <Tabs defaultValue="pending" className="gap-4">
        <TabsList>
          <TabsTrigger value="pending">Pending{approvals.data ? ` (${pending.length})` : ""}</TabsTrigger>
          <TabsTrigger value="history">History{approvals.data ? ` (${history.length})` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="space-y-3">
          {approvals.isPending ? (
            Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)
          ) : pending.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>Nothing waits for you</EmptyTitle>
                <EmptyDescription>New requests appear here and on Today, with a WhatsApp or email link.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            pending.map((a) => <ApprovalCard key={a.id} approval={a} />)
          )}
        </TabsContent>
        <TabsContent value="history">
          <DataTable
            label="Decided approvals"
            columns={historyColumns}
            data={history}
            loading={approvals.isPending}
            getRowId={(r) => r.id}
            search={(r, q) => r.title.toLowerCase().includes(q) || r.requestedBy.includes(q)}
            searchPlaceholder="Filter decisions…"
            empty="No decisions yet."
          />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function ApprovalCard({ approval: a }: { approval: Approval }) {
  const { account } = useSession();
  const qc = useQueryClient();
  const workforce = useWorkforce();
  const Icon = KIND_ICON[a.kind];
  const own = account?.username === a.requestedBy;
  const workerId = a.workerCode ? workforce.data?.find((w) => w.code === a.workerCode)?.id : undefined;
  const subject = workerId ? `/workers/${workerId}` : a.to;

  const decide = useMutation({
    mutationFn: (input: { outcome: "approved" | "rejected"; reason?: string }) => decideApproval({ id: a.id, by: account?.username ?? "", ...input }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      if (d.decision?.outcome === "approved") toast.success(`Approved: ${a.title}`, { description: amountText(a) || undefined });
      else toast(`Rejected: ${a.title}`, { description: `${personOf(a.requestedBy)} has been told why.` });
    },
    onError: (e) => toast.error("The decision was not saved", { description: e instanceof Error ? e.message : String(e) }),
  });

  const approveLabel = a.amount ? `Approve ${formatMoney(a.amount)}` : a.count ? `Approve for ${a.count.value} ${a.count.noun}` : "Approve";

  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon aria-hidden className="size-4.5" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-balance">{a.title}</h2>
              {own && <StatusBadge tone="info">Your request · needs a second approver</StatusBadge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {APPROVAL_KIND_LABELS[a.kind]} · requested by {personOf(a.requestedBy)} · {displayMoment(a.requestedAt)}
            </p>
            {a.step && <StatusBadge tone="locked">{a.step}</StatusBadge>}
          </div>
        </div>
        {(a.amount || a.count) && (
          <div className="shrink-0 ps-12 sm:ps-0 sm:text-end">
            {a.amount ? <Money value={a.amount} align="start" className="text-xl font-semibold sm:text-end" /> : <div className="text-xl font-semibold tabular-nums">{a.count!.value}</div>}
            <div className="text-xs text-muted-foreground">{a.amount ? a.amountLabel : a.count!.noun}</div>
            {a.amount && a.count && (
              <div className="text-xs text-muted-foreground tabular-nums">
                {a.count.value} {a.count.noun}
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-pretty">{a.summary}</p>
        <dl className="divide-y rounded-lg border text-sm">
          {a.changes.map((c) => (
            <div key={c.label} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-4">
              <dt className="text-muted-foreground">{c.label}</dt>
              <dd className="flex flex-wrap items-center gap-2 tabular-nums">
                <span className={cn("text-muted-foreground", c.before !== c.after && "line-through decoration-muted-foreground/50")}>{c.before}</span>
                <ArrowRightIcon aria-label="becomes" className="size-3.5 text-muted-foreground rtl:rotate-180" />
                <span className="font-medium">{c.after}</span>
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter className="flex flex-col-reverse gap-2 border-t sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="link" size="sm" className="px-0">
          <Link to={subject}>
            Open the {a.workerCode ? "worker file" : APPROVAL_KIND_LABELS[a.kind].toLowerCase()} <ArrowRightIcon aria-hidden className="rtl:rotate-180" />
          </Link>
        </Button>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <FourEyes own={own}>
            <RejectDialog approval={a} disabled={own || decide.isPending} onReject={(reason) => decide.mutate({ outcome: "rejected", reason })} />
          </FourEyes>
          <FourEyes own={own}>
            <ConfirmDialog
              trigger={
                <Button disabled={own || decide.isPending} className="w-full sm:w-auto">
                  <CheckIcon aria-hidden /> Approve
                </Button>
              }
              title={`Approve: ${a.title}?`}
              description={
                <>
                  <p>{a.summary}</p>
                  {a.amount && (
                    <p className="text-base font-semibold text-foreground tabular-nums">
                      {a.amountLabel}: {formatMoney(a.amount)}
                      {a.count ? ` · ${a.count.value} ${a.count.noun}` : ""}
                    </p>
                  )}
                  <p>Your name, the time and the figures you saw are recorded in the audit trail.</p>
                </>
              }
              confirmLabel={approveLabel}
              onConfirm={() => decide.mutate({ outcome: "approved" })}
            />
          </FourEyes>
        </div>
      </CardFooter>
    </Card>
  );
}

/** Disabled buttons don't receive pointer events, so the reason lives on a focusable wrapper. */
function FourEyes({ own, children }: { own: boolean; children: React.ReactNode }) {
  if (!own) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-lg focus-visible:outline-2 focus-visible:outline-ring [&>*]:w-full">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>You made this request. Needs a second approver (four eyes).</TooltipContent>
    </Tooltip>
  );
}

function RejectDialog({ approval: a, disabled, onReject }: { approval: Approval; disabled: boolean; onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const invalid = reason.trim().length < 5;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setReason("");
          setTouched(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled} className="w-full sm:w-auto">
          <XIcon aria-hidden /> Reject
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject: {a.title}?</DialogTitle>
          <DialogDescription>{personOf(a.requestedBy)} sees your reason and can send a corrected request.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (invalid) return;
            onReject(reason.trim());
            setOpen(false);
          }}
        >
          <Field data-invalid={touched && invalid}>
            <FieldLabel htmlFor={`reason-${a.id}`}>Reason</FieldLabel>
            <Textarea id={`reason-${a.id}`} value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={touched && invalid} rows={3} autoFocus />
            {touched && invalid ? <FieldError>Say why, in a few words, so it can be fixed.</FieldError> : <FieldDescription>Required. Kept in the audit trail.</FieldDescription>}
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive">
              Reject request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const col = createColumns<Approval>();
const historyColumns = col.columns([
  col.display({ id: "at", header: "Decided", cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{displayMoment(row.original.decision?.at)}</span> }),
  col.accessor("title", {
    header: "Request",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {APPROVAL_KIND_LABELS[row.original.kind]} · by {personOf(row.original.requestedBy)}
        </div>
      </div>
    ),
  }),
  col.display({ id: "amount", header: () => <div className="text-end">Amount</div>, cell: ({ row }) => (row.original.amount ? <Money value={row.original.amount} /> : <span className="block text-end">{amountText(row.original)}</span>) }),
  col.display({
    id: "decision",
    header: "Decision",
    cell: ({ row }) =>
      row.original.decision?.outcome === "approved" ? (
        <StatusBadge tone="ok">Approved</StatusBadge>
      ) : (
        <StatusBadge tone="expired">Rejected</StatusBadge>
      ),
  }),
  col.display({
    id: "by",
    header: "Decided by",
    cell: ({ row }) => (
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-1">
          <BadgeCheckIcon aria-hidden className="size-3.5 text-muted-foreground" />
          {personOf(row.original.decision?.by ?? "")}
        </div>
        {row.original.decision?.reason && <div className="max-w-72 truncate text-xs text-muted-foreground">“{row.original.decision.reason}”</div>}
      </div>
    ),
  }),
]);
