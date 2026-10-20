import { STOCK_QUANTITY_MESSAGE, STOCK_REASON_MESSAGE } from "@cpg/core/validators/stock/stock-correction.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import type { Messages } from "../../i18n/messages/en";
export type StockLabels = Omit<Messages["stock"], "errors"> & { errors: Record<string, string> };
/** Everything passed to the correction client is plain translated data. */
export function stockLabels(messages: Messages): StockLabels {
  return { ...messages.stock, errors: { ...messages.errors, ...messages.stock.errors } };
}
export function stockFieldError(labels: StockLabels) {
  const known: Record<string, string> = {
    [STOCK_QUANTITY_MESSAGE]: labels.fieldErrors.quantity,
    [STOCK_REASON_MESSAGE]: labels.fieldErrors.reason,
    [UNIT_FORMAT_MESSAGE]: labels.fieldErrors.unit,
  };
  return (message: string) => known[message] ?? message;
}
