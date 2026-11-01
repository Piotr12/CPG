import { PlanningParameterSet, type EntityManager } from "@cpg/db";
import type { MrpPlanningParameters } from "../../../domain/mrp/mrp-inputs";
import type { SnapshotCodes } from "./codes";
import { readRow, type UnreadableRows } from "./readable";

/**
 * Every planning parameter set of the tenant, in one partial read (#278): there is one set per
 * material and location, so about as many rows as a run plans pairs. The material's type comes from
 * `readCodes`, so the read joins nothing. A set whose minimum or lot multiple can't be read, or whose
 * multiple isn't above zero, is left out and reported as `planning-parameter-set`, which the engine
 * raises as Missing Planning Parameters, `invalid-set` (E16-S03, spec Q5).
 */
export async function readPlanningParameters(em: EntityManager, codes: SnapshotCodes, unreadable: UnreadableRows): Promise<MrpPlanningParameters[]> {
  const rows = await em.find(
    PlanningParameterSet,
    {},
    { fields: ["material", "location", "procurement", "leadTimeDays", "minimumQuantity", "lotMultiple"], disableIdentityMap: true },
  );
  const sets: MrpPlanningParameters[] = [];
  for (const { material, location, procurement, leadTimeDays, minimumQuantity, lotMultiple } of rows) {
    const pair = { material: codes.materials.get(material.id)!, location: codes.locations.get(location.id)! };
    const read = readRow({ quantities: { minimumQuantity, lotMultiple } });
    if (read && read.lotMultiple > 0n) sets.push({ ...pair, materialType: codes.materialTypes.get(material.id)!, procurement, leadTimeDays, ...read });
    else unreadable.push({ ...pair, record: "planning-parameter-set" });
  }
  return sets;
}
