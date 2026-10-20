import Link from "next/link";
import type { CompletionView, MaterialSummary } from "@cpg/core";
import { COMPLETION_PAGE_SIZE } from "@cpg/core/validators/production-orders/production-completion.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import { fill, shownQuantity } from "../forms/form-labels";
import type { ProductionLabels } from "./labels";

/** A signed variance as screens show it: `+3`, `-2`, or `0` for none. */
export function shownVariance(variance: string): string {
  const shown = shownQuantity(variance);
  return variance.startsWith("-") || shown === "0" ? shown : `+${shown}`;
}

interface Props {
  completions: CompletionView[];
  page: number;
  materials: MaterialSummary[];
  labels: ProductionLabels;
  /** The order's page, which the history's pages link to (`?completions=N`). */
  path: string;
}

/** The order's completions, newest first: output (or waste) and each material's expected, actual and variance (PRD-013/014/018). */
export function CompletionHistory({ completions, page, materials, labels, path }: Props) {
  const t = labels.completion;
  const name = (code: string) => `${code} ${materials.find(({ id }) => id === code)!.description}`;
  const columns: DataTableColumn<CompletionView>[] = [
    { id: "id", header: t.id, cell: (row) => <span className="font-mono">{row.id}</span> },
    { id: "date", header: t.date, cell: (row) => row.businessDate, className: "hidden sm:table-cell" },
    {
      id: "output",
      header: labels.output,
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.waste && <Badge variant="destructive">{t.waste}</Badge>}
          {shownQuantity(row.quantity)} {row.baseUnit}
        </span>
      ),
      className: "whitespace-normal",
    },
    {
      id: "lines",
      header: t.lines,
      cell: (row) => (
        <ul className="flex flex-col gap-1">
          {row.lines.map((line) => (
            <li key={line.material} className="break-words">
              {fill(t.line, {
                material: name(line.material),
                expected: shownQuantity(line.expected),
                actual: shownQuantity(line.actual),
                unit: line.baseUnit,
                variance: shownVariance(line.variance),
              })}
              {line.extra && (
                <Badge variant="outline" className="ml-2">
                  {t.extra}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      ),
      className: "min-w-48 whitespace-normal",
    },
  ];
  const older = completions.length === COMPLETION_PAGE_SIZE;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.history}</h2>
      <DataTable
        label={t.history}
        columns={columns}
        rows={completions}
        rowKey={(row) => row.id}
        empty={t.historyEmpty}
        pagination={
          (page > 1 || older) && (
            <nav aria-label={t.pagination} className="flex flex-wrap items-center justify-end gap-3">
              {page > 1 && (
                <Button asChild variant="outline">
                  <Link href={`${path}?completions=${page - 1}`}>{t.previous}</Link>
                </Button>
              )}
              <span className="text-sm">{fill(t.page, { page: String(page) })}</span>
              {older && (
                <Button asChild variant="outline">
                  <Link href={`${path}?completions=${page + 1}`}>{t.next}</Link>
                </Button>
              )}
            </nav>
          )
        }
      />
    </section>
  );
}
