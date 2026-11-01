import type { MrpException } from "../mrp-result";
import { compareCodes } from "../projection/pairs";
import { mrpExceptionRank } from "./codes";

/** The location an exception belongs to: a transfer's source, every other exception's own pair. */
export function exceptionLocation(exception: MrpException): string {
  return exception.code === "INSUFFICIENT_TRANSFER_STOCK" ? exception.source : exception.location;
}

/**
 * The run's exception order (spec Q11), whatever the snapshot's order: by material, location, the code's
 * rank, the date (none first), then the transfer ID, all in code-unit order.
 */
export function compareExceptions(a: MrpException, b: MrpException): number {
  return (
    compareCodes(a.material, b.material) ||
    compareCodes(exceptionLocation(a), exceptionLocation(b)) ||
    mrpExceptionRank(a.code) - mrpExceptionRank(b.code) ||
    compareCodes(dateOf(a), dateOf(b)) ||
    compareCodes(transferOf(a), transferOf(b))
  );
}

const dateOf = (exception: MrpException) => ("date" in exception && exception.date !== undefined ? exception.date : "");
const transferOf = (exception: MrpException) => (exception.code === "INSUFFICIENT_TRANSFER_STOCK" ? exception.transfer : "");
