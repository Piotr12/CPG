import { describe, expect, it } from "vitest";
import { setUserActiveSchema } from "./set-user-active.schema";

const USER_ID = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";

describe("setUserActiveSchema", () => {
  it("accepts a user id and a boolean", () => {
    expect(setUserActiveSchema.parse({ userId: USER_ID, active: false })).toEqual({ userId: USER_ID, active: false });
  });

  it("rejects a string flag, which a form would send by mistake", () => {
    expect(setUserActiveSchema.safeParse({ userId: USER_ID, active: "false" }).success).toBe(false);
  });
});
