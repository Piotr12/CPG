import { ORDER_UNIT_CONVERSION_MESSAGE, ORDER_QUANTITY_CONVERSION_MESSAGE, ORDER_LINE_COUNT_MESSAGE, ORDER_LINE_ID_MESSAGE, ORDER_QUANTITY_MIN_MESSAGE, ORDER_REFERENCE_MESSAGE } from "@cpg/core/validators/customer-orders/customer-order.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import type { AutocompleteLabels } from "@cpg/ui/backend/forms/autocomplete";
import type { Messages } from "../../i18n/messages/en";
import { materialPickerLabels } from "../materials/material-picker";

export type OrderLabels = Omit<Messages["customerOrders"], "errors"> & {
  errors: Record<string, string>;
  /** The lines' material picker (#217). */
  picker: { labels: AutocompleteLabels; placeholder: string };
};
/** Plain data only: this dictionary crosses the server/client boundary. */
export function orderLabels(messages: Messages): OrderLabels {
  return { ...messages.customerOrders, errors: { ...messages.errors, ...messages.customerOrders.errors },
    picker: { labels: materialPickerLabels(messages.lists), placeholder: messages.lists.materialPicker.placeholder } };
}
export function orderFieldError(labels: OrderLabels, message: string): string {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [ORDER_UNIT_CONVERSION_MESSAGE]: t.unit, [ORDER_QUANTITY_CONVERSION_MESSAGE]: t.conversion, [ORDER_REFERENCE_MESSAGE]: t.reference, [POSITIVE_QUANTITY_MESSAGE]: t.quantity, [CALENDAR_DATE_MESSAGE]: t.date,
    [UNIT_FORMAT_MESSAGE]: t.unit, [ORDER_LINE_COUNT_MESSAGE]: t.lines, [ORDER_LINE_ID_MESSAGE]: t.id, [ORDER_QUANTITY_MIN_MESSAGE]: t.minimum,
  };
  return known[message] ?? message;
}
