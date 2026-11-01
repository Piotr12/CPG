/** The validity window of a BOM revision: from `validFrom` through `validThrough`, open-ended when `null` (R04). */
export interface RevisionValidity {
  validFrom: string;
  validThrough?: string | null;
}

/**
 * Whether a revision is valid on `date` (ISO), both ends included. A BOM to make with is an active
 * BOM whose **current** revision passes this check: the production dialog (`resolveProductionOptions`)
 * and MRP's Missing BOM check (E16-S03) both use it, so they can't drift.
 */
export function isRevisionValidOn({ validFrom, validThrough }: RevisionValidity, date: string): boolean {
  return validFrom <= date && (validThrough === null || validThrough === undefined || date <= validThrough);
}
