import { findCycle, type CycleStep, type RecipeEdge } from "../../boms/find-cycle";
import type { MrpBom } from "../mrp-inputs";
import { compareCodes } from "../projection/pairs";

/** The order MRP plans materials in, and the cycles it never explodes (E17-S01). */
export interface BomLevels {
  /**
   * Each material's low-level code: 0 for one that is no BOM's component, otherwise one more than the
   * deepest of its outputs. Only materials on an edge are listed; any other material is level 0.
   */
  levelOf: ReadonlyMap<string, number>;
  /** Each material on a cycle, with a shortest cycle through it: `M1 →(BOM B1) M2 →(BOM B2) M1`. */
  cycles: ReadonlyMap<string, string>;
}

/**
 * The low-level codes and cycles of `boms`, the current revisions of the active BOMs whatever their
 * validity (PRD §04 "Multilevel explosion", #281 spec Q3, Q7). Every "output uses component" edge
 * counts, so a component plans after every output any of its BOMs could explode into it.
 *
 * The BOM service refuses a cycle at entry (R04, BOM-024), so a cycle here was written around it. A
 * material is on a cycle when its strongly connected component has two members or more, or an edge to
 * itself. Each one's path is the shortest of `findCycle`'s, the service's own search, over each BOM and
 * component in code order, so the result never depends on the snapshot's order. The cycle members' own edges are
 * dropped before levelling, so every level is finite (MRP-028). A member keeps the level its other
 * outputs give it, and never explodes (`replenishPair`).
 */
export function bomLevels(boms: readonly MrpBom[]): BomLevels {
  const edges: RecipeEdge[] = boms
    .flatMap(({ bom, output, components }) => components.map(({ material }) => ({ bom, output, component: material })))
    .sort((a, b) => compareCodes(a.output, b.output) || compareCodes(a.bom, b.bom) || compareCodes(a.component, b.component));
  const outgoing = new Map<string, string[]>();
  for (const { output, component } of edges) {
    const list = outgoing.get(output) ?? outgoing.set(output, []).get(output)!;
    list.push(component);
    if (!outgoing.has(component)) outgoing.set(component, []);
  }
  const materials = [...outgoing.keys()].sort(compareCodes);
  const cyclic = cyclicMaterials(materials, outgoing);
  const bomsOf = new Map<string, MrpBom[]>();
  for (const bom of [...boms].sort((a, b) => compareCodes(a.bom, b.bom))) (bomsOf.get(bom.output) ?? bomsOf.set(bom.output, []).get(bom.output)!).push(bom);
  const cycles = new Map<string, string>();
  for (const material of materials.filter((each) => cyclic.has(each))) {
    // `findCycle` returns the first component's cycle, not the shortest across them, so each BOM and
    // component is searched alone and the strictly shortest kept: ties go to the lowest BOM code, then
    // component code. A member reaches itself through one of its own BOMs, so some search finds one.
    let shortest: CycleStep[] | null = null;
    for (const { bom, components } of bomsOf.get(material)!) {
      for (const component of components.map((line) => line.material).sort(compareCodes)) {
        const steps = findCycle(edges, { bom, output: material, components: [component] });
        if (steps && (shortest === null || steps.length < shortest.length)) shortest = steps;
      }
    }
    cycles.set(material, cyclePath(shortest!));
  }
  return { levelOf: levels(materials, outgoing, cyclic), cycles };
}

/** `M1 →(BOM B1) M2 →(BOM B2) M1`: the BOM service's notation, without descriptions. */
function cyclePath(steps: readonly CycleStep[]): string {
  return [steps[0].from, ...steps.map(({ bom, to }) => `→(BOM ${bom}) ${to}`)].join(" ");
}

/**
 * The longest chain of edges above each material, over the edges whose output is on no cycle (Kahn's
 * algorithm on an acyclic graph, so every material is reached).
 */
function levels(materials: readonly string[], outgoing: ReadonlyMap<string, readonly string[]>, cyclic: ReadonlySet<string>): Map<string, number> {
  const kept = (output: string) => (cyclic.has(output) ? [] : outgoing.get(output)!);
  const incoming = new Map(materials.map((material) => [material, 0]));
  for (const output of materials) for (const component of kept(output)) incoming.set(component, incoming.get(component)! + 1);
  const level = new Map(materials.map((material) => [material, 0]));
  const ready = materials.filter((material) => incoming.get(material) === 0);
  for (let next = ready.pop(); next !== undefined; next = ready.pop()) {
    for (const component of kept(next)) {
      level.set(component, Math.max(level.get(component)!, level.get(next)! + 1));
      incoming.set(component, incoming.get(component)! - 1);
      if (incoming.get(component) === 0) ready.push(component);
    }
  }
  return level;
}

/**
 * The materials on a cycle: the members of every strongly connected component with two members or more,
 * or with an edge to itself. Tarjan's algorithm with an explicit stack, so a deep chain can't overflow.
 */
function cyclicMaterials(materials: readonly string[], outgoing: ReadonlyMap<string, readonly string[]>): Set<string> {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cyclic = new Set<string>();
  const visit = (material: string) => {
    index.set(material, index.size);
    low.set(material, index.get(material)!);
    stack.push(material);
    onStack.add(material);
  };
  for (const root of materials) {
    if (index.has(root)) continue;
    visit(root);
    const work = [{ material: root, edge: 0 }];
    while (work.length > 0) {
      const frame = work.at(-1)!;
      const targets = outgoing.get(frame.material)!;
      if (frame.edge < targets.length) {
        const target = targets[frame.edge];
        frame.edge += 1;
        if (!index.has(target)) {
          visit(target);
          work.push({ material: target, edge: 0 });
        } else if (onStack.has(target)) {
          low.set(frame.material, Math.min(low.get(frame.material)!, index.get(target)!));
        }
        continue;
      }
      work.pop();
      const parent = work.at(-1);
      if (parent) low.set(parent.material, Math.min(low.get(parent.material)!, low.get(frame.material)!));
      if (low.get(frame.material) !== index.get(frame.material)) continue;
      const members: string[] = [];
      for (let member = stack.pop()!; ; member = stack.pop()!) {
        onStack.delete(member);
        members.push(member);
        if (member === frame.material) break;
      }
      if (members.length > 1 || targets.includes(frame.material)) for (const member of members) cyclic.add(member);
    }
  }
  return cyclic;
}
