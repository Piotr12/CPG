import { QUANTITY_OUT_OF_RANGE_MESSAGE, QUANTITY_ROUNDS_TO_ZERO_MESSAGE, UNIT_NOT_CONVERTIBLE_MESSAGE } from "@cpg/core/validators/boms/bom-fields.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { DUPLICATE_LINE_MESSAGE } from "@cpg/core/validators/purchasing/purchasing-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import {
  ORDER_LINE_CHOICE_MESSAGE,
  SHIPMENT_LINE_COUNT_MESSAGE,
  SHIPMENT_LINE_ORDER_MESSAGE,
  SHIPMENT_NO_SUCH_LINE_MESSAGE,
  SHIPMENT_QUANTITY_ISSUED_MESSAGE,
  SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE,
} from "@cpg/core/validators/shipments/shipment.schema";
import type { Messages } from "../../i18n/messages/en";
import { errorFormatter, fill, shownQuantity } from "../forms/form-labels";

/** The shipment strings in the reader's language, all plain strings; `errors` holds every code the dialog can show. */
export type ShipmentsLabels = Omit<Messages["shipments"], "errors"> & { errors: Record<string, string> };

/** Builds the shipment labels from a dictionary (server side, where `messages` is available). */
export function shipmentsLabels(messages: Messages): ShipmentsLabels {
  return { ...messages.shipments, errors: { ...messages.errors, ...messages.shipments.errors } };
}

export { errorFormatter, fill, shownQuantity };

/** A field message from the shared schemas or the service in the reader's language; unknown ones pass through. */
export function shipmentFieldErrorFormatter(labels: ShipmentsLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [POSITIVE_QUANTITY_MESSAGE]: t.quantity,
    [UNIT_FORMAT_MESSAGE]: t.unit,
    [UNIT_NOT_CONVERTIBLE_MESSAGE]: t.unitNotConvertible,
    [QUANTITY_ROUNDS_TO_ZERO_MESSAGE]: t.roundsToZero,
    [QUANTITY_OUT_OF_RANGE_MESSAGE]: t.outOfRange,
    [CALENDAR_DATE_MESSAGE]: t.date,
    [SHIPMENT_LINE_ORDER_MESSAGE]: t.lineOrder,
    [SHIPMENT_NO_SUCH_LINE_MESSAGE]: t.noSuchLine,
    [SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE]: t.outstanding,
    [SHIPMENT_QUANTITY_ISSUED_MESSAGE]: t.issued,
    [DUPLICATE_LINE_MESSAGE]: t.duplicateLine,
    [ORDER_LINE_CHOICE_MESSAGE]: t.orderLine,
    [SHIPMENT_LINE_COUNT_MESSAGE]: t.lines,
  };
  return (message: string): string => known[message] ?? message;
}
