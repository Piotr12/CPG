import { expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { MISSING_COMPONENT_MESSAGE } from "@cpg/core/validators/production-orders/production-completion.schema";
import { completionFieldError, productionLabels, productionFieldError } from "./labels";
it("keeps every label serializable and translates known field errors while preserving unknown context", () => {
  for (const messages of [en, pl]) {
    const labels = productionLabels(messages); expect(JSON.parse(JSON.stringify(labels))).toEqual(labels);
    expect(productionFieldError(labels)(CALENDAR_DATE_MESSAGE)).toBe(labels.invalidDate);
    expect(productionFieldError(labels)("specific server context")).toBe("specific server context");
    expect(labels.errors.TENANT_READ_ONLY).toBe(messages.errors.TENANT_READ_ONLY);
    expect(labels.picker).toEqual({ labels: expect.objectContaining({ refused: messages.lists.materialPicker.refused }), placeholder: messages.lists.materialPicker.placeholder });
    expect(completionFieldError(labels)(MISSING_COMPONENT_MESSAGE)).toBe(labels.completion.fieldErrors.missingComponent);
    const named = completionFieldError(labels)(MISSING_COMPONENT_MESSAGE, { material: "00000006, 00000007" });
    expect(named).toContain("00000006, 00000007");
    expect(named.startsWith(labels.completion.fieldErrors.missingComponent)).toBe(true);
    expect(completionFieldError(labels)(CALENDAR_DATE_MESSAGE, { material: "00000006" })).toBe(labels.invalidDate);
    expect(completionFieldError(labels)(CALENDAR_DATE_MESSAGE)).toBe(labels.invalidDate);
    expect(completionFieldError(labels)("specific server context")).toBe("specific server context");
    expect(labels.errors.INSUFFICIENT_STOCK).toBe(messages.errors.INSUFFICIENT_STOCK);
    expect(labels.errors.PRODUCTION_OVERPRODUCTION).toContain("{target}");
  }
});
it("calls a component outside the pinned recipe what the variance report calls it, on the form and in the history (#153)", () => {
  for (const messages of [en, pl]) {
    const { completion } = messages.productionOrders;
    const term = messages.varianceReport.extra;
    expect(completion.extra).toBe(term);
    expect(completion.inputLine.startsWith(`${term} `)).toBe(true);
    expect(completion.removeInput).toContain(` ${term.toLowerCase()} `);
    expect(completion.fieldErrors.extraQuantity).toContain(term.toLowerCase().slice(0, -1));
  }
});
it("names every production audit action and snapshot field in both languages", () => {
  for (const messages of [en, pl]) {
    expect(messages.audit.actions["production-orders.production-order.created"]).not.toContain("production-orders.");
    expect(messages.audit.actions["production-orders.production-order.updated"]).not.toContain("production-orders.");
    expect(messages.audit.actions["production-orders.production-order.progressed"]).not.toContain("production-orders.");
    expect(messages.audit.actions["production-orders.production-completion.posted"]).not.toContain("production-orders.");
    expect(messages.audit.values.type["production-completion"]).not.toBe("production-completion");
    for (const name of ["plannedFinish", "plannedStart", "produced", "abandoned"] as const) expect(messages.audit.fields[name]).not.toBe(name);
    expect(messages.audit.fields.bom).toBe("BOM");
  }
});
