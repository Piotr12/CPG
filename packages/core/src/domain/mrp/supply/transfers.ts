import { inTransitMicro, undispatchedMicro } from "../../transfers/transfer-quantity";
import type { MrpTransfer } from "../mrp-inputs";
import type { MrpInsufficientTransferStock, MrpTransferMovement } from "../mrp-result";
import { compareCodes } from "../projection/pairs";
import { dependableBalance, type MrpLedger } from "../projection/project-buckets";

/** The legs `planTransfers` wrote into the ledgers, and the transfers their sources couldn't cover. */
export interface TransferPlan {
  dispatches: MrpTransferMovement[];
  receipts: MrpTransferMovement[];
  exceptions: MrpInsufficientTransferStock[];
}

/**
 * Projects the open `transfers` over the horizon `dates` (PRD §04 "Transfers", #277). Unlike the
 * other seams it writes `transferOut` and `transferIn` into the ledgers itself, because each check
 * depends on the moves before it; the caller only files the returned items. It must run after every
 * seam that adds demand or dependable supply, and before proposals.
 *
 * Stock in transit arrives at the destination on its planned arrival day, with no check: it already
 * left the source. The undispatched quantity is checked against the source's dependable balance at the
 * end of the dispatch day (Q2), one transfer at a time, by the day counted, the planned dispatch day,
 * then the transfer's ID (Q4). Only the feasible part leaves the source and reaches the destination;
 * a shortfall is an Insufficient Transfer Stock exception, and the transfer is never changed (R10, N06).
 * An overdue day moves to today and is kept on the item; a day after the horizon is in no bucket.
 * `ledgerOf` plans a source whenever its dispatch is checked, a destination only when it receives (Q9).
 */
export function planTransfers(
  transfers: readonly MrpTransfer[],
  dates: readonly string[],
  ledgerOf: (material: string, location: string) => MrpLedger,
): TransferPlan {
  const today = dates[0];
  const last = dates.at(-1)!;
  const dayOf = new Map(dates.map((date, day) => [date, day]));
  const counted = (date: string) => (date < today ? today : date);
  const plan: TransferPlan = { dispatches: [], receipts: [], exceptions: [] };
  const receive = (transfer: MrpTransfer, stage: MrpTransferMovement["stage"], quantity: bigint) => {
    const date = counted(transfer.plannedArrival);
    if (date > last) return;
    ledgerOf(transfer.material, transfer.destination).flows[dayOf.get(date)!].transferIn += quantity;
    plan.receipts.push(movement(transfer, transfer.destination, stage, transfer.plannedArrival, date, quantity, today));
  };

  const open = transfers.filter(({ status }) => status === "open");
  for (const transfer of open) {
    const inTransit = inTransitMicro(transfer.dispatched, transfer.received, transfer.writtenOff);
    if (inTransit > 0n) receive(transfer, "in-transit", inTransit);
  }
  const checks = open
    // An open transfer's `abandoned` is zero; closing one sets it from `received`, not `dispatched`.
    .map((transfer) => ({ transfer, planned: undispatchedMicro(transfer.quantity, transfer.dispatched), date: counted(transfer.plannedDispatch) }))
    .filter(({ planned, date }) => planned > 0n && date <= last)
    // By the planned dispatch day, then ID: the same order as by the day counted first (Q4), since an
    // overdue day counts today and every other day counts as planned.
    .sort((a, b) => compareCodes(a.transfer.plannedDispatch, b.transfer.plannedDispatch) || compareCodes(a.transfer.transfer, b.transfer.transfer));
  for (const { transfer, planned, date } of checks) {
    const source = ledgerOf(transfer.material, transfer.source);
    const day = dayOf.get(date)!;
    const balance = dependableBalance(source, day);
    const available = balance > 0n ? balance : 0n;
    const feasible = planned < available ? planned : available;
    if (feasible > 0n) {
      source.flows[day].transferOut += feasible;
      plan.dispatches.push(movement(transfer, transfer.source, "planned", transfer.plannedDispatch, date, feasible, today));
      receive(transfer, "planned", feasible);
    }
    if (feasible < planned) {
      const { transfer: code, material, source: from, destination } = transfer;
      plan.exceptions.push({ kind: "insufficient-transfer-stock", transfer: code, material, source: from, destination, date, planned, available });
    }
  }
  plan.dispatches.sort(byDateTransferStage);
  plan.receipts.sort(byDateTransferStage);
  plan.exceptions.sort((a, b) => compareCodes(a.date, b.date) || compareCodes(a.transfer, b.transfer));
  return plan;
}

function movement(
  { transfer, material }: MrpTransfer,
  location: string,
  stage: MrpTransferMovement["stage"],
  plannedDate: string,
  date: string,
  quantity: bigint,
  today: string,
): MrpTransferMovement {
  return { transfer, material, location, stage, plannedDate, date, quantity, overdue: plannedDate < today };
}

/** Legs by day, then transfer ID, then stage (in transit before planned), whatever the input order. */
function byDateTransferStage(a: MrpTransferMovement, b: MrpTransferMovement): number {
  return compareCodes(a.date, b.date) || compareCodes(a.transfer, b.transfer) || compareCodes(a.stage, b.stage);
}
