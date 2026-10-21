import { RECEIPT_LINE_ORDER_MESSAGE } from "@cpg/core/validators/goods-receipts/goods-receipt.schema";
import { LINE_NO_SUCH_LINE_MESSAGE } from "@cpg/core/validators/purchasing/purchasing-fields.schema";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { byId } from "../purchase-orders/labels";
import { errorFormatter, fieldErrorFormatter, receiptLineChoices, receiptsLabels } from "./labels";

const material = (id: string, description: string, baseUnit: string) => ({ id, type: "raw" as const, description, baseUnit, active: true, createdAt: new Date(), version: 1 });
const line = (number: number, materialId: string, outstanding: string) => ({
  line: number,
  material: materialId,
  quantity: "100.000000",
  enteredQuantity: "100",
  enteredUnit: "kg",
  numerator: "1",
  denominator: "1",
  plannedDate: "2027-03-03",
  requisition: null,
  received: "0.000000", abandoned: "0.000000",
  outstanding,
  status: "open" as const,
});
const ORDER = {
  id: "00000001",
  supplier: "00000001",
  location: "00000001",
  status: "open" as const,
  lines: [line(1, "00000001", "70.000000"), line(2, "00000002", "0.000000")],
  createdAt: new Date(),
  version: 1,
};

describe("goods-receipt labels", () => {
  it("hold no function, and merge the dialog's errors over the shared ones", () => {
    const labels = receiptsLabels(en);
    expect(Object.entries(labels).filter(([, value]) => typeof value === "function")).toEqual([]);
    expect(labels.errors).toMatchObject({ VALIDATION_FAILED: "Some fields are invalid.", PURCHASE_ORDER_NOT_OPEN: en.goodsReceipts.errors.PURCHASE_ORDER_NOT_OPEN });
  });

  it("translate an error by its code, and the service's field messages, passing unknown ones through", () => {
    const labels = receiptsLabels(pl);
    expect(errorFormatter(labels)({ code: "RECEIPT_ID_RACE", message: "x" })).toBe(pl.goodsReceipts.errors.RECEIPT_ID_RACE);
    const format = fieldErrorFormatter(labels);
    expect(format(RECEIPT_LINE_ORDER_MESSAGE)).toBe(pl.goodsReceipts.fieldErrors.lineOrder);
    expect(format(LINE_NO_SUCH_LINE_MESSAGE)).toBe(pl.goodsReceipts.fieldErrors.noSuchLine);
    expect(format("Something new.")).toBe("Something new.");
  });

  it("excludes abandoned lines while retaining completed lines for overreceipt", () => {
    const materials = byId([material("00000001", "Steel", "kg")]);
    const lines = (["open", "completed", "cancelled", "closed-early"] as const).map((status, index) => ({ ...line(index + 1, "00000001", "0.000000"), status }));
    expect(receiptLineChoices({ ...ORDER, lines }, materials, {}, receiptsLabels(en)).map(({ line }) => line)).toEqual([1, 2]);
  });

  it("offer every line of the order with its material, outstanding and units, a received one too (BUY-015)", () => {
    const materials = byId([material("00000001", "Steel sheet", "kg"), material("00000002", "Bolt M8", "each")]);

    expect(receiptLineChoices(ORDER, materials, { "00000001": ["kg", "t"] }, receiptsLabels(en))).toEqual([
      { line: 1, label: "Line 1: 00000001 Steel sheet", outstanding: "70 kg outstanding", units: ["kg", "t"] },
      // A material missing from the units map can still be received in its base unit.
      { line: 2, label: "Line 2: 00000002 Bolt M8", outstanding: "0 each outstanding", units: ["each"] },
    ]);
  });
});
