/** One "output uses component" edge of a BOM's current revision. */
export interface RecipeEdge {
  /** The BOM whose recipe this is. */
  bom: string;
  output: string;
  component: string;
}

/** The recipe being saved. `bom` is null for a BOM that has no ID yet. */
export interface SavedRecipe {
  bom: string | null;
  output: string;
  components: readonly string[];
}

/** One step of a cycle: from `from` to `to`, through the recipe of `bom`. */
export interface CycleStep {
  from: string;
  to: string;
  bom: string | null;
}

/**
 * The cycle `saved` would close, as the steps from its output back to that output, or null (R04,
 * BOM-024, BOM-025). `edges` are the other BOMs' current revisions; the saved BOM's own old edges
 * must not be among them, since the new recipe replaces them. The search is breadth-first from
 * each component in order, so the path is a shortest one; a component equal to the output is the
 * one-step cycle.
 */
export function findCycle(edges: readonly RecipeEdge[], saved: SavedRecipe): CycleStep[] | null {
  const outgoing = new Map<string, RecipeEdge[]>();
  for (const edge of edges) {
    if (edge.bom === saved.bom) continue;
    outgoing.set(edge.output, [...(outgoing.get(edge.output) ?? []), edge]);
  }
  for (const component of saved.components) {
    const back = pathTo(outgoing, component, saved.output);
    if (back) return [{ from: saved.output, to: component, bom: saved.bom }, ...back];
  }
  return null;
}

/** The steps from `start` to `goal` along `outgoing`, shortest first; empty when they are the same material. */
function pathTo(outgoing: Map<string, RecipeEdge[]>, start: string, goal: string): CycleStep[] | null {
  const reachedBy = new Map<string, RecipeEdge | null>([[start, null]]);
  const queue = [start];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (next === goal) return stepsTo(reachedBy, goal);
    for (const edge of outgoing.get(next) ?? []) {
      if (reachedBy.has(edge.component)) continue;
      reachedBy.set(edge.component, edge);
      queue.push(edge.component);
    }
  }
  return null;
}

function stepsTo(reachedBy: Map<string, RecipeEdge | null>, goal: string): CycleStep[] {
  const steps: CycleStep[] = [];
  for (let edge = reachedBy.get(goal); edge; edge = reachedBy.get(edge.output)) {
    steps.unshift({ from: edge.output, to: edge.component, bom: edge.bom });
  }
  return steps;
}
