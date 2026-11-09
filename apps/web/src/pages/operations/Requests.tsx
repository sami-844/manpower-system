/**
 * S-15 Manpower requests (App Flow "client request to workers on site", step 1; PRD 4.4).
 * Demo requests; the filled count comes from assignments of REAL workers. A row opens the request
 * in a sheet (the list stays in place); "Match workers" goes to S-16.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightIcon, MailIcon, PhoneIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { DataTable, createColumns } from "@/components/data-table";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { displayDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dates, todayOman } from "@/demo/core";
import { OPS_KEY, REQUEST_STATUS, createRequest, useRequests, type RequestStatus, type RequestView, type Shift } from "@/demo/operations";
import { CLIENTS, TRADES, clientById, siteById, sitesOf, type Trade } from "@/demo/reference";

/** Filled vs requested, as a bar and a count (never the bar alone). */
export function FillMeter({ filled, quantity, className }: { filled: number; quantity: number; className?: string }) {
  const pct = quantity ? Math.min(filled / quantity, 1) * 100 : 0;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={quantity} aria-valuenow={filled} aria-label="Positions filled">
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-success" : "bg-primary/70")} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">{filled}</span>/{quantity}
      </span>
    </div>
  );
}

const linesText = (r: RequestView) => r.lines.map((l) => `${l.quantity} × ${l.trade}`).join(", ");
const canMatch = (r: RequestView) => r.status === "open" || r.status === "partly_filled";

const col = createColumns<RequestView>();
const columns = col.columns([
  col.accessor("reference", {
    header: "Request",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-mono text-sm font-medium">{row.original.reference}</span>
        <span className="text-xs text-muted-foreground">Received {displayDate(row.original.receivedOn)}</span>
      </div>
    ),
  }),
  col.display({
    id: "client",
    header: "Client and site",
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{clientById(row.original.clientId)?.legalName}</span>
        <span className="truncate text-xs text-muted-foreground">{siteById(row.original.siteId)?.name}</span>
      </div>
    ),
  }),
  col.display({ id: "lines", header: "Needed", cell: ({ row }) => <span className="text-sm">{linesText(row.original)}</span> }),
  col.accessor("startDate", {
    header: "Starts",
    cell: ({ row }) => (
      <div className="flex flex-col whitespace-nowrap">
        <span className="tabular-nums">{displayDate(row.original.startDate)}</span>
        <span className="text-xs capitalize text-muted-foreground">{[...new Set(row.original.lines.map((l) => l.shift))].join(" and ")} shift</span>
      </div>
    ),
  }),
  col.accessor("filled", { header: "Filled", cell: ({ row }) => <FillMeter filled={row.original.filled} quantity={row.original.quantity} /> }),
  col.accessor("status", { header: "Status", cell: (c) => <StatusBadge tone={REQUEST_STATUS[c.getValue()].tone}>{REQUEST_STATUS[c.getValue()].label}</StatusBadge> }),
  col.display({
    id: "action",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) =>
      canMatch(row.original) ? (
        <Button asChild variant="outline" size="xs" onClick={(e) => e.stopPropagation()}>
          <Link to={`/requests/${row.original.id}/match`}>
            Match workers <ArrowRightIcon className="rtl:rotate-180" />
          </Link>
        </Button>
      ) : null,
  }),
]);

type Filter = "active" | RequestStatus | "all";

export function Requests() {
  const [params, setParams] = useSearchParams();
  const requests = useRequests();
  const [filter, setFilter] = useState<Filter>("active");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(
    () => requests.data?.filter((r) => (filter === "all" ? true : filter === "active" ? canMatch(r) : r.status === filter)),
    [requests.data, filter],
  );
  const active = requests.data?.filter(canMatch) ?? [];
  const needed = active.reduce((n, r) => n + r.quantity, 0);
  const filled = active.reduce((n, r) => n + r.filled, 0);
  const startingSoon = active.filter((r) => r.startDate <= dates.addDays(todayOman(), 7) && r.filled < r.quantity).length;
  const selected = requests.data?.find((r) => r.id === openId) ?? null;

  const newOpen = params.get("new") === "1";
  const closeNew = () => {
    const next = new URLSearchParams(params);
    next.delete("new");
    next.delete("client");
    setParams(next, { replace: true });
  };

  return (
    <Page>
      <PageHeader
        screen="S-15"
        sample
        title="Manpower requests"
        description="Client orders for workers by trade, site and dates, and how many positions are filled."
        actions={
          <Button onClick={() => setParams({ new: "1" })}>
            <PlusIcon /> New request
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open requests" value={requests.data ? active.length : "—"} hint="Open or partly filled" />
        <KpiCard label="Positions requested" value={requests.data ? needed : "—"} hint="On open requests" />
        <KpiCard label="Still to fill" value={requests.data ? needed - filled : "—"} hint={requests.data ? `${filled} filled so far` : undefined} />
        <KpiCard label="Starting within 7 days" value={requests.data ? startingSoon : "—"} hint="Not yet fully filled" />
      </div>

      <DataTable
        label="Manpower requests"
        columns={columns}
        data={rows}
        loading={requests.isLoading}
        getRowId={(r) => r.id}
        search={(r, q) => r.reference.toLowerCase().includes(q) || (clientById(r.clientId)?.legalName.toLowerCase().includes(q) ?? false) || (siteById(r.siteId)?.name.toLowerCase().includes(q) ?? false) || linesText(r).toLowerCase().includes(q)}
        searchPlaceholder="Filter by reference, client, site or trade…"
        onRowClick={(r) => setOpenId(r.id)}
        toolbar={
          <ToggleGroup type="single" variant="outline" size="sm" value={filter} onValueChange={(v) => v && setFilter(v as Filter)} aria-label="Filter by status">
            <ToggleGroupItem value="active">Open</ToggleGroupItem>
            <ToggleGroupItem value="filled">Filled</ToggleGroupItem>
            <ToggleGroupItem value="cancelled">Cancelled</ToggleGroupItem>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
          </ToggleGroup>
        }
        empty={
          <div className="flex flex-col items-center gap-2">
            <span>No requests in this view. Requests arrive by phone or email and are entered here.</span>
            <Button size="sm" variant="outline" onClick={() => setParams({ new: "1" })}>
              <PlusIcon /> New request
            </Button>
          </div>
        }
      />

      <RequestSheet request={selected} onClose={() => setOpenId(null)} />
      <NewRequestDialog open={newOpen} initialClient={params.get("client") ?? ""} onClose={closeNew} onCreated={(id) => setOpenId(id)} />
    </Page>
  );
}

function RequestSheet({ request: r, onClose }: { request: RequestView | null; onClose: () => void }) {
  const navigate = useNavigate();
  const client = r ? clientById(r.clientId) : undefined;
  return (
    <Sheet open={!!r} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        {r && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <StatusBadge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</StatusBadge>
                <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
              </div>
              <SheetTitle>{siteById(r.siteId)?.name}</SheetTitle>
              <SheetDescription>
                <Link to={`/clients/${r.clientId}`} className="text-primary underline-offset-4 hover:underline">
                  {client?.legalName}
                </Link>{" "}
                · {siteById(r.siteId)?.city}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 overflow-y-auto px-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {r.receivedVia === "email" ? <MailIcon aria-hidden className="size-4" /> : <PhoneIcon aria-hidden className="size-4" />}
                {r.receivedVia === "email" ? "Emailed" : "Phoned in"} by {r.requestedBy} on {displayDate(r.receivedOn)}
              </div>
              <ul className="flex flex-col gap-2">
                {r.lines.map((l) => (
                  <li key={l.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {l.quantity} × {l.trade}
                      </span>
                      <FillMeter filled={l.filled} quantity={l.quantity} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {displayDate(l.startDate)} – {displayDate(l.endDate)} · <span className="capitalize">{l.shift}</span> shift · skill level {l.skillLevelMin}+
                    </p>
                  </li>
                ))}
              </ul>
              {r.notes && (
                <div>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">Notes</h3>
                  <p className="text-sm">{r.notes}</p>
                </div>
              )}
            </div>
            <SheetFooter>
              {canMatch(r) ? (
                <Button onClick={() => navigate(`/requests/${r.id}/match`)}>
                  Match workers <ArrowRightIcon className="rtl:rotate-180" />
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">{r.status === "filled" ? "Every position is filled." : "This request was cancelled by the client."}</p>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function NewRequestDialog({ open, initialClient, onClose, onCreated }: { open: boolean; initialClient: string; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const { account } = useSession();
  const requests = useRequests();
  const today = todayOman();
  const blank = () => ({ clientId: initialClient, siteId: sitesOf(initialClient)[0]?.id ?? "", trade: "" as Trade | "", quantity: "1", startDate: dates.addDays(today, 7), endDate: dates.addDays(today, 97), shift: "day" as Shift, notes: "" });
  const [f, setF] = useState(blank);
  const [touched, setTouched] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Reset the form each time the dialog opens (state derived from the prop, no effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setF(blank());
      setTouched(false);
    }
  }
  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => setF((p) => ({ ...p, [k]: v }));

  const qty = Number(f.quantity);
  const errors = {
    clientId: f.clientId ? null : "Choose the client.",
    siteId: f.siteId ? null : "Choose the site.",
    trade: f.trade ? null : "Choose a trade.",
    quantity: Number.isInteger(qty) && qty >= 1 && qty <= 200 ? null : "Enter a whole number from 1 to 200.",
    startDate: !f.startDate ? "Choose a start date." : f.startDate < today ? "The start date cannot be in the past." : null,
    endDate: !f.endDate ? "Choose an end date." : f.endDate < f.startDate ? "The end date must be on or after the start date." : null,
  };
  const valid = Object.values(errors).every((e) => !e);
  const client = clientById(f.clientId);

  const create = useMutation({
    mutationFn: () => createRequest({ clientId: f.clientId, siteId: f.siteId, trade: f.trade as Trade, quantity: qty, startDate: f.startDate, endDate: f.endDate, shift: f.shift, notes: f.notes.trim(), by: account?.username ?? "unknown" }),
    onSuccess: (req) => {
      void qc.invalidateQueries({ queryKey: OPS_KEY });
      toast.success(`${req.reference} created`, { description: `${qty} × ${f.trade} for ${siteById(f.siteId)?.name}, from ${displayDate(f.startDate)}.` });
      onClose();
      onCreated(req.id);
    },
  });

  const err = (k: keyof typeof errors) => (touched ? errors[k] : null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New manpower request</DialogTitle>
          <DialogDescription>Enter the request as the client gave it by phone or email.</DialogDescription>
        </DialogHeader>
        <form
          id="new-request"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (valid && requests.workers) create.mutate();
          }}
        >
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!err("clientId")}>
                <FieldLabel htmlFor="rq-client">Client</FieldLabel>
                <Select
                  value={f.clientId}
                  onValueChange={(v) => {
                    set("clientId", v);
                    set("siteId", sitesOf(v)[0]?.id ?? "");
                  }}
                >
                  <SelectTrigger id="rq-client" className="w-full" aria-invalid={!!err("clientId")}>
                    <SelectValue placeholder="Choose a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENTS.filter((c) => c.status !== "prospect").map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.legalName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err("clientId") && <FieldError>{err("clientId")}</FieldError>}
              </Field>
              <Field data-invalid={!!err("siteId")}>
                <FieldLabel htmlFor="rq-site">Site</FieldLabel>
                <Select value={f.siteId} onValueChange={(v) => set("siteId", v)} disabled={!f.clientId}>
                  <SelectTrigger id="rq-site" className="w-full" aria-invalid={!!err("siteId")}>
                    <SelectValue placeholder={f.clientId ? "Choose a site" : "Choose the client first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sitesOf(f.clientId).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err("siteId") && <FieldError>{err("siteId")}</FieldError>}
              </Field>
            </div>
            {client?.status === "on_hold" && (
              <Alert>
                <TriangleAlertIcon />
                <AlertDescription>{client.legalName} is on hold for credit. You can record the request; finance must agree before workers are deployed.</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
              <Field data-invalid={!!err("trade")}>
                <FieldLabel htmlFor="rq-trade">Trade</FieldLabel>
                <Select value={f.trade} onValueChange={(v) => set("trade", v as Trade)}>
                  <SelectTrigger id="rq-trade" className="w-full" aria-invalid={!!err("trade")}>
                    <SelectValue placeholder="Choose a trade" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRADES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err("trade") && <FieldError>{err("trade")}</FieldError>}
              </Field>
              <Field data-invalid={!!err("quantity")}>
                <FieldLabel htmlFor="rq-qty">Workers</FieldLabel>
                <Input id="rq-qty" inputMode="numeric" className="text-end tabular-nums" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} aria-invalid={!!err("quantity")} />
                {err("quantity") && <FieldError>{err("quantity")}</FieldError>}
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={!!err("startDate")}>
                <FieldLabel htmlFor="rq-start">Start</FieldLabel>
                <Input id="rq-start" type="date" min={today} value={f.startDate} onChange={(e) => set("startDate", e.target.value)} aria-invalid={!!err("startDate")} />
                {err("startDate") && <FieldError>{err("startDate")}</FieldError>}
              </Field>
              <Field data-invalid={!!err("endDate")}>
                <FieldLabel htmlFor="rq-end">End</FieldLabel>
                <Input id="rq-end" type="date" min={f.startDate} value={f.endDate} onChange={(e) => set("endDate", e.target.value)} aria-invalid={!!err("endDate")} />
                {err("endDate") && <FieldError>{err("endDate")}</FieldError>}
              </Field>
              <Field>
                <FieldLabel id="rq-shift-label">Shift</FieldLabel>
                <ToggleGroup type="single" variant="outline" spacing={0} value={f.shift} onValueChange={(v) => v && set("shift", v as Shift)} aria-labelledby="rq-shift-label" className="w-full">
                  <ToggleGroupItem value="day" className="flex-1">
                    Day
                  </ToggleGroupItem>
                  <ToggleGroupItem value="night" className="flex-1">
                    Night
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="rq-notes">Notes</FieldLabel>
              <Textarea id="rq-notes" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything the client asked for: language, experience, PPE" />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-request" disabled={create.isPending || !requests.workers}>
            {f.trade && valid ? `Create request for ${qty} × ${f.trade}` : "Create request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
