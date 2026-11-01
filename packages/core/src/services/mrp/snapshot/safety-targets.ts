import { SafetyStockTarget, type EntityManager } from "@cpg/db";
import type { MrpSafetyTarget } from "../../../domain/mrp/mrp-inputs";
import type { SnapshotCodes } from "./codes";
import { readRow, type UnreadableRows } from "./readable";

/**
 * Every safety-stock target effective on or before `last` (the horizon's last day), in one partial
 * read: the engine needs the latest one before today to know the target in force from day 0. Targets
 * are few, one per pair and change. One that can't be read is left out and reported (E16-S03).
 */
export async function readSafetyTargets(em: EntityManager, codes: SnapshotCodes, last: string, unreadable: UnreadableRows): Promise<MrpSafetyTarget[]> {
  const rows = await em.find(
    SafetyStockTarget,
    { effectiveFrom: { $lte: last } },
    { fields: ["material", "location", "effectiveFrom", "quantity"], disableIdentityMap: true },
  );
  const targets: MrpSafetyTarget[] = [];
  for (const row of rows) {
    const pair = { material: codes.materials.get(row.material.id)!, location: codes.locations.get(row.location.id)! };
    const read = readRow({ quantities: { quantity: row.quantity }, dates: [row.effectiveFrom] });
    if (read) targets.push({ ...pair, effectiveFrom: row.effectiveFrom, quantity: read.quantity });
    else unreadable.push({ ...pair, record: "safety-stock-target" });
  }
  return targets;
}
