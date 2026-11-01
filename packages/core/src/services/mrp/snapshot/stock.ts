import { StockBalance, type EntityManager } from "@cpg/db";
import type { MrpStock } from "../../../domain/mrp/mrp-inputs";
import type { SnapshotCodes } from "./codes";
import { readRow, type UnreadableRows } from "./readable";

/**
 * Today's physical on-hand of every pair with a balance row, zero included (#273 Q1), in one partial
 * read: there is at most one row per pair. A balance is never negative (R09), so it parses as a plain
 * decimal; one that doesn't is left out and reported to `unreadable` (E16-S03). In-transit stock
 * belongs to its transfer and is never physical.
 */
export async function readStock(em: EntityManager, codes: SnapshotCodes, unreadable: UnreadableRows): Promise<MrpStock[]> {
  const rows = await em.find(StockBalance, {}, { fields: ["material", "location", "quantity"], disableIdentityMap: true });
  const stock: MrpStock[] = [];
  for (const row of rows) {
    const pair = { material: codes.materials.get(row.material.id)!, location: codes.locations.get(row.location.id)! };
    const read = readRow({ quantities: { quantity: row.quantity } });
    if (read) stock.push({ ...pair, physical: read.quantity });
    else unreadable.push({ ...pair, record: "stock-balance" });
  }
  return stock;
}
