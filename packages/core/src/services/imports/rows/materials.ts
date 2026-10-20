import type { SheetRow } from "../../../domain/imports/prepare-import";
import type { MaterialRow } from "../../../validators/imports/import-rows.schema";
import type { MaterialSummary } from "../../materials/material.service";
import { changesBetween, createdValues, existing, noteVersion, runRow, type ApplyContext } from "../apply-context";

const FIELDS = [
  ["type", "Type"],
  ["description", "Description"],
  ["baseUnit", "Base unit"],
  ["active", "Active"],
] as const;

/** Where the material locks' refusals show (BOMs spec Q9, materials spec Q8). */
const CODES = {
  MATERIAL_TYPE_IN_USE: "Type",
  MATERIAL_MADE_AT_LOCATIONS: "Type",
  BASE_UNIT_IN_USE: "Base unit",
  BASE_UNIT_HAS_CONVERSIONS: "Base unit",
};

const label = ({ id, description }: MaterialSummary) => `${id} — ${description}`;

/** The Materials sheet: a blank ID creates the next material, a known ID updates it (XLS-002, XLS-003). */
export async function importMaterials(context: ApplyContext, rows: SheetRow<MaterialRow>[]): Promise<void> {
  const { materialService } = context.services;
  for (const { row, values } of rows) {
    const { id, active, ...fields } = values;
    await runRow(
      context,
      "materials",
      row,
      async () => {
        if (id === null) {
          const created = await materialService.create(fields, context.actor);
          return { sheet: "Materials", row, action: "create", record: created.id, label: label(created), changes: createdValues(created, FIELDS) };
        }
        const before = await existing(context, () => materialService.get(id), "MATERIAL_NOT_FOUND", "material", id);
        noteVersion(context, "Material", id, before.version);
        const changes = active === null ? fields : { ...fields, active };
        const after = await materialService.update(id, changes, before.version, context.actor);
        const action = after.version === before.version ? "unchanged" : "update";
        return { sheet: "Materials", row, action, record: id, label: label(after), changes: changesBetween(before, after, FIELDS) };
      },
      { codes: CODES },
    );
  }
}
