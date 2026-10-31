import { SafetyStockTarget, type EntityManager } from "@cpg/db";
import type { MrpSafetyTarget } from "../../../domain/mrp/mrp-inputs";
import { parseDecimal } from "../../../domain/quantities/decimal";
import type { SnapshotCodes } from "./codes";

/**
 * Every safety-stock target effective on or before `last` (the horizon's last day), in one partial
 * read: the engine needs the latest one before today to know the target in force from day 0. Targets
 * are few, one per pair and change.
 */
export async function readSafetyTargets(em: EntityManager, codes: SnapshotCodes, last: string): Promise<MrpSafetyTarget[]> {
  const rows = await em.find(
    SafetyStockTarget,
    { effectiveFrom: { $lte: last } },
    { fields: ["material", "location", "effectiveFrom", "quantity"], disableIdentityMap: true },
  );
  return rows.map(({ material, location, effectiveFrom, quantity }) => ({
    material: codes.materials.get(material.id)!,
    location: codes.locations.get(location.id)!,
    effectiveFrom,
    quantity: parseDecimal(quantity)!,
  }));
}
