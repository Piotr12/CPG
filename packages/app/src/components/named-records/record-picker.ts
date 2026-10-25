import type { AutocompleteLabels, AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import type { Messages } from "../../i18n/messages/en";
import type { MaterialPicker } from "../materials/material-picker";

/** A location, customer or supplier as a picker sees it. */
export interface PickableRecord {
  id: string;
  name: string;
  active: boolean;
}

/** The kinds of named record a form picks, each with its own words in `lists`. */
export type RecordKind = "customer" | "supplier" | "location";

/**
 * Named records as an `Autocomplete`'s choices (#222): matched by ID and name. With `inactive`, an
 * inactive record says so as its quiet detail (a filter offers every record). The value is the ID.
 */
export function recordOptions(records: readonly PickableRecord[], inactive?: string): AutocompleteOption[] {
  return records.map(({ id, name, active }) => ({ value: id, code: id, name, ...(inactive !== undefined && !active ? { detail: inactive } : {}) }));
}

/**
 * The active records a new entry may pick (MAT-029, LFC-019), plus `keep`, the value an edit already
 * holds, even when it is inactive: marked with `inactive`, so the form never silently drops it.
 */
export function activeRecordOptions(records: readonly PickableRecord[], { keep, inactive }: { keep?: string; inactive?: string } = {}): AutocompleteOption[] {
  return recordOptions(
    records.filter(({ id, active }) => active || id === keep),
    inactive,
  );
}

/** A record picker's words and placeholder, in the reader's language: plain data for a client form. */
export function recordPicker(lists: Messages["lists"], kind: RecordKind): MaterialPicker {
  const { placeholder, results, noMatch, more, refused } = lists[`${kind}Picker`];
  const labels: AutocompleteLabels = { results, noMatch, more, refused };
  return { labels, placeholder };
}
