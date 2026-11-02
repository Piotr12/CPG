import { isNothing, outstandingOf, type CustomerOrderView, type Locale, type ShipmentView } from "@cpg/core";
import type { LineQuantityChoice } from "../forms/line-quantities-form";
import type { MaterialsById } from "../purchase-orders/labels";
import { fill, localeQuantity, type ShipmentsLabels } from "./labels";

/*
 * Server side only: it reads `@cpg/core`, which a client component must never import (lesson
 * 2026-10-19). The order's page builds the Create shipment dialog's rows here and passes them down.
 */

/**
 * The lines of `order` a shipment can still plan: those with anything outstanding (spec Q3), each
 * named by its stable ID and numbered as the order's page lists it, with its outstanding in the
 * reader's locale as the hint (#304).
 */
export function shipmentLineChoices(order: CustomerOrderView, materials: MaterialsById, units: Record<string, string[]>, labels: ShipmentsLabels, locale: Locale): LineQuantityChoice[] {
  return order.lines.flatMap((line, index) => {
    const outstanding = outstandingOf(line);
    if (isNothing(outstanding)) return [];
    const { id, description, baseUnit } = materials.get(line.material)!;
    return [
      {
        key: line.id,
        label: fill(labels.create.line, { line: String(index + 1), material: `${id} ${description}` }),
        hint: fill(labels.create.outstanding, { outstanding: localeQuantity(outstanding, locale), baseUnit }),
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

/**
 * The Edit shipment dialog's rows (shipment edit spec Q8): the shipment's lines first, filled with what
 * was entered, then the order's other lines with anything outstanding, empty. Every row is named by its
 * order line, as create's are. A kept row always offers its stored unit, even one whose conversion has
 * since been removed, so it can be sent unchanged. Hints show figures in the reader's locale (#304);
 * a kept row's prefill stays the raw entered quantity, the form a field accepts.
 */
export function shipmentEditChoices(
  shipment: ShipmentView,
  order: CustomerOrderView,
  materials: MaterialsById,
  units: Record<string, string[]>,
  labels: ShipmentsLabels,
  locale: Locale,
): LineQuantityChoice[] {
  const t = labels.edit;
  const kept = shipment.lines.map((line): LineQuantityChoice => {
    const { id, description, baseUnit } = materials.get(line.material)!;
    const offered = units[line.material] ?? [baseUnit];
    const quantities = { quantity: localeQuantity(line.quantity, locale), issued: localeQuantity(line.issued, locale), baseUnit };
    return {
      key: line.orderLine,
      label: fill(t.line, { line: String(line.line), material: `${id} ${description}` }),
      hint: fill(isNothing(line.issued) ? t.planned : t.plannedIssued, quantities),
      units: offered.includes(line.enteredUnit) ? offered : [...offered, line.enteredUnit],
      initial: { quantity: line.enteredQuantity, unit: line.enteredUnit },
    };
  });
  const shipped = new Set(shipment.lines.map(({ orderLine }) => orderLine));
  const added = order.lines.flatMap((line, index): LineQuantityChoice[] => {
    const outstanding = outstandingOf(line);
    if (shipped.has(line.id) || isNothing(outstanding)) return [];
    const { id, description, baseUnit } = materials.get(line.material)!;
    return [
      {
        key: line.id,
        label: fill(t.orderLine, { line: String(index + 1), material: `${id} ${description}` }),
        hint: fill(t.outstanding, { outstanding: localeQuantity(outstanding, locale), baseUnit }),
        units: units[line.material] ?? [baseUnit],
      },
    ];
  });
  return [...kept, ...added];
}
