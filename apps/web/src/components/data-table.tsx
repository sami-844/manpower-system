/**
 * The one list component for every record screen (Design Brief: `Table` + TanStack Table,
 * DataTable pattern). Built on TanStack Table v9 (the version shadcn's dashboard-01 block uses).
 *
 *   const col = createColumns<Row>();
 *   const columns = col.columns([
 *     col.accessor("name", { header: "Name" }),
 *     col.accessor("amount", { header: () => <div className="text-end">Amount</div>, cell: (c) => <Money value={c.getValue()} /> }),
 *   ]);
 *   <DataTable label="Invoices" columns={columns} data={rows} search={(r, q) => r.name.toLowerCase().includes(q)} />
 *
 * Behaviour from App Flow "Behaviour everywhere": skeleton rows while loading (never a blank
 * page), an empty state that says what belongs here, `/` focuses the filter, J/K move between
 * rows and Enter opens the focused row.
 */
import * as React from "react";
import {
  columnVisibilityFeature,
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dataTableFeatures = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
});
type Features = typeof dataTableFeatures;

/** Typed column helper for a row shape. */
export const createColumns = <T extends RowData>() => createColumnHelper<Features, T>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- column value types differ per column; TanStack's own helper returns this union.
export type DataTableColumns<T extends RowData> = ColumnDef<Features, T, any>[];

export interface DataTableProps<T extends RowData> {
  /** Accessible table name (also used by tests: `getByRole("table", { name })`). */
  label: string;
  columns: DataTableColumns<T>;
  data: readonly T[] | undefined;
  loading?: boolean;
  getRowId?: (row: T) => string;
  /** Client-side filter for the search box. Omit to hide the box. */
  search?: (row: T, query: string) => boolean;
  searchPlaceholder?: string;
  /** Extra controls beside the search box (filter chips, view toggles). */
  toolbar?: React.ReactNode;
  /** Shown when there are no rows: say what belongs here and offer the one action that fills it. */
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** Enables the checkbox column; `bulkActions` renders when rows are selected. */
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  pageSize?: number;
  /** Row height: 36 px compact (desktop default) or 44 px comfortable (Design Brief "Spacing"). */
  density?: "compact" | "comfortable";
  className?: string;
}

export function DataTable<T extends RowData>({
  label,
  columns,
  data,
  loading = false,
  getRowId,
  search,
  searchPlaceholder = "Filter…",
  toolbar,
  empty,
  onRowClick,
  selectable = false,
  bulkActions,
  pageSize = 25,
  density = "compact",
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize });
  const searchRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTableSectionElement>(null);

  const rows = React.useMemo(() => {
    const all = data ?? [];
    const q = query.trim().toLowerCase();
    return q && search ? all.filter((r) => search(r, q)) : [...all];
  }, [data, query, search]);

  const allColumns = React.useMemo<DataTableColumns<T>>(() => {
    if (!selectable) return columns;
    const select: ColumnDef<Features, T> = {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    };
    return [select, ...columns];
  }, [columns, selectable]);

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns: allColumns,
    state: { sorting, rowSelection, pagination },
    getRowId: getRowId ? (r: T) => getRowId(r) : undefined,
    enableRowSelection: selectable,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
  });

  // Back to the first page when the filter changes, so results are never hidden on page 3.
  React.useEffect(() => setPagination((p) => ({ ...p, pageIndex: 0 })), [query]);

  // "/" focuses this table's filter (App Flow: Keyboard).
  React.useEffect(() => {
    if (!search) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [search]);

  const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, row: T) => {
    const focusable = Array.from(bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr[tabindex]") ?? []);
    const i = focusable.indexOf(e.currentTarget);
    if (e.key === "Enter") onRowClick?.(row);
    else if (e.key === "j" || e.key === "ArrowDown") focusable[i + 1]?.focus();
    else if (e.key === "k" || e.key === "ArrowUp") focusable[i - 1]?.focus();
    else return;
    e.preventDefault();
  };

  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const pageRows = table.getRowModel().rows;
  const colCount = table.getVisibleLeafColumns().length;
  const rowHeight = density === "compact" ? "h-9" : "h-11";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {(search || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <InputGroup className="w-full sm:w-72">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={`Filter ${label.toLowerCase()}`}
              />
              <InputGroupAddon align="inline-end" className="hidden sm:flex">
                <Kbd>/</Kbd>
              </InputGroupAddon>
            </InputGroup>
          )}
          {toolbar}
        </div>
      )}

      {selectable && selected.length > 0 && bulkActions && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/60 px-3 py-2 text-sm" role="region" aria-label="Bulk actions">
          <span className="font-medium tabular-nums">{selected.length} selected</span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions(selected, () => setRowSelection({}))}</div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="max-h-[calc(100svh-16rem)] overflow-auto">
          <Table aria-label={label} aria-busy={loading}>
            <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="hover:bg-transparent">
                  {hg.headers.map((header) => {
                    const sortable = header.column.getCanSort() && header.column.id !== "select";
                    const dir = header.column.getIsSorted();
                    return (
                      <TableHead key={header.id} colSpan={header.colSpan} aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : undefined} className="h-9 text-xs font-medium text-muted-foreground">
                        {header.isPlaceholder ? null : sortable ? (
                          <button type="button" onClick={header.column.getToggleSortingHandler()} className="-ms-1 inline-flex w-full items-center gap-1 rounded px-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&>div]:flex-1">
                            <FlexRender header={header} />
                            {dir === "asc" ? <ArrowUpIcon className="size-3" /> : dir === "desc" ? <ArrowDownIcon className="size-3" /> : <ArrowUpDownIcon className="size-3 opacity-40" />}
                          </button>
                        ) : (
                          <FlexRender header={header} />
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody ref={bodyRef}>
              {loading && !data?.length ? (
                Array.from({ length: 8 }, (_, i) => (
                  <TableRow key={i} className={rowHeight}>
                    {Array.from({ length: colCount }, (_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full max-w-40" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : pageRows.length ? (
                pageRows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    onKeyDown={onRowClick ? (e) => onRowKey(e, row.original) : undefined}
                    className={cn(rowHeight, onRowClick && "cursor-pointer focus-visible:bg-accent focus-visible:outline-none")}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-1.5">
                        <FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colCount} className="h-40 text-center text-sm text-muted-foreground">
                    {query ? `Nothing matches “${query}”.` : (empty ?? "Nothing here yet.")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {rows.length > pagination.pageSize && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums">
            {pagination.pageIndex * pagination.pageSize + 1}–{Math.min(rows.length, (pagination.pageIndex + 1) * pagination.pageSize)} of {rows.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeftIcon className="rtl:rotate-180" />
            </Button>
            <span className="px-2 tabular-nums">
              Page {pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRightIcon className="rtl:rotate-180" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
