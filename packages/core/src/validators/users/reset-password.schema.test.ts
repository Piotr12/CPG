import { describe, expect, it } from "vitest";
import { resetPasswordSchema } from "./reset-password.schema";

const USER_ID = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";

describe("resetPasswordSchema", () => {
  it("accepts a user id and a long enough password", () => {
    expect(resetPasswordSchema.parse({ userId: USER_ID, password: "new password 1" })).toEqual({
      userId: USER_ID,
      password: "new password 1",
    });
  });

  it("rejects a short password and a malformed id", () => {
    const result = resetPasswordSchema.safeParse({ userId: "1 or 1=1", password: "short" });

    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(["password", "userId"]);
  });
});
