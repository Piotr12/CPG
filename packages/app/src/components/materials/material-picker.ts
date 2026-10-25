import type { AutocompleteLabels, AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import type { Messages } from "../../i18n/messages/en";

/**
 * Materials as an `Autocomplete`'s choices (#217): matched by ID and description, the base unit as
 * the quiet detail. The value is the business ID.
 */
export function materialOptions(materials: readonly { id: string; description: string; baseUnit: string }[]): AutocompleteOption[] {
  return materials.map(({ id, description, baseUnit }) => ({ value: id, code: id, name: description, detail: baseUnit }));
}

/** The active materials a new entry may pick (MAT-029), as autocomplete choices. */
export function activeMaterialOptions(materials: readonly { id: string; description: string; baseUnit: string; active: boolean }[]): AutocompleteOption[] {
  return materialOptions(materials.filter(({ active }) => active));
}

/**
 * Materials as a filter's choices (#222): every material, since a filter may look for history, and an
 * inactive one says so as its quiet detail. The value is the business ID.
 */
export function materialFilterOptions(materials: readonly { id: string; description: string; active: boolean }[], inactive: string): AutocompleteOption[] {
  return materials.map(({ id, description, active }) => ({ value: id, code: id, name: description, ...(active ? {} : { detail: inactive }) }));
}

/**
 * A filter's choices, plus the address's value when it names no record: shown as its own option,
 * "not in the list", so the field never claims a choice the list isn't filtered by (#222, lesson 2026-10-23).
 */
export function withUnlisted(options: AutocompleteOption[], value: string | undefined, notListed: string): AutocompleteOption[] {
  if (value === undefined || value === "" || options.some((option) => option.value === value)) return options;
  return [...options, { value, code: value, name: notListed }];
}

/** A material picker's words and placeholder: plain data for a client form. */
export interface MaterialPicker {
  labels: AutocompleteLabels;
  placeholder: string;
}

/** Every entry form's material picker, from the dictionary's shared `lists` section. */
export function materialPicker(lists: Messages["lists"]): MaterialPicker {
  return { labels: materialPickerLabels(lists), placeholder: lists.materialPicker.placeholder };
}

/** The material picker's words, without its placeholder: plain strings for a client form. */
export function materialPickerLabels(lists: Messages["lists"]): AutocompleteLabels {
  const { results, noMatch, more, refused } = lists.materialPicker;
  return { results, noMatch, more, refused };
}
