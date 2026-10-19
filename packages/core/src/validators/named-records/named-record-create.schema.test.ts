import { describe, expect, it } from "vitest";
import { NAME_REQUIRED_MESSAGE } from "./named-record-fields.schema";
import { namedRecordCreateSchema } from "./named-record-create.schema";

describe("namedRecordCreateSchema", () => {
  it("takes a trimmed name and drops anything else, an ID included (spec Q2)", () => {
    expect(namedRecordCreateSchema.parse({ name: " Acme ", id: "00000009" })).toEqual({ name: "Acme" });
  });

  it("requires a name", () => {
    expect(namedRecordCreateSchema.safeParse({}).error?.issues).toEqual([
      expect.objectContaining({ path: ["name"], message: NAME_REQUIRED_MESSAGE }),
    ]);
  });
});
