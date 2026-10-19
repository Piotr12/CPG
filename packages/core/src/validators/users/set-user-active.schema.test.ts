import { describe, expect, it } from "vitest";
import { setUserActiveBodySchema, setUserActiveSchema } from "./set-user-active.schema";

const USER_ID = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";

describe("setUserActiveSchema", () => {
  it("accepts a user id, a boolean and the loaded version", () => {
    expect(setUserActiveSchema.parse({ userId: USER_ID, active: false, version: 3 })).toEqual({
      userId: USER_ID,
      active: false,
      version: 3,
    });
  });

  it("rejects a string flag, which a form would send by mistake", () => {
    expect(setUserActiveSchema.safeParse({ userId: USER_ID, active: "false", version: 1 }).success).toBe(false);
  });

  it("requires a whole, positive version (AUD-024)", () => {
    for (const version of [undefined, 0, 1.5, "1"]) {
      expect(setUserActiveSchema.safeParse({ userId: USER_ID, active: true, version }).error?.issues[0]?.path).toEqual([
        "version",
      ]);
    }
  });
});

describe("setUserActiveBodySchema", () => {
  it("is the API body: the flag and the version, with the id from the path", () => {
    expect(setUserActiveBodySchema.parse({ active: true, version: 2, userId: "ignored" })).toEqual({ active: true, version: 2 });
  });
});
