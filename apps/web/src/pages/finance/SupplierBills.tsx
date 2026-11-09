/**
 * S-31 Supplier bills (PRD 4.17): camp rent, bus fuel and maintenance, visa fees and agency fees.
 * A bill is entered as a draft, approved by a second person (four eyes, CLAUDE.md rule 6), which
 * posts it to the ledger in the bill's month (never a closed one), then paid.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckIcon, PaperclipIcon, PlusIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
import { Page, PageHeader } from "@/components/page-header";
import { createColumns, DataTable } from "@/components/data-table";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { formatMoney, Money } from "@/components/money";
import { KpiCard } from "@/components/kpi-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/lib/session";
import { displayDate } from "@/lib/format";
import { money, todayOman } from "@/demo/core";
import { read, useDemoMutation, VAT_CODES, vatCodeOn, vatOf, vatRef, type VatKey } from "@/demo/billing";
import { addBill, approveBill, CATEGORY_LABEL, COST_CENTRES, costCentreById, financeKeys, listBills, payBill, supplierById, SUPPLIERS, type BillStatus, type CostCentreKind, type SupplierBill } from "@/demo/finance";
import { KpiMoney } from "@/pages/billing/Invoices";

const STATUS: Record<BillStatus, { tone: StatusTone; label: string }> = {
  draft: { tone: "draft", label: "Draft" },
  approved: { tone: "info", label: "Approved" },
  paid: { tone: "ok", label: "Paid" },
};
const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Awaiting approval" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const KIND_LABEL: Record<CostCentreKind, string> = { client: "Clients", site: "Sites", camp: "Camps", office: "Office" };
const AMOUNT = /^\d+(\.\d{1,3})?$/;

const col = createColumns<SupplierBill>();

export function SupplierBills() {
  const { account } = useSession();
  const me = account?.username ?? "finance.lead";
  const today = todayOman();
  const [tab, setTab] = useState<TabKey>("all");
  const q = useQuery({ queryKey: financeKeys.bills, queryFn: () => read(() => listBills()) });
  const bills = q.data ?? [];
  const rows = q.data ? bills.filter((b) => tab === "all" || b.status === tab) : undefined;
  const counts = Object.fromEntries(TABS.map((t) => [t.key, bills.filter((b) => t.key === "all" || b.status === t.key).length])) as Record<TabKey, number>;
  const month = today.slice(0, 7);
  const drafts = bills.filter((b) => b.status === "draft");
  const approved = bills.filter((b) => b.status === "approved");
  const paidThisMonth = bills.filter((b) => b.paidOn?.startsWith(month));
  const vatThisMonth = bills.filter((b) => b.status !== "draft" && b.date.startsWith(month));

  const approve = useDemoMutation(
    (b: SupplierBill) => approveBill(b.id, me),
    (b) => toast.success(`${b.number} approved`, { description: `${formatMoney(b.total)} posted to the ledger for ${displayDate(b.date)}.` }),
  );
  const pay = useDemoMutation(
    (b: SupplierBill) => payBill(b.id, todayOman()),
    (b) => toast.success(`${b.number} paid`, { description: `${formatMoney(b.total)} to ${supplierById(b.supplierId).name}. It matches the bank statement once cleared.` }),
  );
  const { mutate: approveMutate, isPending: approving } = approve;
  const { mutate: payMutate, isPending: paying } = pay;

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("supplierId", {
          header: "Supplier",
          cell: ({ row }) => (
            <div className="max-w-44 leading-tight">
              <div title={supplierById(row.original.supplierId).name} className="truncate font-medium">
                {supplierById(row.original.supplierId).name}
              </div>
              <div className="text-xs text-muted-foreground">{CATEGORY_LABEL[row.original.category]}</div>
            </div>
          ),
        }),
        col.accessor("number", { header: "Bill no.", cell: (c) => <span className="whitespace-nowrap tabular-nums">{c.getValue()}</span> }),
        col.accessor("date", { header: "Date", cell: (c) => <span className="whitespace-nowrap tabular-nums">{displayDate(c.getValue())}</span> }),
        col.accessor("costCentreId", {
          header: "Cost centre",
          cell: (c) => {
            const cc = costCentreById(c.getValue());
            return (
              <div className="max-w-32 leading-tight">
                <div className="truncate tabular-nums">{cc?.code}</div>
                <div title={cc?.name} className="truncate text-xs text-muted-foreground">
                  {cc?.name}
                </div>
              </div>
            );
          },
        }),
        col.accessor("amount", { header: () => <div className="text-end">Amount</div>, cell: (c) => <Money value={c.getValue()} bare /> }),
        col.accessor("vat", {
          header: () => <div className="text-end">VAT</div>,
          cell: ({ row }) => (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="block cursor-help rounded text-end focus-visible:outline-2 focus-visible:outline-ring">
                  <Money value={row.original.vat} bare className="text-muted-foreground" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{vatRef(vatCodeOn(row.original.vatCode, row.original.date))}</TooltipContent>
            </Tooltip>
          ),
        }),
        col.accessor("total", { header: () => <div className="text-end">Total</div>, cell: (c) => <Money value={c.getValue()} bare className="font-medium" /> }),
        col.accessor("attachments", {
          header: "File",
          enableSorting: false,
          cell: (c) =>
            c.getValue().length ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex items-center gap-1 rounded text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
                    <PaperclipIcon aria-hidden className="size-3.5" />
                    <span className="tabular-nums">{c.getValue().length}</span>
                    <span className="sr-only">attachment{c.getValue().length > 1 ? "s" : ""}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{c.getValue().join(", ")}</TooltipContent>
              </Tooltip>
            ) : (
              <StatusBadge tone="incomplete">Missing</StatusBadge>
            ),
        }),
        col.accessor("status", {
          header: "Status",
          cell: ({ row }) => (
            <div className="flex flex-col items-start gap-0.5">
              <StatusBadge tone={STATUS[row.original.status].tone}>{STATUS[row.original.status].label}</StatusBadge>
              {row.original.paidOn && <span className="text-xs whitespace-nowrap text-muted-foreground">{displayDate(row.original.paidOn)}</span>}
            </div>
          ),
        }),
        col.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => {
            const b = row.original;
            if (b.status === "draft") {
              const self = b.createdBy === me;
              const noFile = b.attachments.length === 0;
              const why = self ? "Needs a second approver: you entered this bill." : noFile ? "Attach the supplier's bill before approving." : null;
              return why ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-block">
                      <Button size="xs" variant="outline" disabled>
                        <CheckIcon /> Approve
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{why}</TooltipContent>
                </Tooltip>
              ) : (
                <Button size="xs" variant="outline" disabled={approving} onClick={() => approveMutate(b)}>
                  <CheckIcon /> Approve
                </Button>
              );
            }
            if (b.status === "approved")
              return (
                <ConfirmDialog
                  trigger={
                    <Button size="xs" disabled={paying}>
                      <SendIcon /> Pay
                    </Button>
                  }
                  title={`Pay ${supplierById(b.supplierId).name}?`}
                  description={<p>Bill {b.number} dated {displayDate(b.date)}. The transfer goes from Bank Muscat ••••0172 today and posts to the ledger.</p>}
                  confirmLabel={`Pay ${formatMoney(b.total)}`}
                  onConfirm={() => payMutate(b)}
                />
              );
            return null;
          },
        }),
      ]),
    [me, approveMutate, approving, payMutate, paying],
  );

  return (
    <Page>
      <PageHeader
        screen="S-31"
        sample
        title="Supplier bills"
        description="Camp rent, bus fuel and maintenance, visa fees and agency costs. One person enters a bill, another approves it; approval posts it to the ledger against its cost centre."
        actions={<AddBillDialog me={me} />}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Awaiting approval" value={<KpiMoney value={money.sum(drafts.map((b) => b.total))} />} hint={`${drafts.length} draft bill${drafts.length === 1 ? "" : "s"} need a second person`} />
        <KpiCard label="Approved, unpaid" value={<KpiMoney value={money.sum(approved.map((b) => b.total))} />} hint={`${approved.length} bill${approved.length === 1 ? "" : "s"} · earliest due ${approved.length ? displayDate(approved.map((b) => b.dueDate).sort()[0]) : "—"}`} />
        <KpiCard label="Paid this month" value={<KpiMoney value={money.sum(paidThisMonth.map((b) => b.total))} />} hint={`${paidThisMonth.length} payment${paidThisMonth.length === 1 ? "" : "s"}`} />
        <KpiCard label="VAT to recover this month" value={<KpiMoney value={money.sum(vatThisMonth.map((b) => b.vat))} />} hint="Input VAT on approved bills" />
      </div>
      <div className="flex flex-col gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="max-w-full overflow-x-auto">
          <TabsList aria-label="Saved views">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="gap-1.5 px-2.5">
                {t.label}
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal tabular-nums text-muted-foreground">{counts[t.key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <DataTable
          label="Supplier bills"
          columns={columns}
          data={rows}
          loading={q.isPending}
          getRowId={(b) => b.id}
          search={(b, s) => [supplierById(b.supplierId).name, b.number, CATEGORY_LABEL[b.category], costCentreById(b.costCentreId)?.code ?? ""].some((v) => v.toLowerCase().includes(s))}
          searchPlaceholder="Filter bills…"
          empty={tab === "draft" ? "No bills waiting for approval." : "No bills here yet. Add the first supplier bill."}
        />
      </div>
    </Page>
  );
}

function AddBillDialog({ me }: { me: string }) {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(todayOman());
  const [amount, setAmount] = useState("");
  const [vatCode, setVatCode] = useState<VatKey>("standard");
  const [costCentreId, setCostCentreId] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reset = () => {
    setSupplierId("");
    setNumber("");
    setAmount("");
    setCostCentreId("");
    setFile(null);
    setSubmitted(false);
    setDate(todayOman());
  };
  const errors = {
    supplier: submitted && !supplierId ? "Pick the supplier." : null,
    number: submitted && !number.trim() ? "Enter the number printed on the supplier's bill." : null,
    amount: submitted && !AMOUNT.test(amount) ? "Enter the amount before VAT, e.g. 2150.000" : null,
    cc: submitted && !costCentreId ? "Pick where the cost belongs." : null,
  };
  const valid = supplierId && number.trim() && AMOUNT.test(amount) && costCentreId && date;
  const vat = AMOUNT.test(amount) ? vatOf(amount, vatCodeOn(vatCode, date || todayOman())) : null;
  const m = useDemoMutation(
    () => addBill({ supplierId, number, date, amount, vatCode, costCentreId, description: "", attachments: file ? [file] : [], by: me }),
    (b) => {
      toast.success(`Bill ${b.number} saved as draft`, { description: `${formatMoney(b.total)} · a second person approves it before it posts.` });
      setOpen(false);
      reset();
    },
  );
  const byKind = (["camp", "site", "client", "office"] as CostCentreKind[]).map((k) => ({ kind: k, items: COST_CENTRES.filter((c) => c.kind === k) }));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> Add bill
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a supplier bill</DialogTitle>
          <DialogDescription>Saved as a draft. Someone else approves it, which posts it to the ledger in the bill's month.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={!!errors.supplier}>
            <FieldLabel htmlFor="bill-supplier">Supplier</FieldLabel>
            <Select
              value={supplierId}
              onValueChange={(v) => {
                setSupplierId(v);
                const sp = supplierById(v);
                setVatCode(sp.vatCode);
                setCostCentreId(sp.costCentreId);
              }}
            >
              <SelectTrigger id="bill-supplier" className="w-full" aria-invalid={!!errors.supplier}>
                <SelectValue placeholder="Pick the supplier" />
              </SelectTrigger>
              <SelectContent>
                {SUPPLIERS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {CATEGORY_LABEL[s.category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.supplier && <FieldError>{errors.supplier}</FieldError>}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.number}>
              <FieldLabel htmlFor="bill-number">Bill number</FieldLabel>
              <Input id="bill-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. FCP/2026/0611" aria-invalid={!!errors.number} />
              {errors.number && <FieldError>{errors.number}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="bill-date">Bill date</FieldLabel>
              <Input id="bill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="bill-amount">Amount before VAT (OMR)</FieldLabel>
              <Input id="bill-amount" inputMode="decimal" className="tabular-nums" placeholder="0.000" value={amount} onChange={(e) => setAmount(e.target.value.trim())} aria-invalid={!!errors.amount} />
              {errors.amount && <FieldError>{errors.amount}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="bill-vat">VAT code</FieldLabel>
              <Select value={vatCode} onValueChange={(v) => setVatCode(v as VatKey)}>
                <SelectTrigger id="bill-vat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_CODES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field data-invalid={!!errors.cc}>
            <FieldLabel htmlFor="bill-cc">Cost centre</FieldLabel>
            <Select value={costCentreId} onValueChange={setCostCentreId}>
              <SelectTrigger id="bill-cc" className="w-full" aria-invalid={!!errors.cc}>
                <SelectValue placeholder="Client, site, camp or office" />
              </SelectTrigger>
              <SelectContent>
                {byKind.map((g) => (
                  <SelectGroup key={g.kind}>
                    <SelectLabel>{KIND_LABEL[g.kind]}</SelectLabel>
                    {g.items.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} · {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {errors.cc && <FieldError>{errors.cc}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="bill-file">Supplier's bill (PDF or photo)</FieldLabel>
            <Input id="bill-file" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
            <FieldDescription className="flex items-center gap-1">
              {file ? (
                <>
                  <PaperclipIcon aria-hidden className="size-3" /> {file}
                </>
              ) : (
                <>
                  <TriangleAlertIcon aria-hidden className="size-3" /> Without the file the bill can be saved, but not approved.
                </>
              )}
            </FieldDescription>
          </Field>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{vatRef(vatCodeOn(vatCode, date || todayOman()))}</span>
              <span className="tabular-nums">{vat ? formatMoney(vat) : "—"}</span>
            </div>
            <div className="mt-1 flex justify-between gap-4 font-medium">
              <span>Total</span>
              <span className="tabular-nums">{vat ? formatMoney(money.sum([amount, vat])) : "—"}</span>
            </div>
          </div>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={m.isPending}
            onClick={() => {
              setSubmitted(true);
              if (valid) m.mutate(undefined);
            }}
          >
            Save draft{vat ? ` (${formatMoney(money.sum([amount, vat]))})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
