import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/table";
import { EmptyState } from "../feedback/empty-state";

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  className?: string;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  /** Server-rendered pagination controls, when this list spans multiple pages. */
  pagination?: ReactNode;
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Per-row controls in a last, unlabelled column; return null for a row without any. */
  rowActions?: (row: Row) => ReactNode;
  /** Shown instead of rows when there are none. */
  empty: ReactNode;
  /** Accessible name of the table. */
  label: string;
  /** Screen-reader name of the row-actions column. */
  actionsLabel?: string;
}

/**
 * Every list screen's table: columns from config, an empty state, and a row-actions slot.
 * Pagination, sorting and filtering are added with the first list that needs them.
 */
export function DataTable<Row>({
  columns,
  pagination,
  rows,
  rowKey,
  rowActions,
  empty,
  label,
  actionsLabel = "Actions",
}: DataTableProps<Row>) {
  const width = columns.length + (rowActions ? 1 : 0);
  return (
    <>
    <Table aria-label={label}>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.id} className={column.className}>
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
          rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column) => (
                <TableCell key={column.id} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
              {rowActions && <TableCell className="text-right">{rowActions(row)}</TableCell>}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
    {pagination}
    </>
  );
}
