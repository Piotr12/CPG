import type { SheetRow } from "../../../domain/imports/prepare-import";
import type { SafetyStockRow } from "../../../validators/imports/import-rows.schema";
import { changesBetween, createdValues, noteVersion, runRow, type ApplyContext } from "../apply-context";
import { materialAtLocation } from "./planning-parameters";

const FIELDS = [["quantity", "Quantity"]] as const;

const CODES = { MATERIAL_INACTIVE: "Material ID", LOCATION_INACTIVE: "Location ID", SAFETY_STOCK_TARGET_EXISTS: "Effective from" };

/** The Safety stock sheet: a new date gets a target, an existing target gets the new quantity. */
export async function importSafetyStock(context: ApplyContext, rows: SheetRow<SafetyStockRow>[]): Promise<void> {
  if (rows.length === 0) return;
  const { safetyStockTargetService } = context.services;
  const key = ({ material, location, effectiveFrom }: { material: string; location: string; effectiveFrom: string }) =>
    `${material}/${location}/${effectiveFrom}`;
  const targets = new Map((await safetyStockTargetService.list()).map((target) => [key(target), target]));
  for (const { row, values } of rows) {
    await runRow(
      context,
      "safetyStock",
      row,
      async () => {
        const label = `${await materialAtLocation(context, values.material, values.location)} from ${values.effectiveFrom}`;
        const record = key(values);
        const before = targets.get(record);
        if (!before) {
          const created = await safetyStockTargetService.create(values, context.actor);
          return { sheet: "Safety stock", row, action: "create", record, label, changes: createdValues(created, FIELDS) };
        }
        noteVersion(context, "SafetyStockTarget", record, before.version);
        const after = await safetyStockTargetService.update(values, values.quantity, before.version, context.actor);
        const action = after.version === before.version ? "unchanged" : "update";
        return { sheet: "Safety stock", row, action, record, label, changes: changesBetween(before, after, FIELDS) };
      },
      { codes: CODES },
    );
  }
}
