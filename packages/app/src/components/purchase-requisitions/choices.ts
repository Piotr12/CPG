import type { MaterialSummary, NamedRecordView } from "@cpg/core";
import type { FormOption } from "../forms/form-labels";
import type { MaterialChoice } from "./requisition-form";

/** The materials a document may pick: the active ones, labelled with their base unit and the units a quantity may be entered in. */
export function materialChoices(materials: MaterialSummary[], units: Record<string, string[]>): MaterialChoice[] {
  return materials
    .filter(({ active }) => active)
    .map(({ id, description, baseUnit }) => ({ value: id, label: `${id} — ${description} (${baseUnit})`, units: units[id] }));
}

/** The active masters (locations, suppliers) a new document may pick, by business ID. */
export function activeOptions(records: NamedRecordView[]): FormOption[] {
  return records.filter(({ active }) => active).map(({ id, name }) => ({ value: id, label: `${id} — ${name}` }));
}
