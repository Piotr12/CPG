import { isNothing, outstandingOf, type CustomerOrderView } from "@cpg/core";
import type { LineQuantityChoice } from "../forms/line-quantities-form";
import type { MaterialsById } from "../purchase-orders/labels";
import { fill, shownQuantity, type ShipmentsLabels } from "./labels";

/*
 * Server side only: it reads `@cpg/core`, which a client component must never import (lesson
 * 2026-10-19). The order's page builds the Create shipment dialog's rows here and passes them down.
 */

/**
 * The lines of `order` a shipment can still plan: those with anything outstanding (spec Q3), each
 * named by its stable ID and numbered as the order's page lists it, with its outstanding as the hint.
 */
export function shipmentLineChoices(order: CustomerOrderView, materials: MaterialsById, units: Record<string, string[]>, labels: ShipmentsLabels): LineQuantityChoice[] {
  return order.lines.flatMap((line, index) => {
    const outstanding = outstandingOf(line);
    if (isNothing(outstanding)) return [];
    const { id, description, baseUnit } = materials.get(line.material)!;
    return [
      {
        key: line.id,
        label: fill(labels.create.line, { line: String(index + 1), material: `${id} ${description}` }),
        hint: fill(labels.create.outstanding, { outstanding: shownQuantity(outstanding), baseUnit }),
        units: units[line.material] ?? [baseUnit],
      },
    ];
  });
}

/** The first required date among the lines with anything outstanding: the Create shipment form's starting planned date. */
export function firstDueDate(order: CustomerOrderView): string {
  return order.lines
    .filter((line) => !isNothing(outstandingOf(line)))
    .map(({ requiredDate }) => requiredDate)
    .sort()[0];
}
