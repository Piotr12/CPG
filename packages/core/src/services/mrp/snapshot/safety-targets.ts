import { SafetyStockTarget, type EntityManager } from "@cpg/db";
import { addDays } from "../../../domain/demand/demand-buckets";
import type { MrpSafetyTarget } from "../../../domain/mrp/mrp-inputs";
import type { SnapshotCodes } from "./codes";
import { beforeCutOff, readRow, type UnreadableRows } from "./readable";

/**
 * Every safety-stock target effective on or before `last` (the horizon's last day), in one partial
 * read: the engine needs the latest one before today to know the target in force from day 0. Targets
 * are few, one per pair and change. One that can't be read is left out and reported (E16-S03).
 *
 * The read takes every target and cuts off in code (`beforeCutOff`), so a date that isn't a real day
 * is reported wherever it sorts, `30/10/2026` among them (#321). The read walked the tenant's targets
 * with the range too; only the few dated after the horizon now hydrate as well.
 */
export async function readSafetyTargets(em: EntityManager, codes: SnapshotCodes, last: string, unreadable: UnreadableRows): Promise<MrpSafetyTarget[]> {
  const rows = await em.find(SafetyStockTarget, {}, { fields: ["material", "location", "effectiveFrom", "quantity"], disableIdentityMap: true });
  const after = addDays(last, 1);
  const targets: MrpSafetyTarget[] = [];
  for (const row of rows.filter(({ effectiveFrom }) => beforeCutOff(effectiveFrom, after))) {
    const pair = { material: codes.materials.get(row.material.id)!, location: codes.locations.get(row.location.id)! };
    const read = readRow({ quantities: { quantity: row.quantity }, dates: [row.effectiveFrom] });
    if (read) targets.push({ ...pair, effectiveFrom: row.effectiveFrom, quantity: read.quantity });
    else unreadable.push({ ...pair, record: "safety-stock-target" });
  }
  return targets;
}
