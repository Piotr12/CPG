import { LINE_LOCATION_MESSAGE, ORDER_LINE_COUNT_MESSAGE } from "@cpg/core/validators/purchasing/purchasing-fields.schema";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { byId, enteredAs, errorFormatter, fieldErrorFormatter, ordersLabels } from "./labels";

const materials = byId([{ id: "00000001", type: "raw" as const, description: "Steel", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 }]);
const line = { line: 1, material: "00000001", quantity: "500.000000", enteredQuantity: "0.5", enteredUnit: "t", numerator: "1000", denominator: "1", plannedDate: "2027-03-03", requisition: null, received: "0.000000", abandoned: "0.000000", outstanding: "500.000000", status: "open" as const, posted: false };

describe("purchase-order labels", () => {
  it("leave the server-side headings out and merge the screens' errors over the shared ones", () => {
    const labels = ordersLabels(en);
    expect(labels).not.toHaveProperty("heading");
    expect(labels).not.toHaveProperty("detailHeading");
    expect(labels.errors).toMatchObject({ VALIDATION_FAILED: "Some fields are invalid.", REQUISITION_OVER_CONVERTED: expect.any(String) });
  });

  it("hold no function at any depth, the Change date strings included, so the whole set can reach a client component", () => {
    const functions = (node: unknown): boolean =>
      typeof node === "function" || (typeof node === "object" && node !== null && Object.values(node).some(functions));
    expect(functions(ordersLabels(en))).toBe(false);
    expect(functions(ordersLabels(pl))).toBe(false);
    expect(Object.values(ordersLabels(pl).changeDate).every((text) => typeof text === "string" && text !== "")).toBe(true);
  });

  it("translate an error by its code, and keep the server's message for an unknown one", () => {
    const format = errorFormatter(ordersLabels(pl));
    expect(format({ code: "SUPPLIER_INACTIVE", message: "x" })).toBe(pl.purchaseOrders.errors.SUPPLIER_INACTIVE);
    expect(format({ code: "SOMETHING_NEW", message: "As the server said." })).toBe("As the server said.");
  });

  it("translate the shared and the service's field messages, and pass others through", () => {
    const format = fieldErrorFormatter(ordersLabels(pl));
    expect(format(ORDER_LINE_COUNT_MESSAGE)).toBe(pl.purchaseOrders.fieldErrors.lines);
    expect(format(LINE_LOCATION_MESSAGE)).toBe(pl.purchaseOrders.fieldErrors.lineLocation);
    expect(format("Something new.")).toBe("Something new.");
  });

  it("say how a line was entered when not in the base unit (MAT-019), and nothing when it was", () => {
    expect(enteredAs(line, materials, ordersLabels(en))).toBe("0.5 t at 1 t = 1000 kg");
    expect(enteredAs({ ...line, enteredUnit: "kg" }, materials, ordersLabels(en))).toBe("");
  });
});
