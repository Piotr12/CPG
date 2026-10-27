import type { AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import type { CrudField } from "@cpg/ui/backend/forms/crud-form";
import { baseUnitTip, chosenBaseUnit, type BaseUnitOf } from "../forms/form-labels";
import type { PlanningParametersLabels } from "./labels";

/**
 * The four values both forms edit: Make/Buy, lead time, minimum lot and lot multiple. The quantity
 * tooltips name the material's base unit once `baseUnit` knows it (UX-014, #290).
 */
export function valueFields(labels: PlanningParametersLabels, baseUnit: BaseUnitOf): CrudField[] {
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
    { name: "minimumQuantity", label: t.minimumQuantity, description: t.minimumHint, autoComplete: "off", tooltip: baseUnitTip(t.minimumTip, t.minimumTipAny, baseUnit) },
    { name: "lotMultiple", label: t.lotMultiple, description: t.lotMultipleHint, autoComplete: "off", tooltip: baseUnitTip(t.lotMultipleTip, t.lotMultipleTipAny, baseUnit) },
  ];
}

/** The Add form: the material to plan and its location, each chosen with an autocomplete (#217, #222), then the four values. */
export function addFields(labels: PlanningParametersLabels, materials: AutocompleteOption[], locations: AutocompleteOption[]): CrudField[] {
  const t = labels.form;
  return [
    { name: "material", label: t.material, type: "autocomplete", placeholder: labels.picker.placeholder, choices: materials, autocompleteLabels: labels.picker.labels },
    { name: "location", label: t.location, type: "autocomplete", placeholder: labels.locationPicker.placeholder, choices: locations, autocompleteLabels: labels.locationPicker.labels },
    ...valueFields(labels, chosenBaseUnit(materials)),
  ];
}
