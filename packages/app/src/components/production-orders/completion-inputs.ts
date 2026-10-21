import type { MaterialSummary, ProductionOrderDetail } from "@cpg/core";
import { materialChoices } from "../purchase-requisitions/choices";
import type { CompletionInputChoice } from "./completion-form";

/**
 * The materials Post completion offers as added inputs (spec Q5): active raw or intermediate ones that
 * are neither the order's output nor already in its pinned recipe, each with the units it may be
 * entered in, its base unit first (the shared `materialChoices`). The service checks the same rules again.
 */
export function completionInputs(order: ProductionOrderDetail, materials: MaterialSummary[], units: Record<string, string[]>): CompletionInputChoice[] {
  const allowed = materials.filter((material) => material.type !== "finished" && material.id !== order.output && !order.components.some(({ material: pinned }) => pinned === material.id));
  return materialChoices(allowed, units);
}
