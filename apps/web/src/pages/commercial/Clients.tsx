/**
 * S-12 Clients list (App Flow: "Clients, credit status, open requests"; PRD 4.4).
 * Clients, balances and requests are demo data; deployed headcount counts the REAL workers whose
 * site belongs to the client.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { sumOmr } from "@mms/core";
import { cn } from "@/lib/utils";
import { Page, PageHeader } from "@/components/page-header";
import { DataTable, createColumns } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Money, formatMoney } from "@/components/money";
import { KpiCard } from "@/components/kpi-card";
import { creditUsed, deployedFor, fetchClients, overLimit, type ClientRow } from "@/demo/commercial";
import { useRequests } from "@/demo/operations";
import { sitesOf, type Client } from "@/demo/reference";
import { useWorkforce } from "@/demo/workforce";

export const CLIENTS_KEY = ["demo", "commercial", "clients"] as const;

export function ClientStatusBadge({ status }: { status: Client["status"] }) {
  if (status === "active") return <StatusBadge tone="ok">Active</StatusBadge>;
  if (status === "on_hold") return <StatusBadge tone="due">On hold</StatusBadge>;
  return <StatusBadge tone="draft">Prospect</StatusBadge>;
}

/** Credit in use against the limit: a thin bar plus the figures, never colour alone. */
export function CreditBar({ client, className }: { client: ClientRow; className?: string }) {
  const used = creditUsed(client.balance, client);
  const over = overLimit(client.balance, client);
  return (
    <div className={cn("flex min-w-44 flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
        <span className={cn("font-medium", over && "text-destructive")}>{formatMoney(client.balance.outstanding, { bare: true })}</span>
        <span className="text-muted-foreground">of {formatMoney(client.creditLimit, { bare: true })}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used * 100)} aria-label="Credit limit used">
        <div className={cn("h-full rounded-full", over ? "bg-destructive" : used > 0.8 ? "bg-warning" : "bg-primary/70")} style={{ width: `${Math.min(used, 1) * 100}%` }} />
      </div>
    </div>
  );
}

interface Row extends ClientRow {
  sites: number;
  deployed: number;
  openRequests: number;
}

const col = createColumns<Row>();
const columns = col.columns([
  col.accessor("legalName", {
    header: "Client",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.legalName}</span>
        <span className="font-mono text-xs text-muted-foreground">{row.original.code}</span>
      </div>
    ),
  }),
  col.accessor("city", { header: "City", cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span> }),
  col.accessor("status", { header: "Status", cell: (c) => <ClientStatusBadge status={c.getValue()} /> }),
  col.accessor("sites", { header: () => <div className="text-end">Sites</div>, cell: (c) => <div className="text-end tabular-nums">{c.getValue()}</div> }),
  col.accessor("deployed", { header: () => <div className="text-end">Deployed</div>, cell: (c) => <div className="text-end font-medium tabular-nums">{c.getValue()}</div> }),
  col.display({
    id: "credit",
    header: "Outstanding vs credit limit (OMR)",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <CreditBar client={row.original} className="w-48" />
        {overLimit(row.original.balance, row.original) && <StatusBadge tone="blocked">Over credit limit</StatusBadge>}
      </div>
    ),
  }),
  col.accessor("paymentTermsDays", { header: () => <div className="text-end">Terms</div>, cell: (c) => <div className="text-end tabular-nums">{c.getValue()} days</div> }),
  col.accessor("openRequests", {
    header: () => <div className="text-end">Open requests</div>,
    cell: (c) => <div className={cn("text-end tabular-nums", c.getValue() === 0 && "text-muted-foreground")}>{c.getValue()}</div>,
  }),
]);

export function Clients() {
  const navigate = useNavigate();
  const clients = useQuery({ queryKey: CLIENTS_KEY, queryFn: fetchClients });
  const workforce = useWorkforce();
  const requests = useRequests();

  const rows = useMemo<Row[] | undefined>(() => {
    if (!clients.data) return undefined;
    const workers = workforce.data ?? [];
    return clients.data.map((c) => ({
      ...c,
      sites: sitesOf(c.id).length,
      deployed: deployedFor(c.id, workers).length,
      openRequests: (requests.data ?? []).filter((r) => r.clientId === c.id && (r.status === "open" || r.status === "partly_filled")).length,
    }));
  }, [clients.data, workforce.data, requests.data]);

  const over = rows?.filter((r) => overLimit(r.balance, r)) ?? [];

  return (
    <Page>
      <PageHeader screen="S-12" sample title="Clients" description="Every client with its sites, crew on site, credit position and open manpower requests." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active clients" value={rows ? rows.filter((r) => r.status === "active").length : "—"} hint={rows ? `${rows.length} accounts in total` : undefined} />
        <KpiCard label="Workers deployed to clients" value={rows ? rows.reduce((n, r) => n + r.deployed, 0) : "—"} hint="From the live worker list" to="/roster" />
        <KpiCard label="Outstanding receivables (OMR)" value={rows ? <Money bare align="start" value={sumOmr(rows.map((r) => r.balance.outstanding)).toFixed(3)} /> : "—"} hint="Across all open invoices" to="/receivables" />
        <KpiCard
          label="Over credit limit"
          value={rows ? over.length : "—"}
          footer={over[0] ? over.map((r) => r.legalName).join(", ") : undefined}
          hint={over.length ? "New deployments need finance's agreement" : "Every client is within its limit"}
          to={over[0] ? `/clients/${over[0].id}` : undefined}
        />
      </div>

      <DataTable
        label="Clients"
        columns={columns}
        data={rows}
        loading={clients.isLoading}
        getRowId={(r) => r.id}
        search={(r, q) => r.legalName.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.city.toLowerCase().includes(q)}
        searchPlaceholder="Filter by name, code or city…"
        onRowClick={(r) => navigate(`/clients/${r.id}`)}
        empty="No clients yet. Clients appear here once commercial adds their first account."
      />
    </Page>
  );
}
