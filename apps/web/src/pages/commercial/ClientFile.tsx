/**
 * S-13 Client file (App Flow: "Sites, contacts, contracts, invoices"; PRD 4.4).
 * Client, balances and contracts are demo data; the crew on each site is the REAL workers whose
 * demo site is that site, linking to their worker files. Invoices belong to the billing module:
 * this screen shows a summary and links there.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { documentLabel, omr, type DocumentType } from "@mms/core";
import { ArrowRightIcon, BuildingIcon, FileTextIcon, MailIcon, MapPinIcon, PencilIcon, PhoneIcon, PlusIcon, TriangleAlertIcon, UserRoundIcon, UsersIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Money, formatMoney } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { displayDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { WorkerListItem } from "@/lib/api";
import { currentCard, deployedFor, fetchClient, overLimit, rateCardsOf, runRate, updateClient, type ClientRow } from "@/demo/commercial";
import { REQUEST_STATUS, useRequests } from "@/demo/operations";
import { contractOf, sitesOf, type Contract, type Site } from "@/demo/reference";
import { siteOf, useWorkforce } from "@/demo/workforce";
import { CLIENTS_KEY, ClientStatusBadge, CreditBar } from "./Clients";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

export function ClientFile() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQuery({ queryKey: [...CLIENTS_KEY, id], queryFn: () => fetchClient(id) });
  const workforce = useWorkforce();
  const requests = useRequests();

  const deployed = useMemo(() => deployedFor(id, workforce.data ?? []), [id, workforce.data]);

  if (client.isLoading) {
    return (
      <Page>
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </Page>
    );
  }

  const c = client.data;
  if (!c) {
    return (
      <Page>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BuildingIcon />
            </EmptyMedia>
            <EmptyTitle>Client not found</EmptyTitle>
            <EmptyDescription>There is no client with this reference. It may have been merged or the link is wrong.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link to="/clients">Back to clients</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }

  const contract = contractOf(c.id);
  const clientRequests = (requests.data ?? []).filter((r) => r.clientId === c.id);
  const isOver = overLimit(c.balance, c);

  return (
    <Page>
      <PageHeader
        screen="S-13"
        sample
        title={c.legalName}
        meta={
          <>
            <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
            <ClientStatusBadge status={c.status} />
            {isOver && <StatusBadge tone="blocked">Over credit limit</StatusBadge>}
            <span className="text-xs text-muted-foreground">CR {c.crNumber}</span>
            <span className="text-xs text-muted-foreground">VAT {c.vatNumber}</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPinIcon aria-hidden className="size-3" />
              {c.city}
            </span>
          </>
        }
        actions={
          <>
            <EditClient client={c} />
            <Button onClick={() => navigate(`/requests?new=1&client=${c.id}`)} disabled={c.status === "prospect"}>
              <PlusIcon /> New manpower request
            </Button>
          </>
        }
      />

      <Tabs defaultValue="overview" className="gap-4">
        <div className="overflow-x-auto">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="sites">Sites ({sitesOf(c.id).length})</TabsTrigger>
            <TabsTrigger value="contacts">Contacts ({c.contacts.length})</TabsTrigger>
            <TabsTrigger value="contracts">Contracts</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex flex-col gap-4">
          {isOver && (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Over credit limit by {formatMoney(omr(c.balance.outstanding).minus(omr(c.creditLimit)).toFixed(3))}</AlertTitle>
              <AlertDescription>
                {formatMoney(c.balance.outstanding)} is outstanding against a limit of {formatMoney(c.creditLimit)}, with {formatMoney(c.balance.overdue)} overdue. Requests can still be entered, but finance must
                agree before more workers are deployed to this client.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Deployed workers" value={workforce.isLoading ? "—" : deployed.length} hint={sitesOf(c.id).length === 1 ? "On 1 site" : `Across ${sitesOf(c.id).length} sites`} to="/roster" />
            <KpiCard label="Monthly billing run-rate (OMR)" value={<Money bare align="start" value={runRate(contract, deployed)} />} hint="Estimate: normal rate × 208 h plus monthly charges" />
            <KpiCard label="Outstanding (OMR)" value={<Money bare align="start" value={c.balance.outstanding} />} footer={<CreditBar client={c} className="w-56" />} />
            <KpiCard label="Days sales outstanding" value={c.balance.dsoDays ? `${c.balance.dsoDays} days` : "—"} hint={`Payment terms ${c.paymentTermsDays} days`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Manpower requests</CardTitle>
                <CardDescription>Open and recent requests from this client.</CardDescription>
              </CardHeader>
              <CardContent>
                {clientRequests.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No requests yet. Enter one when the client calls or emails.</p>
                ) : (
                  <ul className="divide-y">
                    {clientRequests.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {r.lines.map((l) => `${l.quantity} × ${l.trade}`).join(", ")} · {sitesOf(c.id).find((s) => s.id === r.siteId)?.name}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {r.filled}/{r.quantity} filled
                        </span>
                        <StatusBadge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</StatusBadge>
                        {(r.status === "open" || r.status === "partly_filled") && (
                          <Button asChild variant="ghost" size="xs">
                            <Link to={`/requests/${r.id}/match`}>
                              Match <ArrowRightIcon className="rtl:rotate-180" />
                            </Link>
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">CR number</dt>
                  <dd className="font-mono text-xs leading-5">{c.crNumber}</dd>
                  <dt className="text-muted-foreground">VAT number</dt>
                  <dd className="font-mono text-xs leading-5">{c.vatNumber}</dd>
                  <dt className="text-muted-foreground">Payment terms</dt>
                  <dd className="tabular-nums">{c.paymentTermsDays} days</dd>
                  <dt className="text-muted-foreground">Credit limit</dt>
                  <dd className="tabular-nums">{formatMoney(c.creditLimit)}</dd>
                  <dt className="text-muted-foreground">Contract</dt>
                  <dd>{contract ? <Link className="text-primary underline-offset-4 hover:underline" to={`/contracts/${contract.id}`}>{contract.reference}</Link> : "None yet"}</dd>
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sites">
          {sitesOf(c.id).length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MapPinIcon />
                </EmptyMedia>
                <EmptyTitle>No sites yet</EmptyTitle>
                <EmptyDescription>Sites are added when the client signs a contract. A prospect has none.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {sitesOf(c.id).map((s) => (
                <SiteCard key={s.id} site={s} crew={deployed.filter((w) => siteOf(w)?.id === s.id)} loading={workforce.isLoading} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contacts">
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table aria-label="Client contacts">
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Timesheet packs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.contacts.map((p) => (
                  <TableRow key={p.email}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <UserRoundIcon aria-hidden className="size-4 text-muted-foreground" />
                        {p.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={`mailto:${p.email}`}>
                        <MailIcon aria-hidden className="size-3.5" />
                        {p.email}
                      </a>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <span className="inline-flex items-center gap-1" dir="ltr">
                        <PhoneIcon aria-hidden className="size-3.5 text-muted-foreground" />
                        {p.phone}
                      </span>
                    </TableCell>
                    <TableCell>{p.canApproveTimesheets ? <StatusBadge tone="ok">Can approve</StatusBadge> : <StatusBadge tone="incomplete">Receives copies only</StatusBadge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">In Version 1, approvers receive timesheet packs by email and return them signed. Portal sign-in arrives in Version 2.</p>
        </TabsContent>

        <TabsContent value="contracts">
          {contract ? <ContractSummary ct={contract} /> : <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">No contract yet. A prospect gets a contract and rate card once terms are agreed.</p>}
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>Invoices, payments and statements live in Billing.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Outstanding</dt>
                  <dd className="text-lg font-semibold">
                    <Money align="start" value={c.balance.outstanding} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Overdue</dt>
                  <dd className="text-lg font-semibold">
                    <Money align="start" value={c.balance.overdue} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Open invoices</dt>
                  <dd className="text-lg font-semibold tabular-nums">{c.balance.openInvoices}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Last payment</dt>
                  <dd className="text-sm">{c.balance.lastPaymentOn ? `${formatMoney(c.balance.lastPaymentAmount ?? "0")} on ${displayDate(c.balance.lastPaymentOn)}` : "None yet"}</dd>
                </div>
              </dl>
              <div>
                <Button asChild variant="outline">
                  <Link to={`/invoices?client=${c.id}`}>
                    <FileTextIcon /> Open invoices for {c.legalName}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function SiteCard({ site, crew, loading }: { site: Site; crew: WorkerListItem[]; loading: boolean }) {
  const shown = crew.slice(0, 10);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {site.name}
          <span className="font-mono text-xs font-normal text-muted-foreground">{site.code}</span>
        </CardTitle>
        <CardDescription>
          {site.city} · Supervisor {site.supervisor}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Required beyond standard papers:</span>
          {site.requiredDocuments.length ? (
            site.requiredDocuments.map((d) => (
              <Badge key={d} variant="outline">
                {documentLabel(d as DocumentType)}
              </Badge>
            ))
          ) : (
            <span>None</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          {loading ? (
            <Skeleton className="h-8 w-48" />
          ) : crew.length ? (
            // Design Brief allows the animated avatar stack here; initials only, never photos.
            <div className="flex items-center" aria-label={`${crew.length} workers on site`}>
              {shown.map((w) => (
                <Tooltip key={w.id}>
                  <TooltipTrigger asChild>
                    <Link
                      to={`/workers/${w.id}`}
                      className="-me-2 rounded-full ring-2 ring-card transition-transform duration-200 hover:z-10 hover:-translate-y-1 hover:scale-110 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:transform-none"
                    >
                      <Avatar>
                        <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">{initials(w.fullName)}</AvatarFallback>
                      </Avatar>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="font-medium">{w.fullName}</div>
                    <div className="opacity-80">
                      {w.trade} · {w.code}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
              {crew.length > shown.length && <span className="ms-4 text-xs text-muted-foreground tabular-nums">+{crew.length - shown.length} more</span>}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No crew on site yet</span>
          )}
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums">
            <UsersIcon aria-hidden className="size-4 text-muted-foreground" />
            {loading ? "—" : crew.length}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ContractSummary({ ct }: { ct: Contract }) {
  const cards = rateCardsOf(ct.id);
  const current = currentCard(ct.id);
  const pending = cards.find((r) => r.status === "pending");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {ct.reference}
          <StatusBadge tone="ok">In force</StatusBadge>
          {pending && <StatusBadge tone="due">v{pending.version} awaiting approval</StatusBadge>}
        </CardTitle>
        <CardDescription>
          {displayDate(ct.startDate)} – {displayDate(ct.endDate)} · Rate card v{current?.version} from {displayDate(current?.validFrom)} · {cards.length} versions
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Auto-approve after {ct.autoApproveDays} days · minimum {ct.minBillableHours} billable hours a day{ct.escalationDate ? ` · escalation ${displayDate(ct.escalationDate)}` : ""}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to={`/contracts/${ct.id}`}>
            Open contract and rates <ArrowRightIcon className="rtl:rotate-180" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

const MONEY_RE = /^\d{1,9}(\.\d{1,3})?$/;

function EditClient({ client }: { client: ClientRow }) {
  const qc = useQueryClient();
  const { account } = useSession();
  const canCredit = account?.role === "owner" || account?.role === "finance";
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState(client.city);
  const [terms, setTerms] = useState(String(client.paymentTermsDays));
  const [limit, setLimit] = useState(client.creditLimit);
  const termsErr = /^\d+$/.test(terms) && Number(terms) >= 0 && Number(terms) <= 120 ? null : "Enter whole days between 0 and 120.";
  const limitErr = MONEY_RE.test(limit) ? null : "Enter an amount in OMR, up to 3 decimals.";
  const save = useMutation({
    mutationFn: () => updateClient(client.id, { city: city.trim(), paymentTermsDays: Number(terms), ...(canCredit ? { creditLimit: omr(limit).toFixed(3) } : {}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CLIENTS_KEY });
      toast.success(`${client.legalName} updated`);
      setOpen(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setCity(client.city);
          setTerms(String(client.paymentTermsDays));
          setLimit(client.creditLimit);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilIcon /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {client.legalName}</DialogTitle>
          <DialogDescription>Changes are recorded in the audit log under your name.</DialogDescription>
        </DialogHeader>
        <form
          id="edit-client"
          onSubmit={(e) => {
            e.preventDefault();
            if (!termsErr && !limitErr && city.trim()) save.mutate();
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="client-city">City</FieldLabel>
              <Input id="client-city" value={city} onChange={(e) => setCity(e.target.value)} required />
            </Field>
            <Field data-invalid={!!termsErr}>
              <FieldLabel htmlFor="client-terms">Payment terms (days)</FieldLabel>
              <Input id="client-terms" inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value)} aria-invalid={!!termsErr} />
              {termsErr && <FieldError>{termsErr}</FieldError>}
            </Field>
            <Field data-invalid={!!limitErr}>
              <FieldLabel htmlFor="client-limit">Credit limit (OMR)</FieldLabel>
              <Input id="client-limit" inputMode="decimal" className="text-end tabular-nums" value={limit} onChange={(e) => setLimit(e.target.value)} disabled={!canCredit} aria-invalid={!!limitErr} />
              {limitErr ? <FieldError>{limitErr}</FieldError> : !canCredit && <FieldDescription>Only finance or the owner can change a credit limit.</FieldDescription>}
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="edit-client" disabled={save.isPending || !!termsErr || !!limitErr || !city.trim()}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
