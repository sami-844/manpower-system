/**
 * S-14 Contracts and rate cards, list (App Flow: "Rates by trade and hour type, with versions").
 * Demo data until `/contracts` lands. Pending rate card versions show here so a second approver
 * can find them.
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Page, PageHeader } from "@/components/page-header";
import { DataTable, createColumns } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { displayDate } from "@/lib/format";
import { fetchContracts, type ContractRow } from "@/demo/commercial";

export const CONTRACTS_KEY = ["demo", "commercial", "contracts"] as const;

const col = createColumns<ContractRow>();
const columns = col.columns([
  col.accessor("reference", {
    header: "Contract",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-mono text-sm font-medium">{row.original.reference}</span>
        <span className="text-xs text-muted-foreground">{row.original.client.legalName}</span>
      </div>
    ),
  }),
  col.accessor("startDate", {
    header: "Term",
    cell: ({ row }) => (
      <span className="whitespace-nowrap tabular-nums">
        {displayDate(row.original.startDate)} – {displayDate(row.original.endDate)}
      </span>
    ),
  }),
  col.display({
    id: "card",
    header: "Rate card in force",
    cell: ({ row }) => {
      const cur = row.original.current;
      return cur ? (
        <span className="whitespace-nowrap">
          <span className="font-medium">v{cur.version}</span> <span className="text-muted-foreground">from {displayDate(cur.validFrom)}</span>
        </span>
      ) : (
        "—"
      );
    },
  }),
  col.display({
    id: "pending",
    header: "Approval",
    cell: ({ row }) =>
      row.original.pending ? (
        <StatusBadge tone="due">v{row.original.pending.version} needs a second approver</StatusBadge>
      ) : (
        <StatusBadge tone="ok">All versions approved</StatusBadge>
      ),
  }),
  col.accessor("autoApproveDays", { header: () => <div className="text-end">Auto-approve</div>, cell: (c) => <div className="text-end tabular-nums">{c.getValue()} days</div> }),
  col.accessor("minBillableHours", { header: () => <div className="text-end">Min. hours</div>, cell: (c) => <div className="text-end tabular-nums">{c.getValue()} h/day</div> }),
  col.accessor("escalationDate", {
    header: "Escalation",
    cell: (c) => (c.getValue() ? displayDate(c.getValue()) : <span className="text-muted-foreground">None</span>),
  }),
]);

export function Contracts() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: CONTRACTS_KEY, queryFn: fetchContracts });
  const pending = q.data?.filter((c) => c.pending).length ?? 0;
  return (
    <Page>
      <PageHeader
        screen="S-14"
        sample
        title="Contracts & rate cards"
        description="Each client contract with its billing terms and dated rate card versions. A rate change is always a new version, approved by a second person."
        meta={pending > 0 ? <StatusBadge tone="due">{pending === 1 ? "1 version awaits approval" : `${pending} versions await approval`}</StatusBadge> : undefined}
      />
      <DataTable
        label="Contracts"
        columns={columns}
        data={q.data}
        loading={q.isLoading}
        getRowId={(r) => r.id}
        search={(r, s) => r.reference.toLowerCase().includes(s) || r.client.legalName.toLowerCase().includes(s)}
        searchPlaceholder="Filter by reference or client…"
        onRowClick={(r) => navigate(`/contracts/${r.id}`)}
        empty="No contracts yet. A contract is added when a client signs its first master service agreement."
      />
    </Page>
  );
}
