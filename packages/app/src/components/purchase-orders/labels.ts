import type { MaterialSummary, NamedRecordView, OrderLineView } from "@cpg/core";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "@cpg/core/validators/boms/bom-fields.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { LOCATION_CHOICE_MESSAGE, MATERIAL_CHOICE_MESSAGE } from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import {
  LINE_LOCATION_MESSAGE,
  LINE_REQUISITION_LOCATION_MESSAGE,
  LINE_REQUISITION_MATERIAL_MESSAGE,
  ORDER_LINE_COUNT_MESSAGE,
  REQUISITION_CHOICE_MESSAGE,
  SUPPLIER_CHOICE_MESSAGE,
} from "@cpg/core/validators/purchasing/purchasing-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import { errorMessage } from "../../i18n/error-message";
import type { Messages } from "../../i18n/messages/en";
import { fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import { documentMaterialPicker, type DocumentMaterialPicker } from "../purchasing/material-picker";
import { byId } from "../purchase-requisitions/labels";

/**
 * The purchase-order screens' strings in the reader's language: plain strings, so they can reach
 * client components (the server-side headings stay behind). `errors` holds every code the screens can show.
 */
export type OrdersLabels = Omit<Messages["purchaseOrders"], "heading" | "detailHeading" | "errors"> & {
  errors: Record<string, string>;
  /** The form's material autocomplete (#217). */
  picker: DocumentMaterialPicker;
};

/** Builds the purchase-order screens' labels from a dictionary (server side, where `messages` is available). */
export function ordersLabels(messages: Messages): OrdersLabels {
  const labels: Partial<Messages["purchaseOrders"]> = { ...messages.purchaseOrders };
  delete labels.heading;
  delete labels.detailHeading;
  return {
    ...(labels as Omit<Messages["purchaseOrders"], "heading" | "detailHeading">),
    errors: { ...messages.errors, ...messages.purchaseOrders.errors },
    picker: documentMaterialPicker(messages),
  };
}

export { byId, fill, shownQuantity, type TenantContext };

/** An error envelope as the purchase-order screens say it, translated by code. */
export function errorFormatter(labels: Pick<OrdersLabels, "errors">) {
  return (error: { code: string; message: string }): string => errorMessage(labels.errors, error);
}

/** A field message from the shared schemas or the service in the reader's language; unknown ones pass through. */
export function fieldErrorFormatter(labels: OrdersLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [SUPPLIER_CHOICE_MESSAGE]: t.supplier,
    [LOCATION_CHOICE_MESSAGE]: t.location,
    [MATERIAL_CHOICE_MESSAGE]: t.material,
    [REQUISITION_CHOICE_MESSAGE]: t.requisition,
    [ORDER_LINE_COUNT_MESSAGE]: t.lines,
    [POSITIVE_QUANTITY_MESSAGE]: t.quantity,
    [UNIT_FORMAT_MESSAGE]: t.unit,
    [CALENDAR_DATE_MESSAGE]: t.date,
    [UNIT_NOT_CONVERTIBLE_MESSAGE]: t.unitNotConvertible,
    [QUANTITY_ROUNDS_TO_ZERO_MESSAGE]: t.roundsToZero,
    [QUANTITY_OUT_OF_RANGE_MESSAGE]: t.outOfRange,
    [LINE_LOCATION_MESSAGE]: t.lineLocation,
    [LINE_REQUISITION_MATERIAL_MESSAGE]: t.requisitionMaterial,
    [LINE_REQUISITION_LOCATION_MESSAGE]: t.requisitionLocation,
  };
  return (message: string): string => known[message] ?? message;
}

export type MaterialsById = Map<string, MaterialSummary>;
export type PartiesById = Map<string, NamedRecordView>;

/**
 * How a line was entered, when not in the base unit: "2 case at 1 case = 12 each". Empty for a line
 * entered in the base unit, where it would only repeat the quantity.
 */
export function enteredAs(line: OrderLineView, materials: MaterialsById, labels: OrdersLabels): string {
  const { baseUnit } = materials.get(line.material)!;
  if (line.enteredUnit === baseUnit) return "";
  const conversion = `${line.denominator} ${line.enteredUnit} = ${line.numerator} ${baseUnit}`;
  return fill(labels.lines.enteredAs, { quantity: line.enteredQuantity, unit: line.enteredUnit, conversion });
}
