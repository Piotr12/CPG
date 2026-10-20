import type { SheetRow } from "../../../domain/imports/prepare-import";
import type { PlanningParameterRow } from "../../../validators/imports/import-rows.schema";
import { changesBetween, createdValues, noteVersion, referenced, runRow, type ApplyContext } from "../apply-context";

const FIELDS = [
  ["procurement", "Procurement"],
  ["leadTimeDays", "Lead time days"],
  ["minimumQuantity", "Minimum quantity"],
  ["lotMultiple", "Lot multiple"],
] as const;

const CODES = { MATERIAL_INACTIVE: "Material ID", LOCATION_INACTIVE: "Location ID", PLANNING_PARAMETERS_EXIST: "Location ID" };

/**
 * Checks that a row's material and location exist, notes their versions, and returns their labels.
 * Shared by the planning-parameter and safety-stock sheets, which both key on a material at a location.
 */
export async function materialAtLocation(context: ApplyContext, material: string, location: string): Promise<string> {
  const { materialService, locationService } = context.services;
  const found = await referenced(context, () => materialService.get(material), "MATERIAL_NOT_FOUND", "material", material, "Material ID");
  const at = await referenced(context, () => locationService.get(location), "LOCATION_NOT_FOUND", "location", location, "Location ID");
  noteVersion(context, "Material", material, found.version);
  noteVersion(context, "Location", location, at.version);
  return `${material} ${found.description} at ${location} ${at.name}`;
}

/**
 * The Planning parameters sheet: a material at a location without a set gets one, one with a set
 * gets the new values. The sets are read once: the key pass made each pair appear once in the sheet.
 */
export async function importPlanningParameters(context: ApplyContext, rows: SheetRow<PlanningParameterRow>[]): Promise<void> {
  if (rows.length === 0) return;
  const { planningParameterService } = context.services;
  const sets = new Map((await planningParameterService.list()).map((set) => [`${set.material}/${set.location}`, set]));
  for (const { row, values } of rows) {
    const { material, location, ...changes } = values;
    await runRow(
      context,
      "planningParameters",
      row,
      async () => {
        const label = await materialAtLocation(context, material, location);
        const record = `${material}/${location}`;
        const before = sets.get(record);
        if (!before) {
          const created = await planningParameterService.create(values, context.actor);
          return { sheet: "Planning parameters", row, action: "create", record, label, changes: createdValues(created, FIELDS) };
        }
        noteVersion(context, "PlanningParameterSet", record, before.version);
        const after = await planningParameterService.update(material, location, changes, before.version, context.actor);
        const action = after.version === before.version ? "unchanged" : "update";
        return { sheet: "Planning parameters", row, action, record, label, changes: changesBetween(before, after, FIELDS) };
      },
      { codes: CODES },
    );
  }
}
