import { MATERIAL_TYPES } from "@cpg/core/validators/materials/material-fields.schema";
import { isStatisticalUnit } from "@cpg/core/validators/units/unit-registry";
import type { CrudField } from "@cpg/ui/backend/forms/crud-form";
import { unitSelect, type UnitChoices } from "../units/unit-choices";
import type { MaterialsLabels } from "./labels";

/**
 * The fields of the Create and Edit material forms: type, description and base unit, the unit chosen
 * from the registry (#217), never the report-only SU (#239). `baseUnit` is the stored unit an edit
 * starts from, offered even when the select wouldn't list it.
 */
export function materialFormFields(labels: MaterialsLabels, units: UnitChoices, baseUnit?: string): CrudField[] {
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
    {
      name: "baseUnit",
      label: t.baseUnit,
      type: "select",
      placeholder: t.baseUnitPlaceholder,
      ...unitSelect(units, { current: baseUnit, physicalOnly: true }),
      description: t.baseUnitHint,
      tooltip: t.baseUnitTip,
    },
  ];
}

/**
 * The fields of the Add conversion and Change factor forms; the unit only when adding, from the
 * registry, with the base unit and the units already converted shown but unselectable. SU, chosen
 * when adding or the `unit` a Change factor form edits, swaps in hints on what it is and how its
 * factor is entered (#239).
 */
export function conversionFormFields(
  labels: MaterialsLabels,
  baseUnit: string,
  { units, converted = [], unit: fixedUnit }: { units?: UnitChoices; converted?: string[]; unit?: string } = {},
): CrudField[] {
  const t = labels.conversions;
  const disabled = Object.fromEntries([[baseUnit, t.unitReasons.baseUnit], ...converted.map((unit) => [unit, t.unitReasons.converted])]);
  const isStatistical = (values: Record<string, string>) => isStatisticalUnit(fixedUnit ?? values.unit);
  const unit: CrudField[] = units
    ? [
        {
          name: "unit",
          label: t.unit,
          type: "select",
          placeholder: t.unitPlaceholder,
          ...unitSelect(units, { disabled }),
          description: (values) => (isStatistical(values) ? t.statisticalUnitHint : t.unitHint),
        },
      ]
    : [];
  return [
    ...unit,
    { name: "denominator", label: t.denominator, autoComplete: "off", description: t.denominatorHint, tooltip: t.denominatorTip.replaceAll("{baseUnit}", baseUnit) },
    {
      name: "numerator",
      label: t.numerator,
      autoComplete: "off",
      description: (values) => [t.numeratorHint, ...(isStatistical(values) ? [t.statisticalHint] : [])].join(" ").replaceAll("{baseUnit}", baseUnit),
      tooltip: t.numeratorTip.replaceAll("{baseUnit}", baseUnit),
    },
  ];
}
