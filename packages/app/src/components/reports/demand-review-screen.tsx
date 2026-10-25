import Link from "next/link";
import { MAX_DEMAND_OFFSET, type DemandReviewView, type Locale, type NamedRecordView, type StatisticalFactorView } from "@cpg/core";
import { ChartLegend } from "@cpg/ui/backend/charts/chart-legend";
import { StackedColumnChart } from "@cpg/ui/backend/charts/stacked-column-chart";
import { Callout } from "@cpg/ui/backend/feedback/callout";
import { EmptyState } from "@cpg/ui/backend/feedback/empty-state";
import { ErrorSummary } from "@cpg/ui/backend/feedback/error-summary";
import { PageHeader } from "@cpg/ui/backend/page-header";
import { plural } from "@cpg/ui/lib/plural";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import type { Messages } from "../../i18n/messages/en";
import { fill } from "../forms/form-labels";
import { DemandReviewFilters } from "./demand-review-filters";
import { DemandReviewGrid } from "./demand-review-grid";
import { bucketLabels, chartBuckets, gridLine, headline } from "./demand-review-view";

interface DemandReviewScreenProps {
  tenant: { code: string; name: string };
  view: DemandReviewView;
  /** The tenant's finished products with their SU factors, and its locations, for the filters and the row names. */
  products: StatisticalFactorView[];
  locations: NamedRecordView[];
  /** The address chose a product that isn't finished: the report was read without the product filter. */
  refused?: boolean;
  locale: Locale;
  messages: Messages;
}

/** The address of the report with `view`'s filters, moved to `offset`. */
function reviewHref(path: string, view: DemandReviewView, offset: number): string {
  const params = new URLSearchParams({ bucket: view.bucket });
  for (const material of view.materials) params.append("material", material);
  for (const location of view.locations) params.append("location", location);
  params.set("unit", view.unit);
  if (offset !== 0) params.set("offset", String(offset));
  return `${path}?${params}`;
}

/**
 * The body of the Demand review page (#240): what shipped and what is still to ship per day, week or
 * month, as a stacked-column chart over a products × buckets grid, in a report unit (#239). It writes
 * nothing, so a read-only tenant shows it unchanged.
 */
export function DemandReviewScreen({ tenant, view, products, locations, refused, locale, messages }: DemandReviewScreenProps) {
  const t = messages.demandReview;
  const path = `/admin/${tenant.code}/reports/demand-review`;
  const inactive = (active: boolean) => (active ? "" : ` (${t.inactive})`);
  const productName = new Map(products.map(({ id, description, active }) => [id, `${id} — ${description}${inactive(active)}`]));
  const locationName = new Map(locations.map(({ id, name, active }) => [id, `${id} — ${name}${inactive(active)}`]));
  const byLocation = view.materials.length === 1;
  const names = byLocation ? locationName : productName;
  const chosen = view.materials.length || products.length;
  const allExcluded = view.excluded.length > 0 && view.excluded.length === chosen;
  const statisticalUnits = <Link href={`/admin/${tenant.code}/statistical-units`} className="text-sm font-medium underline underline-offset-4">{t.excludedLink}</Link>;
  const bucketName = t.grid.bucketNames[view.bucket];
  const title = fill(t.chartTitle[view.bucket], { unit: view.unit });
  const figures = headline(view, locale);
  const columns = bucketLabels(view, locale, t);
  const lines = view.rows.map(({ key, figures: row }) => gridLine(view, key, names.get(key) ?? key, row, locale));

  return (
    <div lang={locale} className="min-w-0">
      <PageHeader title={fill(t.heading, { tenant: tenant.name })} description={fill(t.intro[view.bucket], { date: view.today })} />
      <div className="flex min-w-0 flex-col gap-6">
        {refused && <ErrorSummary id="review-errors">{t.finishedOnly}</ErrorSummary>}
        <Card>
          <CardContent>
            <DemandReviewFilters action={path} view={view} products={products} locations={locations} locale={locale} labels={t} />
          </CardContent>
        </Card>
        {products.length === 0 ? (
          <EmptyState title={t.noProducts}>
            <Link href={`/admin/${tenant.code}/materials`} className="text-sm font-medium underline underline-offset-4">{t.noProductsLink}</Link>
          </EmptyState>
        ) : allExcluded ? (
          <EmptyState title={t.allExcluded}>{statisticalUnits}</EmptyState>
        ) : (
          <>
            {view.excluded.length > 0 && (
              <Callout tone="warning" actions={statisticalUnits}>
                {fill(t.excluded, { products: view.excluded.map(({ material }) => productName.get(material) ?? material).join(", ") })}
              </Callout>
            )}
            <Card>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription data-headline>
                  {fill(view.offset === 0 ? t.headline[view.bucket] : t.headlineMoved, { ...figures, unit: view.unit })}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ChartLegend
                  items={[
                    { label: t.series.shipped, series: 1 },
                    { label: t.legendOpen, series: 2 },
                    { label: t.series.forecast, series: 3 },
                    { label: t.series.ordered, series: "line" },
                  ]}
                />
                <StackedColumnChart
                  buckets={chartBuckets(view, locale, t)}
                  todayFraction={view.buckets.find(({ current }) => current)?.todayFraction ?? 0}
                  unit={view.unit}
                  locale={locale}
                  labels={{
                    summary: fill(t.summary, { title }),
                    series: [t.series.shipped, t.series.open, t.series.forecast],
                    line: t.series.ordered,
                    past: t.past,
                    ahead: t.ahead,
                    empty: t.empty,
                  }}
                />
                <nav className="flex justify-end gap-4 text-sm font-medium">
                  {view.offset > -MAX_DEMAND_OFFSET && (
                    <Link href={reviewHref(path, view, view.offset - 1)} aria-label={t.earlierLabel} className="underline underline-offset-4">{t.earlier}</Link>
                  )}
                  {view.offset < MAX_DEMAND_OFFSET && (
                    <Link href={reviewHref(path, view, view.offset + 1)} aria-label={t.laterLabel} className="underline underline-offset-4">{t.later}</Link>
                  )}
                </nav>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-2">
                <DemandReviewGrid
                  buckets={view.buckets.map((bucket, index) => ({ key: bucket.start, ...columns[index], past: bucket.past, current: bucket.current }))}
                  lines={lines}
                  total={gridLine(view, "total", "", view.total, locale)}
                  labels={{
                    label: fill(t.grid.label, { bucket: bucketName }),
                    caption: plural(locale, lines.length, byLocation ? t.grid.captionLocations : t.grid.captionProducts)
                      .replaceAll("{unit}", view.unit)
                      .replaceAll("{bucket}", bucketName),
                    rows: byLocation ? t.grid.location : t.grid.product,
                    total: t.grid.total,
                    totalRow: fill(t.grid.totalRow, { unit: view.unit }),
                    details: t.grid.details,
                    toggle: t.grid.toggle,
                    empty: t.grid.empty,
                  }}
                />
                {view.omittedRows > 0 && <p className="text-sm text-muted-foreground" data-omitted>{plural(locale, view.omittedRows, t.grid.omitted)}</p>}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
