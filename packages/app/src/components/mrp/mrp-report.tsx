import Link from "next/link";
import type { Locale, MaterialSummary, MrpAcceptanceView, MrpBucketView, MrpLatestView, MrpPlanView, MrpWeekView, NamedRecordView, Result } from "@cpg/core";
import type { MrpReportPageQuery } from "@cpg/core/validators/mrp/mrp-latest.schema";
import { SegmentedControl } from "@cpg/ui/backend/forms/segmented-control";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Button } from "@cpg/ui/components/button";
import { Label } from "@cpg/ui/components/label";
import { cn } from "@cpg/ui/lib/utils";
import type { Messages } from "../../i18n/messages/en";
import { fill, localeQuantity } from "../forms/form-labels";
import { PageLinks } from "../layout/page-links";
import { MaterialLocationFilters } from "../reports/material-location-filters";
import { materialsByCode } from "./mrp-bom-rejections";
import { MrpExplanations } from "./mrp-explanations";
import { MrpMarks, shortDate } from "./mrp-marks";
import { MrpProposals } from "./mrp-proposals";
import { MrpShortages, shortagesByDate } from "./mrp-shortages";

interface MrpReportProps {
  tenant: { code: string };
  /** One page of the latest run's plans, read with `selected`. */
  report: MrpLatestView;
  selected: MrpReportPageQuery;
  /** The tenant's materials and locations, for the filters. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  /** The server's UTC date, for whether the run's proposals can still be accepted (E19-S01). */
  today: string;
  /** Accepts a proposal: the page's bound server action, or absent on a read-only tenant. */
  accept?: (raw: { run: string; proposal: string }) => Promise<Result<MrpAcceptanceView>>;
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
  // Apart from dependable supply, never in a balance (E17-S03, E18-S03 spec Q6, MRP-051).
  "atRiskSupply",
  "transferIn",
  "projectedBefore",
  "projectedAfter",
  "shortage",
] as const;

/**
 * The figures pinned to the table's right edge from `lg` up (#311): the balance and the shortage, in view
 * with the date however many figures scroll between them.
 */
const PINNED_DAY_FIGURES: ReadonlySet<(typeof DAY_FIGURES)[number]> = new Set(["projectedBefore", "shortage"]);

/** The figures a week shows (E18-S02): the day table's, with the shortage replaced by the weakest day's two. */
const WEEK_FIGURES = [
  "firmDemand",
  "forecastDemand",
  "dependentDemand",
  "transferOut",
  "safetyTarget",
  "tentativeSupply",
  "dependableSupply",
  "atRiskSupply",
  "transferIn",
  "projectedBefore",
  "projectedAfter",
] as const;

/** A stored figure below zero: a projected balance short of stock. */
const negative = (quantity: string) => quantity.startsWith("-");
/** A day with a shortage, as stored: anything but zero. */
const short = (day: MrpBucketView) => day.shortage !== "0.000000";

/**
 * The last MRP report (E18-S01, PRD §07) under the run card: material and location filters, the
 * run's planned pairs, 25 a page, each with its lowest projected balance and first shortage, and,
 * once the filters leave one pair, that pair's proposals (with Accept, E19-S01) and its 90 days, or its
 * weeks in the Week view (E18-S02), each with its warnings, and last the Explanations of the page's pairs
 * (E18-S03). Figures are in the material's base unit, in
 * the reader's locale. Only Accept writes, so a read-only tenant shows the report without it (TEN-018).
 */
export function MrpReport({ tenant, report, selected, materials, locations, today, accept, locale, messages }: MrpReportProps) {
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
    { id: "proposals", header: t.columns.proposals, kind: "quantity", priority: 2, cell: (plan) => <span data-mrp-proposal-count>{plan.proposals.length}</span> },
  ];
  const filtered = Boolean(selected.material || selected.location);
  const weekly = selected.bucket === "week";
  // The view travels with every link, and the default Day view stays out of URLs (spec Q9).
  const view: Record<string, string> = weekly ? { bucket: "week" } : {};
  const query = (page: number) =>
    `${path}?${new URLSearchParams({ ...(selected.material && { material: selected.material }), ...(selected.location && { location: selected.location }), ...view, page: String(page) })}`;
  const only = report.total === 1 ? report.plans[0] : undefined;
  const byCode = materialsByCode(materials);

  return (
    <section aria-labelledby="mrp-report-heading" className="mt-8 flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="mrp-report-heading" className="text-lg font-semibold">{t.heading}</h2>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
      </div>
      <MaterialLocationFilters action={path} selected={selected} filtered={filtered || weekly} materials={materials} locations={locations} labels={t} lists={messages.lists} locale={locale}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Label id="mrp-report-view-label">{t.view}</Label>
          <SegmentedControl
            key={selected.bucket}
            name="bucket"
            options={(["day", "week"] as const).map((value) => ({ value, label: t.buckets[value] }))}
            defaultValue={selected.bucket}
            aria-labelledby="mrp-report-view-label"
          />
          <span className="text-sm text-muted-foreground">{t.viewHint}</span>
        </div>
      </MaterialLocationFilters>
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
                href={`${path}?${new URLSearchParams({ material: plan.material, location: plan.location, ...view })}`}
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
      {only && <MrpProposals tenant={tenant} run={report.run} plan={only} today={today} materials={byCode} accept={accept} locale={locale} messages={messages} />}
      {only && (weekly && only.weeks ? <PlanWeeks plan={only} weeks={only.weeks} locale={locale} labels={t} /> : <PlanDays plan={only} locale={locale} labels={t} />)}
      {/* Last, so every heading and table before it keeps its place (spec Q4, lesson 2026-11-01). */}
      {report.plans.length > 0 && (
        <MrpExplanations tenant={tenant} plans={report.plans} materials={byCode} locations={locations} view={view} locale={locale} messages={messages} />
      )}
    </section>
  );
}

/**
 * The open supply the plan's documents bring beyond its need (E19-S02 spec Q3), in the day and week views
 * alike: stated, never acted on, since MRP edits no document (R10). Nothing when there is none.
 */
function PlanExcess({ plan, locale, labels: t }: { plan: MrpPlanView; locale: Locale; labels: Messages["mrp"]["report"] }) {
  if (plan.excess === "0.000000") return null;
  return <p className="text-sm text-muted-foreground" data-mrp-excess>{fill(t.excess, { quantity: localeQuantity(plan.excess, locale), unit: plan.baseUnit })}</p>;
}

/**
 * One pair's 90 days, today first, each with its warnings and, last, its requirements left short after proposals, in
 * priority order (#380). The table scrolls sideways in its own region; from `lg` up the balance and the shortage stay
 * pinned at its right edge while the other figures scroll (#311).
 */
function PlanDays({ plan, locale, labels: t }: { plan: MrpPlanView; locale: Locale; labels: Messages["mrp"]["report"] }) {
  const figure = (key: (typeof DAY_FIGURES)[number]): DataTableColumn<MrpBucketView> => ({
    id: key,
    header: t.figures[key],
    kind: "quantity",
    // Headers like "Projected before proposals" wrap; past what fits beside the menu, the table scrolls in its own region.
    className: "whitespace-normal",
    pin: PINNED_DAY_FIGURES.has(key) ? "end" : undefined,
    cell: (day) => <span data-mrp-figure={key} className={cn(negative(day[key]) && "font-medium text-danger")}>{localeQuantity(day[key], locale)}</span>,
  });
  // Grouped once, not filtered once per day (#391).
  const shortages = shortagesByDate(plan.shortages);
  const columns: DataTableColumn<MrpBucketView>[] = [
    { id: "date", header: t.figures.date, kind: "date", cell: (day) => <span data-mrp-date>{day.date}</span> },
    ...DAY_FIGURES.map(figure),
    // Last, so the columns existing readers count keep their places (lesson 2026-11-01).
    { id: "warnings", header: t.warnings, kind: "text", className: "whitespace-normal", cell: (day) => (
      <MrpMarks marks={plan.marks.filter(({ date }) => date === day.date)} unit={plan.baseUnit} locale={locale} labels={t.marks} />
    ) },
    // After Warnings, so every column before it keeps its place (#380 spec Q5, lesson 2026-11-01).
    // Wide enough that an entry reads on a line or two; the table scrolls in its own region anyway (#311).
    { id: "shortages", header: t.shortages.heading, kind: "text", className: "min-w-80 whitespace-normal", cell: (day) => (
      <MrpShortages shortages={shortages.get(day.date) ?? []} unit={plan.baseUnit} locale={locale} labels={t.shortages} />
    ) },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold" data-mrp-plan-heading>{fill(t.plan, { material: `${plan.material} ${plan.materialDescription}`, location: `${plan.location} ${plan.locationName}` })}</h3>
        <p className="text-sm text-muted-foreground">{fill(t.planIntro, { unit: plan.baseUnit })}</p>
        <PlanExcess plan={plan} locale={locale} labels={t} />
      </div>
      <DataTable label={t.planLabel} columns={columns} rows={plan.buckets} rowKey={(day) => day.date} rowTone={(day) => (short(day) ? "danger" : undefined)} empty={t.empty} />
    </div>
  );
}

/**
 * One pair's ISO weeks (E18-S02, UX-027), folded for display by the read: flows summed, the safety stock
 * and balances at week end, the lowest balance and peak shortage from the weakest day. A week the horizon
 * cuts says so. Nothing here sums a balance or a shortage.
 */
function PlanWeeks({ plan, weeks, locale, labels: t }: { plan: MrpPlanView; weeks: MrpWeekView[]; locale: Locale; labels: Messages["mrp"]["report"] }) {
  const amount = (key: string, quantity: string) => (
    <span data-mrp-figure={key} className={cn(negative(quantity) && "font-medium text-danger")}>{localeQuantity(quantity, locale)}</span>
  );
  // A date range reads the same in both languages: the dates are the locale's.
  const range = (week: MrpWeekView) =>
    week.start === week.end ? shortDate(week.start, week.start, locale) : `${shortDate(week.start, week.start, locale)}–${shortDate(week.end, week.start, locale)}`;
  const columns: DataTableColumn<MrpWeekView>[] = [
    { id: "week", header: t.weekFigures.week, kind: "date", cell: (week) => (
      <div className="flex flex-col">
        <span data-mrp-week>{fill(t.weekTitle, { week: String(week.week), date: shortDate(week.start, week.start, locale) })}</span>
        <span className="text-xs text-muted-foreground" data-mrp-week-range>{week.partial ? fill(t.partial, { range: range(week) }) : range(week)}</span>
      </div>
    ) },
    ...WEEK_FIGURES.map((key): DataTableColumn<MrpWeekView> => ({ id: key, header: t.figures[key], kind: "quantity", className: "whitespace-normal", cell: (week) => amount(key, week[key]) })),
    // The week's balance and shortage, pinned as the day's are (#311, spec Q2).
    { id: "lowestProjectedBefore", header: t.weekFigures.lowestProjectedBefore, kind: "quantity", className: "whitespace-normal", pin: "end", cell: (week) => amount("lowestProjectedBefore", week.lowestProjectedBefore) },
    { id: "peakShortage", header: t.weekFigures.peakShortage, kind: "quantity", className: "whitespace-normal", pin: "end", cell: (week) => amount("peakShortage", week.peakShortage) },
    { id: "warnings", header: t.warnings, kind: "text", className: "whitespace-normal", cell: (week) => <MrpMarks marks={week.marks} unit={plan.baseUnit} locale={locale} labels={t.marks} /> },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold" data-mrp-plan-heading>{fill(t.weekPlan, { material: `${plan.material} ${plan.materialDescription}`, location: `${plan.location} ${plan.locationName}` })}</h3>
        <p className="text-sm text-muted-foreground">{fill(t.weekIntro, { unit: plan.baseUnit })}</p>
        <PlanExcess plan={plan} locale={locale} labels={t} />
      </div>
      <DataTable label={t.weekLabel} columns={columns} rows={weeks} rowKey={(week) => week.start} rowTone={(week) => (week.peakShortage !== "0.000000" ? "danger" : undefined)} empty={t.empty} />
    </div>
  );
}
