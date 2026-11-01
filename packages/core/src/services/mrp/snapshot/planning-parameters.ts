import { PlanningParameterSet, type EntityManager } from "@cpg/db";
import type { MrpPlanningParameters } from "../../../domain/mrp/mrp-inputs";
import { parseDecimal } from "../../../domain/quantities/decimal";
import type { SnapshotCodes } from "./codes";

/**
 * Every planning parameter set of the tenant, in one partial read (#278): there is one set per
 * material and location, so about as many rows as a run plans pairs. The material's type comes from
 * `readCodes`, so the read joins nothing.
 */
export async function readPlanningParameters(em: EntityManager, codes: SnapshotCodes): Promise<MrpPlanningParameters[]> {
  const rows = await em.find(
    PlanningParameterSet,
    {},
    { fields: ["material", "location", "procurement", "leadTimeDays", "minimumQuantity", "lotMultiple"], disableIdentityMap: true },
  );
  return rows.map(({ material, location, procurement, leadTimeDays, minimumQuantity, lotMultiple }) => ({
    material: codes.materials.get(material.id)!,
    location: codes.locations.get(location.id)!,
    materialType: codes.materialTypes.get(material.id)!,
    procurement,
    leadTimeDays,
    minimumQuantity: parseDecimal(minimumQuantity)!,
    lotMultiple: parseDecimal(lotMultiple)!,
  }));
}
