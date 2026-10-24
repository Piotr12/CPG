import type { CompletionView, MaterialSummary } from "@cpg/core";
import { COMPLETION_PAGE_SIZE } from "@cpg/core/validators/production-orders/production-completion.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { Badge } from "@cpg/ui/components/badge";
import { reversalStatusTone } from "../document-lifecycle/status-tone";
import { fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import { PageLinks } from "../layout/page-links";
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
    { id: "id", header: t.id, kind: "id", cell: (row) => row.id },
    { id: "date", header: t.date, kind: "date", priority: 2, cell: (row) => row.businessDate },
    {
      id: "output",
      header: labels.output,
      kind: "text",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.waste && <Badge variant="secondary">{t.waste}</Badge>}
          {shownQuantity(row.quantity)} {row.baseUnit}
          {row.reversal && <>
            <StatusBadge {...reversalStatusTone("reversed")}>{t.reversal.reversed}</StatusBadge>
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
      kind: "longText",
      header: t.lines,
      cell: (row) => (
        <ul className="flex flex-col gap-1">
          {row.lines.map((line) => (
            <li key={line.material}>
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
    },
    ...(reversible ? [{
      id: "actions",
      header: t.actions,
      kind: "actions" as const,
      cell: (row: CompletionView) => row.reversal === null && <CompletionReversalDialog context={reversible.context} order={reversible.order.id}
        completion={target(row, reversible.order)} today={today} existingHref={`${path}?completions=${page}`} labels={labels} />,
    }] : []),
  ];
  // The history doesn't count its completions: a full page means an older one may exist, so it
  // knows of one page past this one at most (its label shows only `{page}`).
  const pages = completions.length === COMPLETION_PAGE_SIZE ? page + 1 : page;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t.history}</h2>
      <DataTable
        label={t.history}
        columns={columns}
        rows={completions}
        rowKey={(row) => row.id}
        empty={page > 1 ? t.historyPastEnd : t.historyEmpty}
        pagination={<PageLinks page={page} pages={pages} labels={t} href={(target) => `${path}?completions=${target}`} />}
      />
    </section>
  );
}
