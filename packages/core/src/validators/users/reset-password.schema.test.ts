import { describe, expect, it } from "vitest";
import { newPasswordSchema, resetPasswordBodySchema, resetPasswordSchema } from "./reset-password.schema";

const USER_ID = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";

describe("resetPasswordSchema", () => {
  it("accepts a user id, a long enough password and the loaded version", () => {
    expect(resetPasswordSchema.parse({ userId: USER_ID, password: "new password 1", version: 1 })).toEqual({
      userId: USER_ID,
      password: "new password 1",
      version: 1,
    });
  });

  it("rejects a short password, a malformed id and a missing version", () => {
    const result = resetPasswordSchema.safeParse({ userId: "1 or 1=1", password: "short" });

    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(["password", "userId", "version"]);
  });
});

describe("newPasswordSchema", () => {
  it("checks only the password, as the form has no user id or version", () => {
    expect(newPasswordSchema.safeParse({ password: "new password 1" }).success).toBe(true);
    expect(newPasswordSchema.safeParse({ password: "short" }).error?.issues[0]?.path).toEqual(["password"]);
  });
});

describe("resetPasswordBodySchema", () => {
  it("is the API body: the password and the version, with the id from the path", () => {
    expect(resetPasswordBodySchema.parse({ password: "new password 1", version: 4 })).toEqual({
      password: "new password 1",
      version: 4,
    });
    expect(resetPasswordBodySchema.safeParse({ password: "new password 1" }).success).toBe(false);
  });
});
