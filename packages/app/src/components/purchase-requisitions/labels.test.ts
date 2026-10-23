import { UNIT_NOT_CONVERTIBLE_MESSAGE } from "@cpg/core/validators/boms/bom-fields.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { byId, errorFormatter, fieldErrorFormatter, requisitionsLabels } from "./labels";

describe("requisition labels", () => {
  it("leave the server-side heading out and merge the screen's errors over the shared ones", () => {
    const labels = requisitionsLabels(en);
    expect(labels).not.toHaveProperty("heading");
    expect(labels.errors).toMatchObject({
      VALIDATION_FAILED: "Some fields are invalid.",
      REQUISITION_ID_RACE: "Another purchase requisition was created at the same moment. Try again.",
    });
  });

  it("hold no function at any depth, the Change date strings included, so the whole set can reach a client component", () => {
    const functions = (node: unknown): boolean =>
      typeof node === "function" || (typeof node === "object" && node !== null && Object.values(node).some(functions));
    expect(functions(requisitionsLabels(en))).toBe(false);
    expect(functions(requisitionsLabels(pl))).toBe(false);
    expect(Object.values(requisitionsLabels(pl).changeDate).every((text) => typeof text === "string" && text !== "")).toBe(true);
  });

  it("translate an error by its code, and keep the server's message for an unknown one", () => {
    const format = errorFormatter(requisitionsLabels(pl));
    expect(format({ code: "LOCATION_INACTIVE", message: "x" })).toBe(pl.purchaseRequisitions.errors.LOCATION_INACTIVE);
    expect(format({ code: "SOMETHING_NEW", message: "As the server said." })).toBe("As the server said.");
  });

  it("translate the shared and the service's field messages, and pass others through", () => {
    const format = fieldErrorFormatter(requisitionsLabels(pl));
    expect(format(CALENDAR_DATE_MESSAGE)).toBe(pl.purchaseRequisitions.fieldErrors.date);
    expect(format(UNIT_NOT_CONVERTIBLE_MESSAGE)).toBe(pl.purchaseRequisitions.fieldErrors.unitNotConvertible);
    expect(format("Something new.")).toBe("Something new.");
  });

  it("index records by their business ID", () => {
    expect(byId([{ id: "00000001", name: "A" }]).get("00000001")).toEqual({ id: "00000001", name: "A" });
  });
});
