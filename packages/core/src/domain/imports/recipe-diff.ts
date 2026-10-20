/** One line of a recipe as the import compares it: a component and its base quantity in its base unit. */
export interface DiffLine {
  material: string;
  /** The stored base quantity, six decimals. */
  quantity: string;
  /** The component's base unit. */
  unit: string;
}

/** A component that an import adds, removes or changes: its quantity before and after, null when absent. */
export interface LineChange {
  material: string;
  before: string | null;
  after: string | null;
}

const amount = ({ quantity, unit }: DiffLine) => `${quantity} ${unit}`;

/**
 * What an imported recipe changes, component by component (spec `2026-10-20--0908UTC-master-data-bom-import`,
 * XLS-021, XLS-025): added and changed components in the new recipe's order, then the removed ones in
 * the old recipe's order. A component with the same base quantity is no change, whatever its order.
 */
export function recipeDiff(before: readonly DiffLine[], after: readonly DiffLine[]): LineChange[] {
  const old = new Map(before.map((line) => [line.material, line]));
  const kept = new Set(after.map((line) => line.material));
  const changes: LineChange[] = [];
  for (const line of after) {
    const previous = old.get(line.material);
    if (previous?.quantity === line.quantity) continue;
    changes.push({ material: line.material, before: previous ? amount(previous) : null, after: amount(line) });
  }
  for (const line of before) {
    if (!kept.has(line.material)) changes.push({ material: line.material, before: amount(line), after: null });
  }
  return changes;
}
