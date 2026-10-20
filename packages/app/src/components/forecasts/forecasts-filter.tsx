import Link from "next/link";
import { Button } from "@cpg/ui/components/button";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import type { FormOption } from "../forms/form-labels";
import type { ForecastsLabels } from "./labels";

interface ForecastsFilterProps {
  /** The screen's own path: the filter is a plain GET form, so it works without JavaScript. */
  action: string;
  labels: ForecastsLabels;
  /** Every material and location of the tenant, inactive ones too: a forecast may name them. */
  materials: FormOption[];
  locations: FormOption[];
  selected: { material?: string; location?: string };
}

/** Narrows the list to one material and/or one location (E08-S03), through the URL's query. */
export function ForecastsFilter({ action, labels, materials, locations, selected }: ForecastsFilterProps) {
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
      <Button type="submit" variant="outline">
        {t.apply}
      </Button>
      {filtered && (
        <Button asChild variant="link">
          <Link href={action}>{t.clear}</Link>
        </Button>
      )}
    </form>
  );
}
