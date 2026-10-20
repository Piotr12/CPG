import { describe, expect, it } from "vitest";
import { ORDER_UNIT_CONVERSION_MESSAGE, ORDER_QUANTITY_CONVERSION_MESSAGE, ORDER_LINE_COUNT_MESSAGE, ORDER_LINE_ID_MESSAGE, ORDER_QUANTITY_MIN_MESSAGE, ORDER_REFERENCE_MESSAGE } from "@cpg/core/validators/customer-orders/customer-order.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { orderFieldError, orderLabels } from "./labels";
describe("customer order labels", () => {
  it("passes plain serializable dictionaries to client components", () => {
    for (const messages of [en, pl]) {
      const labels = orderLabels(messages);
      expect(JSON.parse(JSON.stringify(labels))).toEqual(labels); expect(labels.errors.TENANT_READ_ONLY).toBe(messages.errors.TENANT_READ_ONLY);
    }
  });
  it("translates each known field message and preserves unknown detail", () => {
    const labels = orderLabels(pl); const t = labels.fieldErrors;
    for (const [message, expected] of [[ORDER_UNIT_CONVERSION_MESSAGE,t.unit], [ORDER_QUANTITY_CONVERSION_MESSAGE,t.conversion], [ORDER_REFERENCE_MESSAGE,t.reference], [POSITIVE_QUANTITY_MESSAGE,t.quantity], [CALENDAR_DATE_MESSAGE,t.date],
      [UNIT_FORMAT_MESSAGE,t.unit], [ORDER_LINE_COUNT_MESSAGE,t.lines], [ORDER_LINE_ID_MESSAGE,t.id], [ORDER_QUANTITY_MIN_MESSAGE,t.minimum], ["unknown", "unknown"]])
      expect(orderFieldError(labels,message)).toBe(expected);
  });
});
