import type { AutocompleteLabels, AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import type { Messages } from "../../i18n/messages/en";

/**
 * Materials as an `Autocomplete`'s choices (#217): matched by ID and description, the base unit as
 * the quiet detail. The value is the business ID.
 */
export function materialOptions(materials: readonly { id: string; description: string; baseUnit: string }[]): AutocompleteOption[] {
  return materials.map(({ id, description, baseUnit }) => ({ value: id, code: id, name: description, detail: baseUnit }));
}

/** The material picker's words, without its placeholder: plain strings for a client form. */
export function materialPickerLabels(lists: Messages["lists"]): AutocompleteLabels {
  const { results, noMatch, more, refused } = lists.materialPicker;
  return { results, noMatch, more, refused };
}
