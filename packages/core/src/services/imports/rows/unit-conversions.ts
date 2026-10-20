import type { SheetRow } from "../../../domain/imports/prepare-import";
import type { UnitConversionRow } from "../../../validators/imports/import-rows.schema";
import { changesBetween, createdValues, noteVersion, referenced, runRow, type ApplyContext } from "../apply-context";

const FIELDS = [
  ["numerator", "Numerator"],
  ["denominator", "Denominator"],
] as const;

const CODES = { UNIT_IS_BASE_UNIT: "Unit", CONVERSION_EXISTS: "Unit" };

/** The Unit conversions sheet: a material's new unit is added, an existing unit gets the new factor. */
export async function importUnitConversions(context: ApplyContext, rows: SheetRow<UnitConversionRow>[]): Promise<void> {
  const { materialService } = context.services;
  for (const { row, values } of rows) {
    const { material: id, unit, ...factor } = values;
    await runRow(
      context,
      "unitConversions",
      row,
      async () => {
        const material = await referenced(context, () => materialService.get(id), "MATERIAL_NOT_FOUND", "material", id, "Material ID");
        noteVersion(context, "Material", id, material.version);
        const record = `${id}/${unit}`;
        const label = `${id} — ${material.description}: ${unit}`;
        const before = material.conversions.find((conversion) => conversion.unit === unit);
        if (!before) {
          const created = await materialService.addConversion(id, { unit, ...factor }, context.actor);
          return { sheet: "Unit conversions", row, action: "create", record, label, changes: createdValues(created, FIELDS) };
        }
        noteVersion(context, "MaterialConversion", record, before.version);
        const after = await materialService.changeConversion(id, unit, factor, before.version, context.actor);
        const action = after.version === before.version ? "unchanged" : "update";
        return { sheet: "Unit conversions", row, action, record, label, changes: changesBetween(before, after, FIELDS) };
      },
      { codes: CODES },
    );
  }
}
