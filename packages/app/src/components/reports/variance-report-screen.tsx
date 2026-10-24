import { CircleAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { Locale, MaterialSummary, NamedRecordView, VarianceReportRow, VarianceReportView } from "@cpg/core";
import { ORDER_STATES, type VarianceReportQuery } from "@cpg/core/validators/reports/variance-report.schema";
import { ErrorSummary } from "@cpg/ui/backend/feedback/error-summary";
import { StatusBadge } from "@cpg/ui/backend/feedback/status-badge";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import type { Messages } from "../../i18n/messages/en";
import { documentStatusTone } from "../document-lifecycle/status-tone";
import { fill, shownQuantity } from "../forms/form-labels";
import { PageLinks } from "../layout/page-links";
import { shownVariance } from "../production-orders/completion-history";

interface VarianceReportScreenProps {
  tenant: { code: string; name: string };
  /** One page of the report, or null when the query was refused and only the form shows. */
  report: VarianceReportView | null;
  /** The filter choices the page was read with, as the form should show them again. */
  selected: Partial<VarianceReportQuery>;
  /** Why the date range was refused, shown beside To. */
  rangeError?: string;
  /** The tenant's materials and locations, for the filters. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  locale: Locale;
  messages: Messages;
}

/**
 * The body of the Variance report page (E13-S02): filters, then one row per production order with
 * its target against what its counted completions produced, and each component's expected, actual,
 * variance and waste (PRD-013/014/015/018). Reversed completions are listed, not counted (REV-011,
 * REV-014). It writes nothing, so a read-only tenant shows it unchanged (TEN-018), and it shows no cost
 * or capacity figure (N01, N04).
 */
export function VarianceReportScreen({ tenant, report, selected, rangeError, materials, locations, locale, messages }: VarianceReportScreenProps) {
  const t = messages.varianceReport;
  const path = `/admin/${tenant.code}`;
  const inactive = (active: boolean) => (active ? "" : ` (${t.inactive})`);
  const amount = (quantity: string, unit: string) => `${shownQuantity(quantity)} ${unit}`;
  const figures = (row: VarianceReportRow) => (
    <div className="flex flex-col gap-1">
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-sm" data-report-output>
        <dt className="text-muted-foreground">{t.figures.target}</dt>
        <dd className="text-right tabular-nums">{amount(row.target, row.baseUnit)}</dd>
        <dt className="text-muted-foreground">{t.figures.produced}</dt>
        <dd className="text-right tabular-nums">{amount(row.produced, row.baseUnit)}</dd>
        <dt className="text-muted-foreground">{t.figures.outputVariance}</dt>
        <dd className="text-right tabular-nums">
          {row.outputVariance === null ? <span aria-label="none">—</span> : `${shownVariance(row.outputVariance)} ${row.baseUnit}`}
        </dd>
        <dt className="text-muted-foreground">{t.figures.completions}</dt>
        <dd className="text-right tabular-nums">{row.completions}</dd>
        <dt className="text-muted-foreground">{t.figures.wasteCompletions}</dt>
        <dd className="flex items-center justify-end gap-2 tabular-nums">
          {row.wasteCompletions}
          {/* Not a state in the tone map: a mark that the order needs a look, so warning, never danger. */}
          {row.wasteCompletions > 0 && (
            <StatusBadge tone="warning" icon={TriangleAlert}>
              {t.waste}
            </StatusBadge>
          )}
        </dd>
      </dl>
      {/* Its own line, not a value of Waste postings. */}
      {row.reversed.length > 0 && <p className="text-xs text-muted-foreground" data-report-reversed>{fill(t.reversed, { ids: row.reversed.join(", ") })}</p>}
    </div>
  );
  const extraBadge = (extra: boolean) =>
    extra && (
      <>
        {" "}
        <Badge variant="outline" className="ml-1">{t.extra}</Badge>
      </>
    );
  const nothingCounted = <span className="text-sm text-muted-foreground">{t.noComponents}</span>;
  const componentTable = (row: VarianceReportRow) =>
    row.components.length === 0 ? (
      nothingCounted
    ) : (
      <table className="w-full text-sm" aria-label={fill(t.componentsOf, { id: row.id })}>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="pb-1 pr-2 text-left font-medium">{t.component.material}</th>
            <th scope="col" className="pb-1 pr-2 text-right font-medium">{t.component.expected}</th>
            <th scope="col" className="pb-1 pr-2 text-right font-medium">{t.component.actual}</th>
            <th scope="col" className="pb-1 pr-2 text-right font-medium">{t.component.variance}</th>
            <th scope="col" className="pb-1 text-right font-medium">{t.component.waste}</th>
          </tr>
        </thead>
        <tbody>
          {row.components.map((component) => (
            <tr key={component.material} className="border-t" data-report-component={component.material}>
              <td className="py-1 pr-2 wrap-break-word">
                {`${component.material} ${component.description}`}
                {extraBadge(component.extra)}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums whitespace-nowrap">{amount(component.expected, component.baseUnit)}</td>
              <td className="py-1 pr-2 text-right tabular-nums whitespace-nowrap">{amount(component.actual, component.baseUnit)}</td>
              <td className="py-1 pr-2 text-right tabular-nums whitespace-nowrap">{`${shownVariance(component.variance)} ${component.baseUnit}`}</td>
              <td className="py-1 text-right tabular-nums whitespace-nowrap">{amount(component.waste, component.baseUnit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  /** The components on a phone: each one's name, then its four figures, so no column is squeezed (lesson 2026-10-21). */
  const stackedComponents = (row: VarianceReportRow) =>
    row.components.length === 0 ? (
      nothingCounted
    ) : (
      <ul className="flex flex-col gap-2">
        {row.components.map((component) => (
          <li key={component.material} className="border-t pt-2 text-sm" data-report-stacked={component.material}>
            <span className="wrap-break-word">
              {`${component.material} ${component.description}`}
              {extraBadge(component.extra)}
            </span>
            <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 text-xs">
              {(["expected", "actual", "variance", "waste"] as const).map((figure) => (
                <div key={figure} className="contents">
                  <dt className="text-muted-foreground">{t.component[figure]}</dt>
                  <dd className="text-right tabular-nums">
                    {figure === "variance" ? `${shownVariance(component.variance)} ${component.baseUnit}` : amount(component[figure], component.baseUnit)}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  const columns: DataTableColumn<VarianceReportRow>[] = [
    {
      id: "order",
      header: t.columns.order,
      kind: "longText",
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <Link href={`${path}/production-orders/${row.id}`} className="w-fit font-mono underline underline-offset-4" aria-label={fill(t.orderLink, { id: row.id })}>
            {row.id}
          </Link>
          <span className="text-xs text-muted-foreground">{`${row.output} — ${row.outputDescription}`}</span>
          <span className="text-xs text-muted-foreground">{`${row.location} — ${row.locationName}`}</span>
          <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <StatusBadge {...documentStatusTone(row.status)}>{t.statuses[row.status]}</StatusBadge>
            {fill(t.recipe, { bom: row.bom, revision: String(row.revision) })}
          </span>
          {/* Narrow screens: the output figures and the components move under the order, one column. */}
          <div className="mt-2 flex flex-col gap-3 md:hidden">
            {figures(row)}
            {stackedComponents(row)}
          </div>
        </div>
      ),
    },
    { id: "output", header: t.columns.output, kind: "quantity", priority: 2, className: "min-w-44", cell: figures },
    {
      id: "components",
      header: t.columns.components,
      kind: "longText",
      priority: 2,
      className: "min-w-72",
      cell: componentTable,
    },
  ];
  const filtered = (["material", "location", "status", "from", "to"] as const).some((key) => selected[key]);
  const query = (page: number) => {
    const params = new URLSearchParams();
    for (const key of ["material", "location", "status", "from", "to"] as const) if (selected[key]) params.set(key, selected[key]);
    params.set("page", String(page));
    return `${path}/reports/variance?${params}`;
  };

  return (
    <div lang={locale} className="min-w-0">
      <PageHeader
        title={fill(t.heading, { tenant: tenant.name })}
        description={fill(t.intro, { date: report?.asOf ?? new Date().toISOString().slice(0, 10) })}
      />
      <div className="flex min-w-0 flex-col gap-8">
        <form action={`${path}/reports/variance`} className="grid min-w-0 gap-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto_auto_auto] lg:items-end">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="variance-material">{t.material}</Label>
            <NativeSelect id="variance-material" name="material" defaultValue={selected.material ?? ""} className="w-full">
              <NativeSelectOption value="">{t.all}</NativeSelectOption>
              {materials.map((material) => (
                <NativeSelectOption key={material.id} value={material.id}>{`${material.id} — ${material.description}${inactive(material.active)}`}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="variance-location">{t.location}</Label>
            <NativeSelect id="variance-location" name="location" defaultValue={selected.location ?? ""} className="w-full">
              <NativeSelectOption value="">{t.all}</NativeSelectOption>
              {locations.map((location) => (
                <NativeSelectOption key={location.id} value={location.id}>{`${location.id} — ${location.name}${inactive(location.active)}`}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="variance-status">{t.status}</Label>
            <NativeSelect id="variance-status" name="status" defaultValue={selected.status ?? ""} className="w-full">
              <NativeSelectOption value="">{t.all}</NativeSelectOption>
              {ORDER_STATES.map((status) => (
                <NativeSelectOption key={status} value={status}>{t.statuses[status]}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="variance-from">{t.from}</Label>
            <Input id="variance-from" name="from" type="date" defaultValue={selected.from ?? ""} />
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="variance-to">{t.to}</Label>
            <Input id="variance-to" name="to" type="date" defaultValue={selected.to ?? ""} aria-invalid={rangeError ? true : undefined} aria-describedby={rangeError ? "variance-to-error" : undefined} />
          </div>
          <Button type="submit" variant="outline">{t.apply}</Button>
          {/* On its own row, so the fields stay aligned. */}
          {rangeError && (
            <ErrorSummary id="variance-to-error" className="flex gap-2 text-sm text-danger sm:col-span-3 lg:col-span-6">
              <span className="flex h-5 shrink-0 items-center">
                <CircleAlert aria-hidden="true" className="size-4" />
              </span>
              {rangeError}
            </ErrorSummary>
          )}
          {filtered && (
            <Link href={`${path}/reports/variance`} className="justify-self-start text-sm font-medium underline underline-offset-4 sm:col-span-3 lg:col-span-6">
              {t.clear}
            </Link>
          )}
        </form>
        {report && (
          <div className="flex min-w-0 flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {fill(t.rows, { count: String(report.total) })}
              {(selected.from || selected.to) && ` ${t.partial}`}
            </p>
            <DataTable
              label={t.label}
              columns={columns}
              rows={report.rows}
              rowKey={(row) => row.id}
              empty={t.empty}
              pagination={<PageLinks page={report.page} pages={Math.ceil(report.total / report.pageSize)} href={query} labels={t} />}
            />
          </div>
        )}
      </div>
    </div>
  );
}
