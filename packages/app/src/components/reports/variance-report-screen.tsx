import Link from "next/link";
import type { Locale, MaterialSummary, NamedRecordView, VarianceReportRow, VarianceReportView } from "@cpg/core";
import { ORDER_STATES, type VarianceReportQuery } from "@cpg/core/validators/reports/variance-report.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import type { Messages } from "../../i18n/messages/en";
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
    <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-sm" data-report-output>
      <dt className="text-muted-foreground">{t.figures.target}</dt>
      <dd className="text-right font-mono">{amount(row.target, row.baseUnit)}</dd>
      <dt className="text-muted-foreground">{t.figures.produced}</dt>
      <dd className="text-right font-mono">{amount(row.produced, row.baseUnit)}</dd>
      <dt className="text-muted-foreground">{t.figures.outputVariance}</dt>
      <dd className="text-right font-mono">{row.outputVariance === null ? "—" : `${shownVariance(row.outputVariance)} ${row.baseUnit}`}</dd>
      <dt className="text-muted-foreground">{t.figures.completions}</dt>
      <dd className="text-right font-mono">{row.completions}</dd>
      <dt className="text-muted-foreground">{t.figures.wasteCompletions}</dt>
      <dd className="flex items-center justify-end gap-2 font-mono">
        {row.wasteCompletions}
        {row.wasteCompletions > 0 && <Badge variant="destructive">{t.waste}</Badge>}
      </dd>
      {row.reversed.length > 0 && <dd className="col-span-2 text-xs text-muted-foreground" data-report-reversed>{fill(t.reversed, { ids: row.reversed.join(", ") })}</dd>}
    </dl>
  );
  const columns: DataTableColumn<VarianceReportRow>[] = [
    {
      id: "order",
      header: t.columns.order,
      className: "min-w-40 whitespace-normal",
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <Link href={`${path}/production-orders/${row.id}`} className="font-mono underline underline-offset-4" aria-label={fill(t.orderLink, { id: row.id })}>
            {row.id}
          </Link>
          <span className="text-xs text-muted-foreground">{`${row.output} — ${row.outputDescription}`}</span>
          <span className="text-xs text-muted-foreground">{`${row.location} — ${row.locationName}`}</span>
          <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Badge variant="outline">{t.statuses[row.status]}</Badge>
            {fill(t.recipe, { bom: row.bom, revision: String(row.revision) })}
          </span>
          {/* Narrow screens: the output figures move under the order. */}
          <div className="mt-2 md:hidden">{figures(row)}</div>
        </div>
      ),
    },
    { id: "output", header: t.columns.output, className: "hidden min-w-44 md:table-cell", cell: figures },
    {
      id: "components",
      header: t.columns.components,
      className: "min-w-72 whitespace-normal",
      cell: (row) =>
        row.components.length === 0 ? (
          <span className="text-sm text-muted-foreground">{t.noComponents}</span>
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
                  <td className="py-1 pr-2 wrap-anywhere">
                    {`${component.material} ${component.description}`}
                    {component.extra && <Badge variant="outline" className="ml-2">{t.extra}</Badge>}
                  </td>
                  <td className="py-1 pr-2 text-right font-mono whitespace-nowrap">{amount(component.expected, component.baseUnit)}</td>
                  <td className="py-1 pr-2 text-right font-mono whitespace-nowrap">{amount(component.actual, component.baseUnit)}</td>
                  <td className="py-1 pr-2 text-right font-mono whitespace-nowrap">{`${shownVariance(component.variance)} ${component.baseUnit}`}</td>
                  <td className="py-1 text-right font-mono whitespace-nowrap">{amount(component.waste, component.baseUnit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ),
    },
  ];
  const query = (page: number) => {
    const params = new URLSearchParams();
    for (const key of ["material", "location", "status", "from", "to"] as const) if (selected[key]) params.set(key, selected[key]);
    params.set("page", String(page));
    return `${path}/reports/variance?${params}`;
  };

  return (
    <div lang={locale} className="flex min-w-0 flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{fill(t.heading, { tenant: tenant.name })}</h1>
      <p className="text-sm text-muted-foreground">{fill(t.intro, { date: report?.asOf ?? new Date().toISOString().slice(0, 10) })}</p>
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
          {rangeError && <p id="variance-to-error" role="alert" className="text-sm text-destructive">{rangeError}</p>}
        </div>
        <Button type="submit" variant="outline">{t.apply}</Button>
      </form>
      {report && (
        <>
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
        </>
      )}
    </div>
  );
}
