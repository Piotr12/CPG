import type { AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import type { CrudField } from "@cpg/ui/backend/forms/crud-form";
import type { FormOption } from "../forms/form-labels";
import type { PlanningParametersLabels } from "./labels";

/** The four values both forms edit: Make/Buy, lead time, minimum lot and lot multiple. */
export function valueFields(labels: PlanningParametersLabels): CrudField[] {
  const t = labels.form;
  return [
    {
      name: "procurement",
      label: t.procurement,
      type: "select",
      placeholder: t.choose,
      options: [
        { value: "make", label: labels.procurement.make },
        { value: "buy", label: labels.procurement.buy },
      ],
      description: t.procurementHint,
    },
    { name: "leadTimeDays", label: t.leadTimeDays, description: t.leadTimeHint, autoComplete: "off" },
    { name: "minimumQuantity", label: t.minimumQuantity, description: t.minimumHint, autoComplete: "off" },
    { name: "lotMultiple", label: t.lotMultiple, description: t.lotMultipleHint, autoComplete: "off" },
  ];
}

/** The Add form: the material to plan, chosen with the material picker (#217), the location, then the four values. */
export function addFields(labels: PlanningParametersLabels, materials: AutocompleteOption[], locations: FormOption[]): CrudField[] {
  const t = labels.form;
  return [
    { name: "material", label: t.material, type: "autocomplete", placeholder: labels.picker.placeholder, choices: materials, autocompleteLabels: labels.picker.labels },
    { name: "location", label: t.location, type: "select", placeholder: t.choose, options: locations },
    ...valueFields(labels),
  ];
}
