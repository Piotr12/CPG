import { Transfer, type EntityManager, type Material, type NamedRecord } from "@cpg/db";
import { inTransitOf } from "../../domain/transfers/transfer-quantity";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";
import { ConflictError } from "../../http/errors";

/*
 * What the masters and the stock page may ask about transfers: a leaf module, so `LocationService`,
 * `MaterialService` and `StockService` check it without importing `TransferService`.
 */

/** How many transfers one read of `transitAt` holds at a time, so its identity map stays bounded. */
const BATCH = 100;

/** The lowest-numbered Open transfer from or to `location`; null when none. */
async function openTransferAt(em: EntityManager, location: NamedRecord): Promise<string | null> {
  const [from] = await em.find(Transfer, { source: location.id, status: "open" }, { orderBy: { code: "asc" }, limit: 1 });
  const [to] = await em.find(Transfer, { destination: location.id, status: "open" }, { orderBy: { code: "asc" }, limit: 1 });
  const codes = [from?.code, to?.code].filter((code): code is string => code !== undefined).sort();
  return codes[0] ?? null;
}

/**
 * Refuses deactivating a location that an Open transfer leaves from or goes to (LFC-017, LFC-018):
 * stock in transit from or to it, or still to dispatch. Runs in the location's edit transaction.
 */
export async function assertNoOpenTransfersAt(em: EntityManager, location: NamedRecord): Promise<void> {
  const transfer = await openTransferAt(em, location);
  if (transfer !== null) {
    throw new ConflictError(`Transfer ${transfer} is still Open from or to this location.`, "LOCATION_HAS_OPEN_TRANSFERS", { transfer });
  }
}

/** Refuses deactivating a material an Open transfer moves (PRD §06: no deactivation with in-transit stock). */
export async function assertNoOpenTransfersOf(em: EntityManager, material: Material): Promise<void> {
  const [transfer] = await em.find(Transfer, { material, status: "open" }, { orderBy: { code: "asc" }, limit: 1 });
  if (transfer) {
    throw new ConflictError(`Transfer ${transfer.code} of this material is still Open, so it can't be deactivated.`, "MATERIAL_IN_OPEN_TRANSFER", {
      transfer: transfer.code,
    });
  }
}

/** Whether any transfer holds a quantity of `material`: they are stored in its base unit, which then can't change. */
export async function hasTransfers(em: EntityManager, material: Material): Promise<boolean> {
  return (await em.count(Transfer, { material })) > 0;
}

/** What is in transit of `material` on Open transfers from `location` (`from`) and to it (`to`), six decimals (UX-017). */
export async function transitAt(em: EntityManager, material: Material, location: NamedRecord): Promise<{ from: string; to: string }> {
  return {
    from: await transitSum(em, { material, source: location.id }),
    to: await transitSum(em, { material, destination: location.id }),
  };
}

async function transitSum(em: EntityManager, where: { material: Material; source?: string; destination?: string }): Promise<string> {
  let total = 0n;
  let after: string | undefined;
  for (;;) {
    const batch = await em.find(
      Transfer,
      { ...where, status: "open", ...(after === undefined ? {} : { code: { $gt: after } }) },
      { orderBy: { code: "asc" }, limit: BATCH, disableIdentityMap: true },
    );
    for (const transfer of batch) total += parseDecimal(inTransitOf(transfer))!;
    if (batch.length < BATCH) return formatDecimal(total, { fixed: true });
    after = batch.at(-1)!.code;
  }
}
