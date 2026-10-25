import { convertToBase, ONE, parseDecimal } from "../quantities/decimal";
import { isStatisticalUnit, STATISTICAL_UNIT } from "../../validators/units/unit-registry";

/** A conversion factor in micro-units: `1 unit = numerator / denominator` base units. */
export interface ReportFactor {
  numerator: bigint;
  denominator: bigint;
}

/** What a report knows of a material to show its quantities in another unit (#239). */
export interface ReportMaterial {
  code: string;
  baseUnit: string;
  /** Its conversions as stored: `1 unit = numerator / denominator` base units, decimal strings. */
  conversions: { unit: string; numerator: string; denominator: string }[];
}

/** Why a report leaves a material out of an SU total: it has no SU factor yet. */
export const NO_STATISTICAL_FACTOR = "NO_STATISTICAL_FACTOR";

/** The base unit 1:1. */
const SAME: ReportFactor = { numerator: ONE, denominator: ONE };

/**
 * `base` (micro-units of the base unit) in the unit `factor` converts: `base × denominator ÷
 * numerator`, half-up once to six decimals, the same rounding as every conversion (R03), away from
 * zero for a negative total as for a positive one. A report converts each material's total once and
 * adds the converted totals; it never adds base quantities across materials.
 */
export function fromBase(base: bigint, factor: ReportFactor): bigint {
  // `convertToBase` rounds half-up only for amounts ≥ 0: BigInt division truncates toward zero.
  if (base < 0n) return -fromBase(-base, factor);
  return convertToBase(base, factor.denominator, factor.numerator);
}

/**
 * The material's SU factor, or `null` when it has none, so a report leaves it out of SU totals and
 * names it (`NO_STATISTICAL_FACTOR`). A material whose base unit is SU, stored before the unit
 * registry, counts 1:1.
 */
export function statisticalFactor(material: ReportMaterial): ReportFactor | null {
  if (isStatisticalUnit(material.baseUnit)) return SAME;
  return factorOf(material, STATISTICAL_UNIT);
}

/**
 * The units a report filtered to `selected` materials may show (#239, spec Q5): with none selected
 * (meaning all of them) or two or more, only SU, even when they share a base unit; with exactly one,
 * its base unit, its other conversions' units in order, and SU when it has a factor. The default is
 * the base unit for one material and SU otherwise.
 */
export function reportUnits(selected: readonly ReportMaterial[]): { units: string[]; defaultUnit: string } {
  if (selected.length !== 1) return { units: [STATISTICAL_UNIT], defaultUnit: STATISTICAL_UNIT };
  const [material] = selected;
  const others = material.conversions
    .map(({ unit }) => unit)
    .filter((unit) => !isStatisticalUnit(unit))
    .sort();
  // A base unit SU is listed once, as the base unit: such a material can't also have an SU conversion.
  const statistical = factorOf(material, STATISTICAL_UNIT) !== null ? [STATISTICAL_UNIT] : [];
  return { units: [material.baseUnit, ...others, ...statistical], defaultUnit: material.baseUnit };
}

/**
 * The unit a report shows: `requested` when the selection allows it, otherwise the default, so a
 * `unit=` left over from an earlier selection quietly becomes the default. The report says which unit it used.
 */
export function resolveReportUnit(requested: string | undefined, selected: readonly ReportMaterial[]): string {
  const { units, defaultUnit } = reportUnits(selected);
  return requested !== undefined && units.includes(requested) ? requested : defaultUnit;
}

function factorOf(material: ReportMaterial, unit: string): ReportFactor | null {
  const conversion = material.conversions.find((candidate) => candidate.unit === unit);
  if (!conversion) return null;
  return { numerator: parseDecimal(conversion.numerator)!, denominator: parseDecimal(conversion.denominator)! };
}
