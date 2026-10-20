import { expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { productionLabels, productionFieldError } from "./labels";
it("keeps every label serializable and translates known field errors while preserving unknown context", () => {
  for (const messages of [en, pl]) {
    const labels = productionLabels(messages); expect(JSON.parse(JSON.stringify(labels))).toEqual(labels);
    expect(productionFieldError(labels)(CALENDAR_DATE_MESSAGE)).toBe(labels.invalidDate);
    expect(productionFieldError(labels)("specific server context")).toBe("specific server context");
    expect(labels.errors.TENANT_READ_ONLY).toBe(messages.errors.TENANT_READ_ONLY);
  }
});
it("names every production audit action and snapshot field in both languages", () => {
  for (const messages of [en, pl]) {
    expect(messages.audit.actions["production-orders.production-order.created"]).not.toContain("production-orders.");
    expect(messages.audit.actions["production-orders.production-order.updated"]).not.toContain("production-orders.");
    for (const name of ["plannedFinish", "plannedStart", "produced", "abandoned"] as const) expect(messages.audit.fields[name]).not.toBe(name);
    expect(messages.audit.fields.bom).toBe("BOM");
  }
});
