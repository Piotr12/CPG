import type { RequisitionView } from "@cpg/core";
import { fill, shownQuantity, type MaterialsById, type OrdersLabels } from "./labels";

/** An open requisition a line may convert, with the material and location it has to match. */
export interface RequisitionChoice {
  value: string;
  label: string;
  material: string;
  location: string;
}

/**
 * The requisitions an order line may convert: the Open ones, each labelled with how much is still
 * outstanding in its material's base unit (BUY-003, BUY-004). A completed one can't be converted.
 */
export function requisitionChoices(requisitions: RequisitionView[], materials: MaterialsById, labels: OrdersLabels): RequisitionChoice[] {
  return requisitions
    .filter(({ status }) => status === "open")
    .map(({ id, material, location, outstanding }) => ({
      value: id,
      label: fill(labels.form.requisitionOption, { id, outstanding: shownQuantity(outstanding), baseUnit: materials.get(material)!.baseUnit }),
      material,
      location,
    }));
}
