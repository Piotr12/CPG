import { StockBalance, type EntityManager } from "@cpg/db";
import type { MrpStock } from "../../../domain/mrp/mrp-inputs";
import { parseDecimal } from "../../../domain/quantities/decimal";
import type { SnapshotCodes } from "./codes";

/**
 * Today's physical on-hand of every pair with a balance row, zero included (#273 Q1), in one partial
 * read: there is at most one row per pair. A balance is never negative (R09), so it parses as a plain
 * decimal. In-transit stock belongs to its transfer and is never physical.
 */
export async function readStock(em: EntityManager, codes: SnapshotCodes): Promise<MrpStock[]> {
  const rows = await em.find(StockBalance, {}, { fields: ["material", "location", "quantity"], disableIdentityMap: true });
  return rows.map(({ material, location, quantity }) => ({
    material: codes.materials.get(material.id)!,
    location: codes.locations.get(location.id)!,
    physical: parseDecimal(quantity)!,
  }));
}
