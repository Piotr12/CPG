import { describe, expect, it } from "vitest";
import { STOCK_QUANTITY_MESSAGE, STOCK_REASON_MESSAGE } from "@cpg/core/validators/stock/stock-correction.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { stockFieldError, stockLabels } from "./labels";
describe("stock labels", () => {
  it.each([en, pl])("translates validation and passes plain labels across the client boundary", (messages) => {
    const labels = stockLabels(messages); const field = stockFieldError(labels);
    expect(field(STOCK_QUANTITY_MESSAGE)).toBe(messages.stock.fieldErrors.quantity);
    expect(field(STOCK_REASON_MESSAGE)).toBe(messages.stock.fieldErrors.reason);
    expect(field(UNIT_FORMAT_MESSAGE)).toBe(messages.stock.fieldErrors.unit);
    expect(field("Unexpected")).toBe("Unexpected");
    const functions: string[] = [];
    JSON.stringify(labels, (key, value) => { if (typeof value === "function") functions.push(key); return value; });
    expect(functions).toEqual([]);
    expect(labels.errors.TENANT_READ_ONLY).toBe(messages.errors.TENANT_READ_ONLY);
    expect(labels.errors.UNIT_NOT_CONVERTIBLE).toBe(messages.stock.errors.UNIT_NOT_CONVERTIBLE);
    // The stock import reaches this code with SU too, so the text says SU can't be entered (#243).
    expect(labels.errors.UNIT_NOT_CONVERTIBLE).toContain("SU");
  });
  it("says why SU is refused in English (#243)", () => {
    expect(stockLabels(en).errors.UNIT_NOT_CONVERTIBLE).toBe("The unit has no conversion to this material's base unit. SU is for reports only.");
  });
});
