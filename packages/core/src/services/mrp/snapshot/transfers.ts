import { Transfer, type DocumentState, type EntityManager } from "@cpg/db";
import type { MrpTransfer } from "../../../domain/mrp/mrp-inputs";
import type { SnapshotCodes } from "./codes";
import { beforeCutOff, readRow, type UnreadableRows } from "./readable";

/**
 * The Open transfers dispatching before `before` (the day after the horizon), overdue ones included
 * (#277), in one partial read through the `(tenant, status, code)` list index. A transfer dispatching
 * later arrives later still, so neither leg reaches a bucket. Only an Open transfer can have stock in
 * transit (`TRANSFER_IN_TRANSIT`), so no closed one is needed. One that can't be read (E16-S03) is
 * left out and reported at its source and its destination: it would feed both.
 */
export async function readTransfers(em: EntityManager, codes: SnapshotCodes, before: string, unreadable: UnreadableRows): Promise<MrpTransfer[]> {
  const transfers = await em.find(
    Transfer,
    { status: "open" },
    {
      fields: [
        "code", "material", "source", "destination", "quantity", "dispatched", "received", "writtenOff", "abandoned",
        "numerator", "denominator", "plannedDispatch", "plannedArrival", "status",
      ],
      disableIdentityMap: true,
    },
  );
  const read: MrpTransfer[] = [];
  for (const transfer of transfers.filter(({ plannedDispatch }) => beforeCutOff(plannedDispatch, before))) {
    const material = codes.materials.get(transfer.material.id)!;
    const source = codes.locations.get(transfer.source.id)!;
    const destination = codes.locations.get(transfer.destination.id)!;
    const { quantity, dispatched, received, writtenOff, abandoned, plannedDispatch, plannedArrival } = transfer;
    const quantities = readRow({ quantities: { quantity, dispatched, received, writtenOff, abandoned }, factor: transfer, dates: [plannedDispatch, plannedArrival] });
    if (!quantities) {
      for (const location of [source, destination]) unreadable.push({ material, location, record: "transfer", document: transfer.code });
      continue;
    }
    // A plain string column holding the shared lifecycle's states (`TRANSFER_STATUSES`).
    read.push({ transfer: transfer.code, material, source, destination, plannedDispatch, plannedArrival, ...quantities, status: transfer.status as DocumentState });
  }
  return read;
}
