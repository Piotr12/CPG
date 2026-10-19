import { describe, expect, it } from "vitest";
import { materialCreateSchema } from "./material-create.schema";

describe("materialCreateSchema", () => {
  it("accepts a type, a description and a base unit, trimmed", () => {
    expect(materialCreateSchema.parse({ type: "raw", description: " Bolt M8 ", baseUnit: " each " })).toEqual({
      type: "raw",
      description: "Bolt M8",
      baseUnit: "each",
    });
  });

  it("names every missing field, so nothing partial is created (MAT-005, MAT-008)", () => {
    const result = materialCreateSchema.safeParse({});

    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(["baseUnit", "description", "type"]);
  });

  it("drops an ID sent by the client: the server assigns it (R01)", () => {
    expect(materialCreateSchema.parse({ id: "00000009", type: "raw", description: "x", baseUnit: "kg" })).not.toHaveProperty(
      "id",
    );
  });
});
