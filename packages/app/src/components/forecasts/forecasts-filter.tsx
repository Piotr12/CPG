import Link from "next/link";
import type { AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import { FilterAutocomplete } from "@cpg/ui/backend/forms/filter-autocomplete";
import { Button } from "@cpg/ui/components/button";
import { Label } from "@cpg/ui/components/label";
import { listHref } from "../lists/list-params";
import { materialFilterOptions, withUnlisted, type MaterialPicker } from "../materials/material-picker";
import { recordOptions, type PickableRecord } from "../named-records/record-picker";
import type { ForecastsLabels } from "./labels";

interface ForecastsFilterProps {
  /** The screen's own path: the filter is a plain GET form, so it works without JavaScript. */
  action: string;
  labels: ForecastsLabels;
  /** Every material and location of the tenant, inactive ones too (marked): a forecast may name them. */
  materials: readonly { id: string; description: string; active: boolean }[];
  locations: readonly PickableRecord[];
  selected: { material?: string; location?: string };
  /** Names a filter value from the address that matches no record ("not in the list"). */
  notListed: string;
  /** The list's search and sort, kept as hidden fields by a new filter and by Clear filter (#217). */
  keep?: Record<string, string | undefined>;
  locale?: string;
}

/** Narrows the list to one material and/or one location (E08-S03), through the URL's query. */
export function ForecastsFilter({ action, labels, materials, locations, selected, notListed, keep = {}, locale }: ForecastsFilterProps) {
  const t = labels.filter;
  const filtered = selected.material !== undefined || selected.location !== undefined;
  const choice = (name: "material" | "location", label: string, options: AutocompleteOption[], picker: MaterialPicker) => (
    <div className="flex w-72 max-w-full flex-col gap-2">
      <Label id={`forecast-filter-${name}-label`} htmlFor={`forecast-filter-${name}`}>{label}</Label>
      {/* Keyed by the address's value, so Clear filter or Back starts the field afresh (#222). */}
      <FilterAutocomplete
        key={selected[name] ?? ""}
        id={`forecast-filter-${name}`}
        name={name}
        options={withUnlisted(options, selected[name], notListed)}
        defaultValue={selected[name] ?? ""}
        emptyLabel={t.any}
        labels={picker.labels}
        locale={locale}
        aria-labelledby={`forecast-filter-${name}-label`}
      />
    </div>
  );

  return (
    <form action={action} role="search" aria-label={t.label} className="flex flex-wrap items-end gap-4">
      {choice("material", t.material, materialFilterOptions(materials, labels.inactive), labels.picker)}
      {choice("location", t.location, recordOptions(locations, labels.inactive), labels.locationPicker)}
      {Object.entries(keep).map(([name, value]) => value !== undefined && <input key={name} type="hidden" name={name} value={value} />)}
      <Button type="submit" variant="outline">
        {t.apply}
      </Button>
      {filtered && (
        <Button asChild variant="link">
          <Link href={listHref(action, keep)}>{t.clear}</Link>
        </Button>
      )}
    </form>
  );
}
