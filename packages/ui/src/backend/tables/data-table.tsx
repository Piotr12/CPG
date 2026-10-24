import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/table";
import { cn } from "../../lib/utils";
import { CALLOUT_TONES } from "../feedback/callout";
import { EmptyState } from "../feedback/empty-state";
import type { StatusTone } from "../feedback/status-badge";

/** What a column holds, which sets its minimum width and alignment. */
export type DataTableColumnKind = "id" | "text" | "longText" | "quantity" | "date" | "status" | "actions";

/** 1 always shows; 2 hides below `md`; 3 hides below `lg`. */
export type DataTableColumnPriority = 1 | 2 | 3;

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Added after the kind's and priority's classes, so it can override them. */
  className?: string;
  kind?: DataTableColumnKind;
  /** Defaults to 1. A `status` column is always priority 1. */
  priority?: DataTableColumnPriority;
  /**
   * A `longText` column that truncates to one line instead of wrapping: returns the full text, shown
   * as the cell's `title`.
   */
  truncate?: (row: Row) => string;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  /** Server-rendered pagination controls, when this list spans multiple pages. */
  pagination?: ReactNode;
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Per-row controls in a last, unlabelled column; return null for a row without any. */
  rowActions?: (row: Row) => ReactNode;
  /** A row needing attention: a 2 px edge in the tone's colour and its icon on the first cell. */
  rowTone?: (row: Row) => StatusTone | undefined;
  /** Shown instead of rows when there are none. */
  empty: ReactNode;
  /** Accessible name of the table and of its scroll container. */
  label: string;
  /** Screen-reader name of the row-actions column. */
  actionsLabel?: string;
}

/** Complete class strings (Tailwind only generates classes it finds whole in the source). */
const KIND_CLASSES: Record<DataTableColumnKind, string> = {
  id: "min-w-28 whitespace-nowrap",
  text: "min-w-32",
  // Wraps at words; a single unbroken token widens the column rather than breaking per character.
  longText: "min-w-48 whitespace-normal wrap-break-word",
  quantity: "min-w-24 text-right tabular-nums whitespace-nowrap",
  date: "min-w-28 whitespace-nowrap",
  status: "min-w-32",
  actions: "w-0 text-right",
};

/** Classes for a kind's body cells only: a business ID is monospaced, its column header is not. */
const CELL_KIND_CLASSES: Partial<Record<DataTableColumnKind, string>> = {
  id: "font-mono",
};

const PRIORITY_CLASSES: Record<DataTableColumnPriority, string | undefined> = {
  1: undefined,
  2: "hidden md:table-cell",
  3: "hidden lg:table-cell",
};

const TRUNCATE_CLASSES = "max-w-xs truncate";

/** The left edge of a toned row's first cell. */
const ROW_TONE_EDGES: Record<StatusTone, string> = {
  success: "border-l-success",
  warning: "border-l-warning",
  danger: "border-l-danger",
  neutral: "border-l-neutral-tone",
};

/** The first column stays in view while the table scrolls sideways. */
const STICKY_CELL = "sticky left-0 bg-background";

/** The classes a column's header and cells share. Throws when a `status` column is not priority 1. */
export function columnClasses<Row>(column: DataTableColumn<Row>): string {
  const priority = column.priority ?? 1;
  if (column.kind === "status" && priority !== 1) {
    throw new Error(`DataTable column "${column.id}": a status column is always priority 1, not ${priority}`);
  }
  return cn(column.kind && KIND_CLASSES[column.kind], column.truncate && TRUNCATE_CLASSES, PRIORITY_CLASSES[priority]);
}

/**
 * Every list screen's table: columns from config, an empty state, and a row-actions slot. It scrolls
 * sideways inside a labelled, keyboard-reachable container with the first column sticky, so the page
 * never does. Sorting and filtering are added with the first list that needs them.
 */
export function DataTable<Row>({
  columns,
  pagination,
  rows,
  rowKey,
  rowActions,
  rowTone,
  empty,
  label,
  actionsLabel = "Actions",
}: DataTableProps<Row>) {
  const width = columns.length + (rowActions ? 1 : 0);
  const shared = columns.map(columnClasses);
  return (
    <>
    <Table aria-label={label} scrollLabel={label}>
      <TableHeader>
        <TableRow>
          {columns.map((column, index) => (
            <TableHead key={column.id} className={cn(shared[index], index === 0 && cn(STICKY_CELL, "z-10"), column.className)}>
              {column.header}
            </TableHead>
          ))}
          {rowActions && (
            <TableHead className="w-0">
              <span className="sr-only">{actionsLabel}</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={width}>
              <EmptyState title={empty} />
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const tone = rowTone?.(row);
            return (
              <TableRow key={rowKey(row)} data-tone={tone}>
                {columns.map((column, index) => (
                  <TableCell
                    key={column.id}
                    title={column.truncate?.(row)}
                    className={cn(
                      shared[index],
                      column.kind && CELL_KIND_CLASSES[column.kind],
                      index === 0 && STICKY_CELL,
                      index === 0 && rowTone && cn("border-l-2 border-l-transparent", tone && ROW_TONE_EDGES[tone]),
                      column.className,
                    )}
                  >
                    {index === 0 && tone ? <ToneMarker tone={tone}>{column.cell(row)}</ToneMarker> : column.cell(row)}
                  </TableCell>
                ))}
                {rowActions && <TableCell className="text-right">{rowActions(row)}</TableCell>}
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
    {pagination}
    </>
  );
}

/** A toned row's first-cell content, after the tone's 14 px icon. */
function ToneMarker({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const { defaultIcon: Icon, icon } = CALLOUT_TONES[tone];
  return (
    <span className="inline-flex items-center gap-2">
      <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", icon)} />
      {children}
    </span>
  );
}
