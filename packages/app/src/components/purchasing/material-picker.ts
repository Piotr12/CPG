import type { AutocompleteLabels } from "@cpg/ui/backend/forms/autocomplete";
import type { Messages } from "../../i18n/messages/en";
import { materialPickerLabels } from "../materials/material-picker";

/** What a document form's material autocomplete says (#217): plain strings, for a client form. */
export interface DocumentMaterialPicker {
  labels: AutocompleteLabels;
  placeholder: string;
}

/** The requisition, purchase-order and transfer forms' material picker words, from a dictionary. */
export function documentMaterialPicker(messages: Messages): DocumentMaterialPicker {
  return { labels: materialPickerLabels(messages.lists), placeholder: messages.lists.materialPicker.placeholder };
}
