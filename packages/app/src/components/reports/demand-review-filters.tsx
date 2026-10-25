import Link from "next/link";
import type { DemandReviewView, Locale, NamedRecordView, StatisticalFactorView } from "@cpg/core";
import { FilterMultiSelect, type FilterMultiSelectLabels, type FilterMultiSelectOption } from "@cpg/ui/backend/forms/filter-multi-select";
import { SegmentedControl } from "@cpg/ui/backend/forms/segmented-control";
import { plural } from "@cpg/ui/lib/plural";
import { Button } from "@cpg/ui/components/button";
import { Label } from "@cpg/ui/components/label";
import type { Messages } from "../../i18n/messages/en";
import { fill } from "../forms/form-labels";

type Labels = Messages["demandReview"];

interface DemandReviewFiltersProps {
  /** The form's address: the page itself. */
  action: string;
  view: DemandReviewView;
  products: StatisticalFactorView[];
  locations: NamedRecordView[];
  locale: Locale;
  labels: Labels;
}

/** Each finished product with its SU factor as its detail, so one without a factor shows before it is picked. */
export function productOptions(products: readonly StatisticalFactorView[], labels: Labels): FilterMultiSelectOption[] {
  return products.map(({ id, description, active, baseUnit, perBaseUnit }) => ({
    value: id,
    code: id,
    name: description,
    detail: perBaseUnit === null ? labels.noFactor : fill(labels.factor, { unit: baseUnit, factor: perBaseUnit }),
    ...(!active && { inactive: true }),
  }));
}

/** Why the unit control offers what it offers (#239): every product together is only SU; one product, any of its units. */
export function unitRule(view: Pick<DemandReviewView, "materials" | "units" | "disabledUnits">, productCount: number, locale: Locale, labels: Labels): string {
  if (view.materials.length === 1) return fill(labels.unitRuleOne, { units: view.units.join(", ") });
  const count = view.materials.length || productCount;
  const shown = plural(locale, count, labels.unitRuleMany);
  if (view.disabledUnits.length === 0) return shown;
  const units = new Intl.ListFormat(locale, { type: "disjunction" }).format(view.disabledUnits);
  return `${shown} ${fill(labels.unitRuleChoose, { units })}`;
}

/**
 * The demand review's filter form (#240): a plain GET form, so it works before hydration. It never
 * carries `offset`: Apply always returns to the window around today.
 */
export function DemandReviewFilters({ action, view, products, locations, locale, labels }: DemandReviewFiltersProps) {
  const disabled = products.length === 0;
  const picker = (all: string): FilterMultiSelectLabels => ({ ...labels.picker, all });
  return (
    <form action={action} aria-label={labels.filters} className="flex min-w-0 flex-col gap-4">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[auto_1fr_1fr_auto] lg:items-start">
        <div className="grid gap-2">
          <Label id="review-bucket-label">{labels.bucket}</Label>
          <SegmentedControl
            key={view.bucket}
            name="bucket"
            options={(["day", "week", "month"] as const).map((value) => ({ value, label: labels.buckets[value] }))}
            defaultValue={view.bucket}
            disabled={disabled}
            aria-labelledby="review-bucket-label"
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label id="review-location-label" htmlFor="review-location">{labels.locations}</Label>
          <FilterMultiSelect
            key={view.locations.join(",")}
            id="review-location"
            name="location"
            options={locations.map(({ id, name, active }) => ({ value: id, code: id, name, ...(!active && { inactive: true }) }))}
            defaultValue={view.locations}
            labels={picker(labels.allLocations)}
            locale={locale}
            disabled={disabled}
            aria-labelledby="review-location-label"
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label id="review-material-label" htmlFor="review-material">{labels.products}</Label>
          <FilterMultiSelect
            key={view.materials.join(",")}
            id="review-material"
            name="material"
            options={productOptions(products, labels)}
            defaultValue={view.materials}
            labels={picker(labels.allProducts)}
            locale={locale}
            disabled={disabled}
            aria-labelledby="review-material-label"
          />
        </div>
        <div className="grid gap-2">
          <Label id="review-unit-label">{labels.unit}</Label>
          <SegmentedControl
            key={view.unit}
            name="unit"
            options={[...view.units.map((unit) => ({ value: unit, label: unit })), ...view.disabledUnits.map((unit) => ({ value: unit, label: unit, disabled: true }))]}
            defaultValue={view.unit}
            disabled={disabled}
            aria-labelledby="review-unit-label"
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground" data-unit-rule>{unitRule(view, products.length, locale, labels)}</p>
      <div className="flex items-center gap-4">
        <Button type="submit" variant="outline" disabled={disabled}>{labels.apply}</Button>
        <Link href={action} className="text-sm font-medium underline underline-offset-4">{labels.clear}</Link>
      </div>
    </form>
  );
}
