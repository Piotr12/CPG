import type { MaterialSummary, ProductionOrderDetail } from "@cpg/core";
import type { CompletionInputChoice } from "./completion-form";

/**
 * The materials Post completion offers as added inputs (spec Q5): active raw or intermediate ones that
 * are neither the order's output nor already in its pinned recipe, each with the units it may be
 * entered in, its base unit first. The service checks the same rules again.
 */
export function completionInputs(order: ProductionOrderDetail, materials: MaterialSummary[], units: Record<string, string[]>): CompletionInputChoice[] {
  return materials
    .filter((material) => material.active && material.type !== "finished" && material.id !== order.output && !order.components.some(({ material: pinned }) => pinned === material.id))
    .map((material) => ({ id: material.id, label: `${material.id} ${material.description} (${material.baseUnit})`, units: units[material.id] ?? [material.baseUnit] }));
}
