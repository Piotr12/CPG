import { formatDecimal, parseDecimal } from "../quantities/decimal";
import { formatSignedQuantity, parseSignedQuantity } from "../stock/signed-quantity";

/** One stored line of a counted completion, as the report reads it: six-decimal base-unit text (R03). */
export interface TallyLine {
  /** Whatever identifies the material while tallying (its UUID); `figures` turns it into the business ID. */
  material: string;
  /** The line's place in its completion: pinned components first, in recipe order. */
  position: number;
  extra: boolean;
  expected: string;
  actual: string;
  /** Signed: actual − expected, as the completion stored it. */
  variance: string;
}

/** One component's figures summed over an order's counted completions, as six-decimal strings (spec Q3). */
export interface VarianceComponentFigures {
  /** The material's business ID. */
  material: string;
  extra: boolean;
  expected: string;
  actual: string;
  /** Signed. */
  variance: string;
  /** The part of `actual` posted by zero-output completions (spec Q4, PRD-018). */
  waste: string;
}

/** An order's figures over its counted completions (spec Q2–Q4). */
export interface VarianceOrderFigures {
  produced: string;
  /** Signed: produced − target; null when only part of the order's output is in view (spec Q2). */
  outputVariance: string | null;
  completions: number;
  wasteCompletions: number;
  components: VarianceComponentFigures[];
}

interface ComponentTally {
  material: string;
  position: number;
  extra: boolean;
  expected: bigint;
  actual: bigint;
  variance: bigint;
  waste: bigint;
}

const fixed = (micro: bigint) => formatDecimal(micro, { fixed: true });

/** Business IDs are fixed-width digits, so plain comparison orders them; a tally never holds a material twice. */
const compare = (a: string, b: string) => (a < b ? -1 : 1);

/**
 * One order's counted completions, summed as their lines are read (spec Q2–Q4, Q8), so the report never
 * holds an order's lines at once. Every stored figure is summed as it was recorded, never recomputed
 * from the recipe. A zero-output completion is a waste posting: it produces nothing, and its actuals
 * also count as each component's waste.
 */
export class OrderTally {
  private produced = 0n;
  private completions = 0;
  private wasteCompletions = 0;
  private readonly components = new Map<string, ComponentTally>();

  /** Counts a completion of `quantity` output base units; returns whether it is a waste posting. */
  addCompletion(quantity: string): boolean {
    const output = parseDecimal(quantity)!;
    this.produced += output;
    this.completions += 1;
    if (output === 0n) this.wasteCompletions += 1;
    return output === 0n;
  }

  /** Adds one line of a counted completion; `waste` says whether that completion produced nothing. */
  addLine(line: TallyLine, waste: boolean): void {
    let tally = this.components.get(line.material);
    if (!tally) {
      tally = { material: line.material, position: line.position, extra: line.extra, expected: 0n, actual: 0n, variance: 0n, waste: 0n };
      this.components.set(line.material, tally);
    }
    const actual = parseDecimal(line.actual)!;
    tally.expected += parseDecimal(line.expected)!;
    tally.actual += actual;
    tally.variance += parseSignedQuantity(line.variance)!;
    if (waste) tally.waste += actual;
  }

  /**
   * The order's figures against `target`. `codeOf` gives a tallied material's business ID; pinned
   * components come first in recipe order, then extra inputs by material ID (spec Q3). `partial` says
   * a date range shows only part of the output, so no output variance is given (spec Q2).
   */
  figures(target: string, codeOf: (material: string) => string, { partial }: { partial: boolean }): VarianceOrderFigures {
    const components = [...this.components.values()].map((tally) => ({ ...tally, material: codeOf(tally.material) }));
    components.sort((a, b) => Number(a.extra) - Number(b.extra) || (a.extra ? compare(a.material, b.material) : a.position - b.position));
    return {
      produced: fixed(this.produced),
      outputVariance: partial ? null : formatSignedQuantity(this.produced - parseDecimal(target)!),
      completions: this.completions,
      wasteCompletions: this.wasteCompletions,
      components: components.map(({ material, extra, expected, actual, variance, waste }) => ({
        material,
        extra,
        expected: fixed(expected),
        actual: fixed(actual),
        variance: formatSignedQuantity(variance),
        waste: fixed(waste),
      })),
    };
  }
}
