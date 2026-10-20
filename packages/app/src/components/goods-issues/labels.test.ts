import { ISSUE_LINE_SHIPMENT_MESSAGE, ISSUE_QUANTITY_MESSAGE } from "@cpg/core/validators/goods-issues/goods-issue.schema";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { errorFormatter, issueFieldErrorFormatter, issuesLabels } from "./labels";

describe("goods-issue labels", () => {
  it("hold no function, and merge the dialog's errors over the shared ones", () => {
    const labels = issuesLabels(en);
    expect(Object.entries(labels).filter(([, value]) => typeof value === "function")).toEqual([]);
    expect(labels.errors).toMatchObject({ VALIDATION_FAILED: "Some fields are invalid.", SHIPMENT_NOT_OPEN: en.goodsIssues.errors.SHIPMENT_NOT_OPEN });
  });

  it("translate an error by its code, keeping a refusal's context, and the service's field messages (INV-005)", () => {
    const labels = issuesLabels(pl);
    const params = { material: "00000005", location: "00000001", available: "10.000000", requested: "11.000000", unit: "each" };
    expect(errorFormatter(labels)({ code: "INSUFFICIENT_STOCK", message: "x", params })).toBe("Materiał 00000005 w lokalizacji 00000001: dostępne 10.000000 each; wymagane 11.000000 each.");
    const format = issueFieldErrorFormatter(labels);
    expect(format(ISSUE_QUANTITY_MESSAGE)).toBe(pl.goodsIssues.fieldErrors.toIssue);
    expect(format(ISSUE_LINE_SHIPMENT_MESSAGE)).toBe(pl.goodsIssues.fieldErrors.lineShipment);
    expect(format("Something new.")).toBe("Something new.");
  });
});
