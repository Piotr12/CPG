import Link from "next/link";
import type { Locale, MaterialSummary, MrpBucketView, MrpLatestView, MrpPlanView, NamedRecordView } from "@cpg/core";
import type { MrpReportPageQuery } from "@cpg/core/validators/mrp/mrp-latest.schema";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Button } from "@cpg/ui/components/button";
import { cn } from "@cpg/ui/lib/utils";
import type { Messages } from "../../i18n/messages/en";
import { fill, localeQuantity } from "../forms/form-labels";
import { PageLinks } from "../layout/page-links";
import { MaterialLocationFilters } from "../reports/material-location-filters";

interface MrpReportProps {
  tenant: { code: string };
  /** One page of the latest run's plans, read with `selected`. */
  report: MrpLatestView;
  selected: MrpReportPageQuery;
  /** The tenant's materials and locations, for the filters. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  locale: Locale;
  messages: Messages;
}

/**
 * The figures a day shows beside its date (spec Q5), in the order of PRD §07: demand, supply, balances,
 * shortage. #277 added dependent demand and the two transfer legs, so every term of the balance is a column.
 */
const DAY_FIGURES = [
  "firmDemand",
  "forecastDemand",
  "dependentDemand",
  "transferOut",
  "safetyTarget",
  "tentativeSupply",
  "dependableSupply",
  "transferIn",
  "projectedBefore",
  "projectedAfter",
  "shortage",
] as const;

/** A stored figure below zero: a projected balance short of stock. */
const negative = (quantity: string) => quantity.startsWith("-");
/** A day with a shortage, as stored: anything but zero. */
const short = (day: MrpBucketView) => day.shortage !== "0.000000";

/**
 * The last MRP report (E18-S01, PRD §07) under the run card: material and location filters, the
 * run's planned pairs, 25 a page, each with its lowest projected balance and first shortage, and,
 * once the filters leave one pair, that pair's 90 days. Figures are in the material's base unit, in
 * the reader's locale. It writes nothing, so a read-only tenant shows it unchanged (TEN-018).
 */
export function MrpReport({ tenant, report, selected, materials, locations, locale, messages }: MrpReportProps) {
  const t = messages.mrp.report;
  const path = `/admin/${tenant.code}/mrp`;
  const amount = (quantity: string, plan: MrpPlanView) => `${localeQuantity(quantity, locale)} ${plan.baseUnit}`;
  const inactive = (active: boolean) => (active ? "" : ` (${t.inactive})`);
  const material = (plan: MrpPlanView) => `${plan.material} — ${plan.materialDescription}${inactive(plan.materialActive)}`;
  const location = (plan: MrpPlanView) => `${plan.location} — ${plan.locationName}${inactive(plan.locationActive)}`;
  const columns: DataTableColumn<MrpPlanView>[] = [
    { id: "material", header: t.columns.material, kind: "text", className: "whitespace-normal wrap-break-word", cell: (plan) => <div className="flex flex-col gap-1">
      <span>{material(plan)}</span><span className="text-xs text-muted-foreground md:hidden">{location(plan)}</span>
    </div> },
    { id: "location", header: t.columns.location, kind: "longText", priority: 2, cell: location },
    { id: "lowest", header: t.columns.lowest, kind: "quantity", cell: (plan) => (
      <span data-mrp-lowest className={cn(negative(plan.lowestProjectedBefore) && "font-medium text-danger")}>{amount(plan.lowestProjectedBefore, plan)}</span>
    ) },
    { id: "firstShortage", header: t.columns.firstShortage, kind: "date", cell: (plan) => <span data-mrp-first-shortage>{plan.firstShortageDate ?? t.noShortage}</span> },
  ];
  const filtered = Boolean(selected.material || selected.location);
  const query = (page: number) => `${path}?${new URLSearchParams({ ...(selected.material && { material: selected.material }), ...(selected.location && { location: selected.location }), page: String(page) })}`;
  const only = report.total === 1 ? report.plans[0] : undefined;

  return (
    <section aria-labelledby="mrp-report-heading" className="mt-8 flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="mrp-report-heading" className="text-lg font-semibold">{t.heading}</h2>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
      </div>
      <MaterialLocationFilters action={path} selected={selected} filtered={filtered} materials={materials} locations={locations} labels={t} lists={messages.lists} locale={locale} />
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-sm text-muted-foreground" data-mrp-pair-count>{fill(t.count, { count: String(report.total) })}</p>
        <DataTable
          label={t.label}
          columns={columns}
          rows={report.plans}
          rowKey={(plan) => `${plan.material}/${plan.location}`}
          rowTone={(plan) => (plan.firstShortageDate ? "danger" : undefined)}
          rowActions={(plan) => (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`${path}?${new URLSearchParams({ material: plan.material, location: plan.location })}`}
                aria-label={fill(t.daysOf, { material: `${plan.material} ${plan.materialDescription}`, location: `${plan.location} ${plan.locationName}` })}
              >
                {t.days}
              </Link>
            </Button>
          )}
          actionsLabel={t.actions}
          empty={filtered ? t.empty : t.emptyRun}
          pagination={<PageLinks page={report.page} pages={Math.ceil(report.total / report.pageSize)} href={query} labels={t} />}
        />
      </div>
      {only && <PlanDays plan={only} locale={locale} labels={t} />}
    </section>
  );
}

/** One pair's 90 days, today first, every figure in view at any width: the table scrolls sideways. */
function PlanDays({ plan, locale, labels: t }: { plan: MrpPlanView; locale: Locale; labels: Messages["mrp"]["report"] }) {
  const figure = (key: (typeof DAY_FIGURES)[number]): DataTableColumn<MrpBucketView> => ({
    id: key,
    header: t.figures[key],
    kind: "quantity",
    // Headers like "Projected before proposals" wrap; past what fits beside the menu, the table scrolls in its own region.
    className: "whitespace-normal",
    cell: (day) => <span data-mrp-figure={key} className={cn(negative(day[key]) && "font-medium text-danger")}>{localeQuantity(day[key], locale)}</span>,
  });
  const columns: DataTableColumn<MrpBucketView>[] = [
    { id: "date", header: t.figures.date, kind: "date", cell: (day) => <span data-mrp-date>{day.date}</span> },
    ...DAY_FIGURES.map(figure),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{fill(t.plan, { material: `${plan.material} ${plan.materialDescription}`, location: `${plan.location} ${plan.locationName}` })}</h3>
        <p className="text-sm text-muted-foreground">{fill(t.planIntro, { unit: plan.baseUnit })}</p>
      </div>
      <DataTable label={t.planLabel} columns={columns} rows={plan.buckets} rowKey={(day) => day.date} rowTone={(day) => (short(day) ? "danger" : undefined)} empty={t.empty} />
    </div>
  );
}
