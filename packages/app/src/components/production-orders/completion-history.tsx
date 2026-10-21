import Link from "next/link";
import type { CompletionView, MaterialSummary } from "@cpg/core";
import { COMPLETION_PAGE_SIZE } from "@cpg/core/validators/production-orders/production-completion.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import { fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import { CompletionReversalDialog, type CompletionReversalTarget } from "./completion-reversal-dialog";
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
  /** The order a writable tenant may reverse completions of (E11-S03); without it the history is read-only. */
  reversible?: { context: TenantContext; order: { id: string; output: string; location: string; produced: string } };
}

/** The order's completions, newest first: output (or waste) and each material's expected, actual and variance (PRD-013/014/018). */
export function CompletionHistory({ completions, page, materials, labels, path, reversible }: Props) {
  const t = labels.completion;
  const name = (code: string) => `${code} ${materials.find(({ id }) => id === code)!.description}`;
  const today = new Date().toISOString().slice(0, 10);
  const target = (row: CompletionView, order: NonNullable<Props["reversible"]>["order"]): CompletionReversalTarget => {
    const used = row.lines.filter(({ actual }) => shownQuantity(actual) !== "0");
    return {
      id: row.id, businessDate: row.businessDate, output: fill(t.reversal.output, { quantity: shownQuantity(row.quantity), unit: row.baseUnit }),
      location: order.location, produced: shownQuantity(order.produced), quantity: shownQuantity(row.quantity), unit: row.baseUnit,
      legs: [
        ...(row.waste ? [] : [{ label: name(order.output), quantity: `-${shownQuantity(row.quantity)} ${row.baseUnit}` }]),
        ...used.map((line) => ({ label: name(line.material), quantity: `+${shownQuantity(line.actual)} ${line.baseUnit}` })),
      ],
    };
  };
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
          {row.reversal && <>
            <Badge variant="outline">{t.reversal.reversed}</Badge>
            <span className="basis-full text-xs text-muted-foreground wrap-anywhere">
              {fill(t.reversal.by, { date: row.reversal.businessDate, actor: row.reversal.actorUsername, reason: row.reversal.reason })}
            </span>
          </>}
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
    ...(reversible ? [{
      id: "actions",
      header: t.actions,
      cell: (row: CompletionView) => row.reversal === null && <CompletionReversalDialog context={reversible.context} order={reversible.order.id}
        completion={target(row, reversible.order)} today={today} existingHref={`${path}?completions=${page}`} labels={labels} />,
    }] : []),
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
        empty={page > 1 ? t.historyPastEnd : t.historyEmpty}
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
