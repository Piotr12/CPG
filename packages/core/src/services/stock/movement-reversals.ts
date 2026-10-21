import { StockMovement, StockReversal, type EntityManager } from "@cpg/db";

/** Reads only links touching the requested movements, never the whole ledger. */
export async function movementReversals(em: EntityManager, ids: readonly string[]): Promise<StockReversal[]> {
  const links: StockReversal[] = [];
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    links.push(...await em.find(StockReversal, { $or: [{ original: { $in: batch } }, { inverse: { $in: batch } }] }, { populate: ["original"] }));
  }
  return links;
}

export interface DocumentMovement { movementId: string | null; reversedBy: string | null }
export const NO_MOVEMENT: DocumentMovement = { movementId: null, reversedBy: null };

/** Existing unpaged receipt reads retain their shape, but every enrichment query stays bounded. */
export async function documentMovements(em: EntityManager, type: string, postings: readonly string[]): Promise<Map<string, DocumentMovement>> {
  const result = new Map<string, DocumentMovement>();
  for (let start = 0; start < postings.length; start += 100) {
    const movements = await em.find(StockMovement, { type, postingId: { $in: postings.slice(start, start + 100) } });
    const links = await movementReversals(em, movements.map(({ id }) => id));
    const reversed = new Map(links.map(({ original, inverse }) => [original.id, inverse.id]));
    for (const movement of movements) result.set(`${movement.postingId}:${movement.position}`, { movementId: movement.id, reversedBy: reversed.get(movement.id) ?? null });
  }
  return result;
}
