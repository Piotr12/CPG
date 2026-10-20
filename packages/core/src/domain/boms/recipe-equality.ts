import { parseDecimal } from "../quantities/decimal";

/** What makes a recipe a recipe (spec Q6): the line order and the unit a line was entered in don't count. */
export interface RecipeContent {
  priority: number;
  validFrom: string;
  /** Null when the recipe has no end. */
  validThrough: string | null;
  /** Each component's material ID and its stored base quantity per one output base unit. */
  components: readonly { material: string; quantity: string }[];
}

/**
 * Whether `candidate` is the same recipe as `current` (R04, BOM-023): the same priority, the same
 * dates, and the same set of (material, base quantity). Only a recipe that differs makes a new
 * revision; entering 1 case where 12 each was stored is no change.
 */
export function isSameRecipe(current: RecipeContent, candidate: RecipeContent): boolean {
  if (
    current.priority !== candidate.priority ||
    current.validFrom !== candidate.validFrom ||
    current.validThrough !== candidate.validThrough ||
    current.components.length !== candidate.components.length
  ) {
    return false;
  }
  const quantities = new Map(current.components.map(({ material, quantity }) => [material, parseDecimal(quantity)]));
  return candidate.components.every(
    ({ material, quantity }) => quantities.has(material) && quantities.get(material) === parseDecimal(quantity),
  );
}
