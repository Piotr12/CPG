import { formatSequentialId, nextSequentialId, SEQUENTIAL_ID_DIGITS } from "../business-ids/sequential-id";

/** Digits of a material ID (R01: eight digits, zero-padded). */
export const MATERIAL_ID_DIGITS = SEQUENTIAL_ID_DIGITS;

/** A material number as its ID: 1 → `"00000001"`. */
export const formatMaterialCode = formatSequentialId;

/**
 * The ID after the tenant's highest one, or `"00000001"` in an empty tenant (MAT-001, MAT-002).
 * Materials are never deleted, so the highest + 1 is never an ID used before (R01).
 */
export function nextMaterialCode(highest: string | null): string {
  return nextSequentialId(highest, {
    code: "MATERIAL_IDS_EXHAUSTED",
    message: "This tenant has used every eight-digit material ID.",
  });
}
