import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import type { Messages } from "../../i18n/messages/en";

export type ProductionLabels = Messages["productionOrders"] & { errors: Record<string, string> };
export function productionLabels(messages: Messages): ProductionLabels {
  return { ...messages.productionOrders, errors: { ...messages.errors, ...messages.productionOrders.errors } };
}
export function productionFieldError(labels: ProductionLabels) {
  const known: Record<string, string> = {
    [CALENDAR_DATE_MESSAGE]: labels.invalidDate,
    [UNIT_FORMAT_MESSAGE]: labels.invalidUnit,
    [POSITIVE_QUANTITY_MESSAGE]: labels.invalidQuantity,
    "The planned start must fit a four-digit calendar year.": labels.invalidStart,
    "The component requirement is too large to store.": labels.requirementOverflow,
    "The target cannot be less than the quantity already produced.": labels.belowProduced,
  };
  return (message: string) => known[message] ?? message;
}
