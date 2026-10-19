import { ConflictError } from "../../http/errors";

/** Digits of a sequential business ID (R01: eight digits, zero-padded). */
export const SEQUENTIAL_ID_DIGITS = 8;
/** The last ID eight digits can hold. */
const LAST_NUMBER = 10 ** SEQUENTIAL_ID_DIGITS - 1;

/** What a kind's sequence says when it has used every ID. */
export interface IdsExhausted {
  code: string;
  message: string;
}

/** A number as its business ID: 1 → `"00000001"`. */
export function formatSequentialId(number: number): string {
  return String(number).padStart(SEQUENTIAL_ID_DIGITS, "0");
}

/**
 * The ID after the highest one of its kind in the tenant, or `"00000001"` when there is none. A kind
 * whose records are never deleted never gets an ID that was used before (R01); past the last ID it
 * throws `exhausted` as a 409.
 */
export function nextSequentialId(highest: string | null, exhausted: IdsExhausted): string {
  const next = highest === null ? 1 : Number(highest) + 1;
  if (next > LAST_NUMBER) throw new ConflictError(exhausted.message, exhausted.code);
  return formatSequentialId(next);
}
