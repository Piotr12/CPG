import { ConflictError } from "../../http/errors";

/** Digits of a material ID (R01: eight digits, zero-padded). */
export const MATERIAL_ID_DIGITS = 8;
/** The last ID eight digits can hold. */
const LAST_NUMBER = 10 ** MATERIAL_ID_DIGITS - 1;

/** A material number as its ID: 1 → `"00000001"`. */
export function formatMaterialCode(number: number): string {
  return String(number).padStart(MATERIAL_ID_DIGITS, "0");
}

/**
 * The ID after the tenant's highest one, or `"00000001"` in an empty tenant (MAT-001, MAT-002).
 * Materials are never deleted, so the highest + 1 is never an ID used before (R01).
 */
export function nextMaterialCode(highest: string | null): string {
  const next = highest === null ? 1 : Number(highest) + 1;
  if (next > LAST_NUMBER) {
    throw new ConflictError("This tenant has used every eight-digit material ID.", "MATERIAL_IDS_EXHAUSTED");
  }
  return formatMaterialCode(next);
}
