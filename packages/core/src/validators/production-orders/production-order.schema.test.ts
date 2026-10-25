import { expect, it } from "vitest";
import { PLANNED_START_YEAR_MESSAGE, REQUIREMENT_OVERFLOW_MESSAGE, TARGET_BELOW_PRODUCED_MESSAGE, productionOrderCreateSchema, productionOrderListSchema, productionOrderOptionsSchema, productionOrderUpdateSchema, productionOrderUpdateActionSchema } from "./production-order.schema";

const input = { output: "00000001", location: "00000002", quantity: "12", unit: "each", plannedFinish: "2028-02-29" };
it("validates positive quantities, references, units and real dates and pairs an explicit recipe", () => {
  expect(productionOrderOptionsSchema.parse(input)).toEqual({ ...input, quantity: "12.000000" });
  expect(productionOrderCreateSchema.parse({ ...input, bom: "00000003", revision: 3 })).toMatchObject({ bom: "00000003", revision: 3 });
  for (const change of [{ bom: "00000003" }, { revision: 1 }, { revision: 0, bom: "00000003" }, { quantity: "0" }, { quantity: 2 }, { quantity: "1e3" }, { unit: "" }, { output: "x" }, { location: "x" }, { plannedFinish: "2027-02-29" }, { status: "completed" }]) {
    expect(productionOrderCreateSchema.safeParse({ ...input, ...change }).success).toBe(false);
  }
  expect(productionOrderUpdateSchema.parse({ version: 1 })).toEqual({ version: 1 });
  expect(productionOrderUpdateActionSchema.parse({ version: 1, orderId: "00000001", quantity: "2", unit: "case", plannedFinish: "2027-01-01" })).toMatchObject({ quantity: "2.000000" });
});
it("refuses locked or unknown edit fields instead of silently dropping them", () => {
  for (const field of ["output", "location", "bom", "revision", "status", "produced", "abandoned", "plannedStart", "leadTimeDays", "id", "unknown"]) {
    expect(productionOrderUpdateSchema.safeParse({ version: 1, [field]: "changed" }).success).toBe(false);
  }
  expect(productionOrderUpdateSchema.safeParse({ version: 0 }).success).toBe(false);
  expect(productionOrderListSchema.parse({})).toEqual({ page: 1 });
  expect(productionOrderListSchema.parse({ page: "2" })).toEqual({ page: 2 });
  for (const query of [{ page: 0 }, { page: 1.5 }, { page: 1_000_001 }, { extra: true }]) expect(productionOrderListSchema.safeParse(query).success).toBe(false);
});
it("keeps the English texts of the messages screens translate by exact match (#251)", () => {
  expect(PLANNED_START_YEAR_MESSAGE).toBe("The planned start must fit a four-digit calendar year.");
  expect(REQUIREMENT_OVERFLOW_MESSAGE).toBe("The component requirement is too large to store.");
  expect(TARGET_BELOW_PRODUCED_MESSAGE).toBe("The target cannot be less than the quantity already produced.");
});
