/** A material at a location, both by business ID: the unit MRP plans. */
export interface MrpPair {
  material: string;
  location: string;
}

/** One map key per material and location. */
export function pairKey(material: string, location: string): string {
  return `${material}\u0000${location}`;
}

/** Two business IDs or ISO dates in code-unit order: the same on every machine, unlike `localeCompare`. */
export function compareCodes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Pairs by material code, then location code. */
export function comparePairs(a: MrpPair, b: MrpPair): number {
  return compareCodes(a.material, b.material) || compareCodes(a.location, b.location);
}
