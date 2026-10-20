import { describe, expect, it } from "vitest";
import { BOM_ID_IMMUTABLE_MESSAGE, BOM_OUTPUT_IMMUTABLE_MESSAGE, VALID_THROUGH_BEFORE_FROM_MESSAGE } from "./bom-fields.schema";
import { bomActiveSchema, bomRecipeUpdateSchema, bomUpdateBodySchema, NOTHING_TO_CHANGE_MESSAGE } from "./bom-update.schema";

const issues = (input: unknown) =>
  bomUpdateBodySchema.safeParse(input).error?.issues.map(({ path, message }) => [path.join("."), message]);

describe("bomUpdateBodySchema", () => {
  it("takes any recipe field and the active flag, and null to remove the end", () => {
    expect(bomUpdateBodySchema.parse({ version: 2, validThrough: null })).toEqual({ version: 2, validThrough: null });
    expect(bomUpdateBodySchema.parse({ version: 2, active: false, priority: 3 })).toEqual({ version: 2, active: false, priority: 3 });
  });

  it("refuses a body that changes nothing", () => {
    expect(issues({ version: 2 })).toEqual([["changes", NOTHING_TO_CHANGE_MESSAGE]]);
  });

  it("refuses an ID or an output in the body rather than ignoring it", () => {
    expect(issues({ version: 2, id: "00000009", active: true })).toEqual([["id", BOM_ID_IMMUTABLE_MESSAGE]]);
    expect(issues({ version: 2, output: "00000001", active: true })).toEqual([["output", BOM_OUTPUT_IMMUTABLE_MESSAGE]]);
  });

  it("checks the dates when both are sent", () => {
    expect(issues({ version: 2, validFrom: "2026-02-01", validThrough: "2026-01-01" })).toEqual([
      ["validThrough", VALID_THROUGH_BEFORE_FROM_MESSAGE],
    ]);
  });
});

describe("the BOM actions' schemas", () => {
  it("bind the BOM and its version to the recipe form", () => {
    const input = {
      bomId: "00000002",
      version: 1,
      priority: "1",
      validFrom: "2026-01-01",
      validThrough: "",
      components: [{ material: "00000004", quantity: "4", unit: "each" }],
    };
    expect(bomRecipeUpdateSchema.parse(input)).toMatchObject({ bomId: "00000002", version: 1, priority: 1, validThrough: null });
    expect(bomRecipeUpdateSchema.safeParse({ ...input, bomId: "2" }).success).toBe(false);
  });

  it("take the new active flag", () => {
    expect(bomActiveSchema.parse({ bomId: "00000002", version: 3, active: false })).toEqual({ bomId: "00000002", version: 3, active: false });
  });
});
