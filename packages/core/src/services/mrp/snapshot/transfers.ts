import { Transfer, type DocumentState, type EntityManager } from "@cpg/db";
import type { MrpTransfer } from "../../../domain/mrp/mrp-inputs";
import { parseDecimal } from "../../../domain/quantities/decimal";
import type { SnapshotCodes } from "./codes";

/**
 * The Open transfers dispatching before `before` (the day after the horizon), overdue ones included
 * (#277), in one partial read through the `(tenant, status, code)` list index. A transfer dispatching
 * later arrives later still, so neither leg reaches a bucket. Only an Open transfer can have stock in
 * transit (`TRANSFER_IN_TRANSIT`), so no closed one is needed.
 */
export async function readTransfers(em: EntityManager, codes: SnapshotCodes, before: string): Promise<MrpTransfer[]> {
  const transfers = await em.find(
    Transfer,
    { status: "open" },
    {
      fields: ["code", "material", "source", "destination", "quantity", "dispatched", "received", "writtenOff", "abandoned", "plannedDispatch", "plannedArrival", "status"],
      disableIdentityMap: true,
    },
  );
  return transfers
    .filter(({ plannedDispatch }) => plannedDispatch < before)
    .map((transfer) => ({
      transfer: transfer.code,
      material: codes.materials.get(transfer.material.id)!,
      source: codes.locations.get(transfer.source.id)!,
      destination: codes.locations.get(transfer.destination.id)!,
      plannedDispatch: transfer.plannedDispatch,
      plannedArrival: transfer.plannedArrival,
      quantity: parseDecimal(transfer.quantity)!,
      dispatched: parseDecimal(transfer.dispatched)!,
      received: parseDecimal(transfer.received)!,
      writtenOff: parseDecimal(transfer.writtenOff)!,
      abandoned: parseDecimal(transfer.abandoned)!,
      // A plain string column holding the shared lifecycle's states (`TRANSFER_STATUSES`).
      status: transfer.status as DocumentState,
    }));
}
