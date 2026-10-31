import type { ReactNode } from "react";
import Link from "next/link";
import type { Locale, MaterialSummary, NamedRecordView } from "@cpg/core";
import { FilterAutocomplete } from "@cpg/ui/backend/forms/filter-autocomplete";
import { Button } from "@cpg/ui/components/button";
import { Label } from "@cpg/ui/components/label";
import type { Messages } from "../../i18n/messages/en";
import { materialFilterOptions, materialPicker } from "../materials/material-picker";
import { recordOptions, recordPicker } from "../named-records/record-picker";

/** The form's words: plain strings, as the screens' dictionaries hold them. */
export interface MaterialLocationFilterLabels {
  material: string;
  location: string;
  /** The empty choice of both pickers: "All materials" or "All". */
  all: string;
  apply: string;
  clear: string;
  inactive: string;
}

interface MaterialLocationFiltersProps {
  /** The report's own URL: the form submits to it, and Clear filters goes back to it. */
  action: string;
  selected: { material?: string; location?: string };
  /** Whether any filter is set, the extra controls' included: then Clear filters shows. */
  filtered: boolean;
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  labels: MaterialLocationFilterLabels;
  /** The pickers' own words (`messages.lists`). */
  lists: Messages["lists"];
  locale: Locale;
  /** More filters beside Clear filters, such as the stock report's "Show zero rows". */
  children?: ReactNode;
}

/**
 * A report's material and location filters, a plain GET form shared by the stock and MRP reports.
 * Each picker is keyed by its value, so Clear filters and Back remount it with the URL's choice rather
 * than a choice left over in the hydrated field (lesson 2026-10-25, "Read the server's markup only
 * while hydrating").
 */
export function MaterialLocationFilters({ action, selected, filtered, materials, locations, labels, lists, locale, children }: MaterialLocationFiltersProps) {
  const pickers = { material: materialPicker(lists), location: recordPicker(lists, "location") };
  return (
    <form action={action} className="grid min-w-0 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="grid min-w-0 gap-2">
        <Label id="report-material-label" htmlFor="report-material">{labels.material}</Label>
        <FilterAutocomplete
          key={selected.material ?? ""}
          id="report-material"
          name="material"
          options={materialFilterOptions(materials, labels.inactive)}
          defaultValue={selected.material ?? ""}
          emptyLabel={labels.all}
          labels={pickers.material.labels}
          locale={locale}
          aria-labelledby="report-material-label"
        />
      </div>
      <div className="grid min-w-0 gap-2">
        <Label id="report-location-label" htmlFor="report-location">{labels.location}</Label>
        <FilterAutocomplete
          key={selected.location ?? ""}
          id="report-location"
          name="location"
          options={recordOptions(locations, labels.inactive)}
          defaultValue={selected.location ?? ""}
          emptyLabel={labels.all}
          labels={pickers.location.labels}
          locale={locale}
          aria-labelledby="report-location-label"
        />
      </div>
      <Button type="submit" variant="outline">{labels.apply}</Button>
      {(children || filtered) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-3">
          {children}
          {filtered && <Link href={action} className="text-sm font-medium underline underline-offset-4">{labels.clear}</Link>}
        </div>
      )}
    </form>
  );
}
