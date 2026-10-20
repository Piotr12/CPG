/** One material and location pair while the report is gathered: micro-units of the material's base unit (R03). */
export interface PairFigures {
  material: string;
  location: string;
  /** Physical on-hand at the location. */
  quantity: bigint;
  /** In transit on Open transfers from the location, and to it: the transfers', usable at neither site (UX-017). */
  inTransitFrom: bigint;
  inTransitTo: bigint;
}

type Figure = "quantity" | "inTransitFrom" | "inTransitTo";

/** The report's pairs by material and location, each figure summed as balances and transfers are read. */
export class PairTally {
  private readonly pairs = new Map<string, PairFigures>();

  add(material: string, location: string, figure: Figure, amount: bigint): void {
    const key = `${material}/${location}`;
    let pair = this.pairs.get(key);
    if (!pair) {
      pair = { material, location, quantity: 0n, inTransitFrom: 0n, inTransitTo: 0n };
      this.pairs.set(key, pair);
    }
    pair[figure] += amount;
  }

  values(): PairFigures[] {
    return [...this.pairs.values()];
  }
}

/** Business IDs are fixed-width digits, so plain comparison orders them. */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const isZero = ({ quantity, inTransitFrom, inTransitTo }: PairFigures) => quantity === 0n && inTransitFrom === 0n && inTransitTo === 0n;

/**
 * One page of the report (spec Q3, Q4): without `includeZero` a pair whose on-hand and both transit
 * figures are zero is left out; the rest are ordered by material ID, then location ID. `total` counts
 * every row the filters keep, on every page.
 */
export function reportPage(pairs: PairFigures[], { includeZero, page, pageSize }: { includeZero: boolean; page: number; pageSize: number }): { total: number; rows: PairFigures[] } {
  const kept = pairs
    .filter((pair) => includeZero || !isZero(pair))
    .sort((a, b) => compare(a.material, b.material) || compare(a.location, b.location));
  return { total: kept.length, rows: kept.slice((page - 1) * pageSize, page * pageSize) };
}
