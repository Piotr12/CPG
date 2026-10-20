/** An inclusive validity period of ISO `YYYY-MM-DD` dates; `validThrough` null means no end (spec Q4). */
export interface Validity {
  validFrom: string;
  validThrough: string | null;
}

/** One alternative competing for a priority: a BOM's current revision (spec Q7). */
export interface Alternative extends Validity {
  bom: string;
  priority: number;
}

/** The days two periods share: from and through, both included; `through` null when neither ends. */
export interface SharedDays {
  from: string;
  through: string | null;
}

/** The alternative a candidate clashes with, and the days they share. */
export interface PriorityConflict {
  bom: string;
  days: SharedDays;
}

/**
 * The days `a` and `b` share, or null when they share none. Both ends are inclusive, so a period
 * through 31 March overlaps one from 31 March, and one through 31 January doesn't overlap one from
 * 1 February (BOM-013, BOM-015, BOM-017). ISO dates compare correctly as text.
 */
export function validityOverlap(a: Validity, b: Validity): SharedDays | null {
  const from = a.validFrom > b.validFrom ? a.validFrom : b.validFrom;
  const through = earlierEnd(a.validThrough, b.validThrough);
  if (through !== null && through < from) return null;
  return { from, through };
}

/**
 * The first of `alternatives` (another BOM with the same priority) whose period shares a day with
 * `candidate`'s, or null (R04, BOM-015…019). The caller passes the current revisions of the active
 * BOMs for the same output; the candidate's own BOM is skipped.
 */
export function findPriorityConflict(candidate: Alternative, alternatives: readonly Alternative[]): PriorityConflict | null {
  for (const alternative of alternatives) {
    if (alternative.bom === candidate.bom || alternative.priority !== candidate.priority) continue;
    const days = validityOverlap(candidate, alternative);
    if (days) return { bom: alternative.bom, days };
  }
  return null;
}

function earlierEnd(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a < b ? a : b;
}
