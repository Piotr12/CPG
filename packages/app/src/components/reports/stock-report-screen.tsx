import Link from "next/link";
import type { Locale, MaterialSummary, NamedRecordView, StockReportRow, StockReportView } from "@cpg/core";
import type { StockReportQuery } from "@cpg/core/validators/reports/stock-report.schema";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { FilterAutocomplete } from "@cpg/ui/backend/forms/filter-autocomplete";
import { Button } from "@cpg/ui/components/button";
import { Checkbox } from "@cpg/ui/components/checkbox";
import { Label } from "@cpg/ui/components/label";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity } from "../forms/form-labels";
import { PageLinks } from "../layout/page-links";
import { materialFilterOptions, materialPicker } from "../materials/material-picker";
import { recordOptions, recordPicker } from "../named-records/record-picker";

interface StockReportScreenProps {
  tenant: { code: string; name: string };
  /** One page of the report, and the filter choices it was read with. */
  report: StockReportView;
  selected: StockReportQuery;
  /** The tenant's materials and locations, for the filters. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  locale: Locale;
  messages: Messages;
}

/**
 * The body of the Stock report page (E13-S01): filters, then physical on-hand and in transit out
 * and in per material and location, apart, each row opening that pair's ledger on the Stock page
 * (UX-017, INV-012). It writes nothing, so a read-only tenant shows it unchanged (TEN-018).
 */
export function StockReportScreen({ tenant, report, selected, materials, locations, locale, messages }: StockReportScreenProps) {
  const t = messages.stockReport;
  const pickers = { material: materialPicker(messages.lists), location: recordPicker(messages.lists, "location") };
  const path = `/admin/${tenant.code}`;
  const amount = (quantity: string, row: StockReportRow) => `${shownQuantity(quantity)} ${row.baseUnit}`;
  const inactive = (active: boolean) => (active ? "" : ` (${t.inactive})`);
  const material = (row: StockReportRow) => `${row.material} — ${row.materialDescription}${inactive(row.materialActive)}`;
  const location = (row: StockReportRow) => `${row.location} — ${row.locationName}${inactive(row.locationActive)}`;
  // Narrow screens: the location moves under the material, and the three figures stack in one cell.
  const columns: DataTableColumn<StockReportRow>[] = [
    // `text`, not `longText`: the sticky first column stays narrow enough on a phone for the stacked figures beside it.
    { id: "material", header: t.columns.material, kind: "text", className: "whitespace-normal wrap-break-word", cell: (row) => <div className="flex flex-col gap-1">
      <span>{material(row)}</span><span className="text-xs text-muted-foreground md:hidden">{location(row)}</span>
    </div> },
    { id: "location", header: t.columns.location, kind: "longText", priority: 2, cell: location },
    { id: "quantity", header: t.columns.quantity, kind: "quantity", priority: 2, cell: (row) => <span data-report-on-hand>{amount(row.quantity, row)}</span> },
    { id: "inTransitFrom", header: t.columns.inTransitFrom, kind: "quantity", priority: 2, cell: (row) => <span data-report-transit-from>{amount(row.inTransitFrom, row)}</span> },
    { id: "inTransitTo", header: t.columns.inTransitTo, kind: "quantity", priority: 2, cell: (row) => <span data-report-transit-to>{amount(row.inTransitTo, row)}</span> },
    // The narrow-screen stand-in for the three quantity columns above, so it hides where they show.
    { id: "figures", header: t.columns.figures, kind: "quantity", className: "md:hidden", cell: (row) => <dl className="grid grid-cols-[auto_auto] gap-x-2 text-xs">
      {(["quantity", "inTransitFrom", "inTransitTo"] as const).map((figure) => <div key={figure} className="contents">
        <dt className="text-left text-muted-foreground">{t.columns[figure]}</dt><dd className="text-right tabular-nums">{amount(row[figure], row)}</dd>
      </div>)}
    </dl> },
  ];
  const filtered = Boolean(selected.material || selected.location || selected.includeZero);
  const query = (page: number) => {
    const params = new URLSearchParams();
    if (selected.material) params.set("material", selected.material);
    if (selected.location) params.set("location", selected.location);
    if (selected.includeZero) params.set("includeZero", "true");
    params.set("page", String(page));
    return `${path}/reports/stock?${params}`;
  };

  return (
    <div lang={locale} className="min-w-0">
      <PageHeader title={fill(t.heading, { tenant: tenant.name })} description={fill(t.intro, { date: report.asOf })} />
      <div className="flex min-w-0 flex-col gap-8">
        <form action={`${path}/reports/stock`} className="grid min-w-0 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="grid min-w-0 gap-2">
            <Label id="report-material-label" htmlFor="report-material">{t.material}</Label>
            <FilterAutocomplete
              key={selected.material ?? ""}
              id="report-material"
              name="material"
              options={materialFilterOptions(materials, t.inactive)}
              defaultValue={selected.material ?? ""}
              emptyLabel={t.all}
              labels={pickers.material.labels}
              locale={locale}
              aria-labelledby="report-material-label"
            />
          </div>
          <div className="grid min-w-0 gap-2">
            <Label id="report-location-label" htmlFor="report-location">{t.location}</Label>
            <FilterAutocomplete
              key={selected.location ?? ""}
              id="report-location"
              name="location"
              options={recordOptions(locations, t.inactive)}
              defaultValue={selected.location ?? ""}
              emptyLabel={t.all}
              labels={pickers.location.labels}
              locale={locale}
              aria-labelledby="report-location-label"
            />
          </div>
          <Button type="submit" variant="outline">{t.apply}</Button>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-3">
            <div className="flex items-center gap-2">
              <Checkbox id="report-zero" name="includeZero" value="true" defaultChecked={selected.includeZero} />
              <Label htmlFor="report-zero">{t.includeZero}</Label>
            </div>
            {filtered && <Link href={`${path}/reports/stock`} className="text-sm font-medium underline underline-offset-4">{t.clear}</Link>}
          </div>
        </form>
        <div className="flex min-w-0 flex-col gap-4">
          <p className="text-sm text-muted-foreground">{fill(t.rows, { count: String(report.total) })}</p>
          <DataTable
            label={t.label}
            columns={columns}
            rows={report.rows}
            rowKey={(row) => `${row.material}/${row.location}`}
            rowActions={(row) => (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`${path}/stock?${new URLSearchParams({ material: row.material, location: row.location })}`}
                  aria-label={fill(t.ledgerOf, { material: `${row.material} ${row.materialDescription}`, location: `${row.location} ${row.locationName}` })}
                >
                  {t.ledger}
                </Link>
              </Button>
            )}
            actionsLabel={t.actions}
            empty={t.empty}
            pagination={<PageLinks page={report.page} pages={Math.ceil(report.total / report.pageSize)} href={query} labels={t} />}
          />
        </div>
      </div>
    </div>
  );
}
