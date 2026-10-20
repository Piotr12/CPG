import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { SHIPMENT_LINE_ORDER_MESSAGE, SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE } from "@cpg/core/validators/shipments/shipment.schema";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { errorFormatter, shipmentFieldErrorFormatter, shipmentsLabels } from "./labels";

describe("shipment labels", () => {
  it("hold no function, and merge the dialog's errors over the shared ones", () => {
    const labels = shipmentsLabels(en);
    expect(Object.entries(labels).filter(([, value]) => typeof value === "function")).toEqual([]);
    expect(labels.errors).toMatchObject({ VALIDATION_FAILED: "Some fields are invalid.", CUSTOMER_ORDER_NOT_OPEN: en.shipments.errors.CUSTOMER_ORDER_NOT_OPEN });
  });

  it("translate an error by its code, and the schemas' and service's field messages, passing unknown ones through", () => {
    const labels = shipmentsLabels(pl);
    expect(errorFormatter(labels)({ code: "SHIPMENT_ID_RACE", message: "x" })).toBe(pl.shipments.errors.SHIPMENT_ID_RACE);
    const format = shipmentFieldErrorFormatter(labels);
    expect(format(SHIPMENT_LINE_ORDER_MESSAGE)).toBe(pl.shipments.fieldErrors.lineOrder);
    expect(format(SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE)).toBe(pl.shipments.fieldErrors.outstanding);
    expect(format(CALENDAR_DATE_MESSAGE)).toBe(pl.shipments.fieldErrors.date);
    expect(format("Something new.")).toBe("Something new.");
  });
});
