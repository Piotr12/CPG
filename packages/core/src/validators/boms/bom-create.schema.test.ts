import { describe, expect, it } from "vitest";
import { bomCreateBodySchema, bomCreateFormSchema, bomRecipeFormSchema } from "./bom-create.schema";
import { VALID_THROUGH_BEFORE_FROM_MESSAGE } from "./bom-fields.schema";

const COMPONENTS = [{ material: "00000004", quantity: "4", unit: "each" }];

describe("bomCreateBodySchema", () => {
  it("takes an output and a first recipe, with no end when validThrough is left out", () => {
    expect(bomCreateBodySchema.parse({ output: "00000005", priority: 1, validFrom: "2026-01-01", components: COMPONENTS })).toEqual({
      output: "00000005",
      priority: 1,
      validFrom: "2026-01-01",
      validThrough: null,
      components: COMPONENTS,
    });
  });

  it("refuses a valid-through date before valid-from", () => {
    const result = bomCreateBodySchema.safeParse({
      output: "00000005",
      priority: 1,
      validFrom: "2026-02-01",
      validThrough: "2026-01-01",
      components: COMPONENTS,
    });
    expect(result.error?.issues.map(({ path, message }) => [path.join("."), message])).toEqual([
      ["validThrough", VALID_THROUGH_BEFORE_FROM_MESSAGE],
    ]);
  });
});

describe("the recipe forms", () => {
  it("read the priority as text and an empty valid-through as no end", () => {
    const form = { priority: "2", validFrom: "2026-01-01", validThrough: "", components: COMPONENTS };
    expect(bomRecipeFormSchema.parse(form)).toEqual({ ...form, priority: 2, validThrough: null });
    expect(bomCreateFormSchema.parse({ ...form, output: "00000005" })).toMatchObject({ output: "00000005", priority: 2 });
  });

  it("keep the dates check after adding the output", () => {
    const form = { output: "00000005", priority: "2", validFrom: "2026-02-01", validThrough: "2026-01-01", components: COMPONENTS };
    expect(bomCreateFormSchema.safeParse(form).success).toBe(false);
  });
});
