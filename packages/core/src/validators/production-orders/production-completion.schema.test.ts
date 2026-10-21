import { describe, expect, it } from "vitest";
import {
  COMPLETION_LINE_COUNT_MESSAGE,
  DUPLICATE_COMPLETION_MATERIAL_MESSAGE,
  productionCompletionActionSchema,
  productionCompletionCreateSchema,
  productionCompletionListSchema,
  productionCompletionPreviewSchema,
} from "./production-completion.schema";

const input = { quantity: "4.0", unit: "each", components: [{ material: "00000002", quantity: "2.000", unit: "kg" }, { material: "00000003", quantity: "0", unit: "each" }] };
const issues = (value: unknown) => {
  const result = productionCompletionCreateSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map(({ path, message }) => [path.join("."), message]);
};

describe("production completion schemas", () => {
  it("keeps entered quantities without trailing zeros, and accepts zero output and unused components (PRD-018)", () => {
    expect(productionCompletionCreateSchema.parse(input)).toEqual({
      quantity: "4",
      unit: "each",
      components: [{ material: "00000002", quantity: "2", unit: "kg" }, { material: "00000003", quantity: "0", unit: "each" }],
    });
    expect(productionCompletionCreateSchema.parse({ ...input, quantity: " 0 ", acceptOverproduction: true })).toMatchObject({ quantity: "0", acceptOverproduction: true });
  });
  it("refuses malformed quantities, references, units and JSON numbers", () => {
    for (const change of [{ quantity: "-1" }, { quantity: 4 }, { quantity: "1e3" }, { quantity: "0.0000001" }, { unit: "" }, { acceptOverproduction: "yes" }]) {
      expect(productionCompletionCreateSchema.safeParse({ ...input, ...change }).success).toBe(false);
    }
    expect(productionCompletionCreateSchema.safeParse({ ...input, components: [{ material: "x", quantity: "1", unit: "kg" }] }).success).toBe(false);
    expect(productionCompletionCreateSchema.safeParse({ ...input, components: [{ material: "00000002", quantity: "-1", unit: "kg" }] }).success).toBe(false);
  });
  it("refuses fields the server decides instead of silently dropping them", () => {
    for (const field of ["order", "businessDate", "expected", "variance", "location", "produced", "submission", "unknown"]) {
      expect(productionCompletionCreateSchema.safeParse({ ...input, [field]: "x" }).success).toBe(false);
    }
    for (const field of ["expected", "variance", "extra"]) {
      expect(productionCompletionCreateSchema.safeParse({ ...input, components: [{ ...input.components[0], [field]: "1" }] }).success).toBe(false);
    }
  });
  it("lists each material once and between 1 and 100 lines", () => {
    expect(issues({ ...input, components: [input.components[0], { ...input.components[0], quantity: "1" }] })).toEqual([["components.1.material", DUPLICATE_COMPLETION_MATERIAL_MESSAGE]]);
    expect(issues({ ...input, components: [] })).toEqual([["components", COMPLETION_LINE_COUNT_MESSAGE]]);
    const many = Array.from({ length: 101 }, (_, index) => ({ material: String(index + 1).padStart(8, "0"), quantity: "1", unit: "kg" }));
    expect(issues({ ...input, components: many })).toEqual([["components", COMPLETION_LINE_COUNT_MESSAGE]]);
    expect(productionCompletionCreateSchema.safeParse({ ...input, components: many.slice(0, 100) }).success).toBe(true);
    expect(issues({ ...input, components: "none" })).toEqual([["components", COMPLETION_LINE_COUNT_MESSAGE]]);
  });
  it("binds the order and a submission token for the server action (spec Q7)", () => {
    const submission = "11111111-1111-4111-8111-111111111111";
    expect(productionCompletionActionSchema.parse({ ...input, order: "00000001", submission })).toMatchObject({ order: "00000001", submission });
    expect(productionCompletionActionSchema.safeParse({ ...input, order: "00000001" }).success).toBe(false);
    expect(productionCompletionActionSchema.safeParse({ ...input, order: "x", submission }).success).toBe(false);
  });
  it("parses the preview and list queries strictly", () => {
    expect(productionCompletionPreviewSchema.parse({ quantity: "10.50", unit: "case" })).toEqual({ quantity: "10.5", unit: "case" });
    expect(productionCompletionPreviewSchema.safeParse({ quantity: "1", unit: "each", order: "00000001" }).success).toBe(false);
    expect(productionCompletionListSchema.parse({})).toEqual({ page: 1 });
    expect(productionCompletionListSchema.parse({ page: "3" })).toEqual({ page: 3 });
    for (const query of [{ page: 0 }, { page: "x" }, { extra: 1 }]) expect(productionCompletionListSchema.safeParse(query).success).toBe(false);
  });
});
