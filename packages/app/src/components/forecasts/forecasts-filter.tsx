import Link from "next/link";
import { Button } from "@cpg/ui/components/button";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import type { FormOption } from "../forms/form-labels";
import { listHref } from "../lists/list-params";
import type { ForecastsLabels } from "./labels";

interface ForecastsFilterProps {
  /** The screen's own path: the filter is a plain GET form, so it works without JavaScript. */
  action: string;
  labels: ForecastsLabels;
  /** Every material and location of the tenant, inactive ones too: a forecast may name them. */
  materials: FormOption[];
  locations: FormOption[];
  selected: { material?: string; location?: string };
  /** The list's search and sort, kept as hidden fields by a new filter and by Clear filter (#217). */
  keep?: Record<string, string | undefined>;
}

/** Narrows the list to one material and/or one location (E08-S03), through the URL's query. */
export function ForecastsFilter({ action, labels, materials, locations, selected, keep = {} }: ForecastsFilterProps) {
  const t = labels.filter;
  const filtered = selected.material !== undefined || selected.location !== undefined;
  const choice = (name: "material" | "location", label: string, options: FormOption[]) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`forecast-filter-${name}`}>{label}</Label>
      <NativeSelect id={`forecast-filter-${name}`} name={name} defaultValue={selected[name] ?? ""}>
        <NativeSelectOption value="">{t.any}</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );

  return (
    <form action={action} role="search" aria-label={t.label} className="flex flex-wrap items-end gap-4">
      {choice("material", t.material, materials)}
      {choice("location", t.location, locations)}
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
