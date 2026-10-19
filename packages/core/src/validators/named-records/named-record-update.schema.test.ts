import { describe, expect, it } from "vitest";
import { ID_IMMUTABLE_MESSAGE, NOTHING_TO_CHANGE_MESSAGE } from "./named-record-fields.schema";
import { namedRecordUpdateBodySchema, namedRecordUpdateSchema } from "./named-record-update.schema";

describe("namedRecordUpdateBodySchema", () => {
  it("takes a name, an active flag or both, at the loaded version", () => {
    expect(namedRecordUpdateBodySchema.parse({ version: 2, name: " New " })).toEqual({ version: 2, name: "New" });
    expect(namedRecordUpdateBodySchema.parse({ version: 1, active: false })).toEqual({ version: 1, active: false });
    expect(namedRecordUpdateBodySchema.parse({ version: 1, name: "n", active: true })).toEqual({
      version: 1,
      name: "n",
      active: true,
    });
  });

  it("refuses a body that changes nothing, a misspelt field included", () => {
    for (const body of [{ version: 1 }, { version: 1, nmae: "x" }]) {
      expect(namedRecordUpdateBodySchema.safeParse(body).error?.issues).toEqual([
        expect.objectContaining({ path: ["changes"], message: NOTHING_TO_CHANGE_MESSAGE }),
      ]);
    }
  });

  it("requires the version (API-029)", () => {
    expect(namedRecordUpdateBodySchema.safeParse({ name: "x" }).error?.issues[0]?.path).toEqual(["version"]);
  });

  it("refuses an ID in the body with an actionable message", () => {
    expect(namedRecordUpdateBodySchema.safeParse({ id: "00000009", version: 1, active: true }).error?.issues).toEqual([
      expect.objectContaining({ path: ["id"], message: ID_IMMUTABLE_MESSAGE }),
    ]);
  });
});

describe("namedRecordUpdateSchema", () => {
  it("adds the record's eight-digit ID, bound by the page", () => {
    expect(namedRecordUpdateSchema.parse({ recordId: "00000002", version: 3, active: false })).toEqual({
      recordId: "00000002",
      version: 3,
      active: false,
    });
    expect(namedRecordUpdateSchema.safeParse({ recordId: "2", version: 3, active: false }).success).toBe(false);
    expect(namedRecordUpdateSchema.safeParse({ recordId: "00000002", version: 3 }).success).toBe(false);
  });
});
