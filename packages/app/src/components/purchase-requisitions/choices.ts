import type { MaterialSummary } from "@cpg/core";
import type { AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import { materialOptions } from "../materials/material-picker";
import type { MaterialChoice } from "./requisition-form";

/** The materials a document may pick: the active ones, labelled with their base unit and the units a quantity may be entered in. */
export function materialChoices(materials: MaterialSummary[], units: Record<string, string[]>): MaterialChoice[] {
  return materials
    .filter(({ active }) => active)
    .map(({ id, description, baseUnit }) => ({ value: id, label: `${id} — ${description} (${baseUnit})`, units: units[id] }));
}

/** A material a document's autocomplete offers (#217), with the units a quantity of it may be entered in, base unit first. */
export interface MaterialPick extends AutocompleteOption {
  units: string[];
}

/** The materials a document's material autocomplete offers: the active ones, as `materialChoices` (MAT-029). */
export function materialPicks(materials: MaterialSummary[], units: Record<string, string[]>): MaterialPick[] {
  return materialOptions(materials.filter(({ active }) => active)).map((option) => ({ ...option, units: units[option.value] }));
}
