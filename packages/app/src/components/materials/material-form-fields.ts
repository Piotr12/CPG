import { MATERIAL_TYPES } from "@cpg/core/validators/materials/material-fields.schema";
import type { CrudField } from "@cpg/ui/backend/forms/crud-form";
import type { MaterialsLabels } from "./labels";

/** The fields of the Create and Edit material forms: type, description and base unit. */
export function materialFormFields(labels: MaterialsLabels): CrudField[] {
  const t = labels.form;
  return [
    {
      name: "type",
      label: t.type,
      type: "select",
      placeholder: t.typePlaceholder,
      options: MATERIAL_TYPES.map((type) => ({ value: type, label: labels.types[type] })),
      description: t.typeHint,
    },
    { name: "description", label: t.description, autoComplete: "off" },
    { name: "baseUnit", label: t.baseUnit, autoComplete: "off", description: t.baseUnitHint },
  ];
}

/** The fields of the Add conversion and Change factor forms; the unit only when adding. */
export function conversionFormFields(labels: MaterialsLabels, baseUnit: string, { withUnit }: { withUnit: boolean }): CrudField[] {
  const t = labels.conversions;
  const unit: CrudField = { name: "unit", label: t.unit, autoComplete: "off", description: t.unitHint };
  return [
    ...(withUnit ? [unit] : []),
    { name: "denominator", label: t.denominator, autoComplete: "off", description: t.denominatorHint },
    {
      name: "numerator",
      label: t.numerator,
      autoComplete: "off",
      description: t.numeratorHint.replaceAll("{baseUnit}", baseUnit),
    },
  ];
}
