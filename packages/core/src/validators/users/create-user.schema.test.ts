import { describe, expect, it } from "vitest";
import { createUserSchema, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./create-user.schema";

const PASSWORD = "x".repeat(MIN_PASSWORD_LENGTH);

describe("createUserSchema", () => {
  it("trims and lowercases the username and keeps the password as typed", () => {
    expect(createUserSchema.parse({ username: "  Bob.Planner ", password: ` ${PASSWORD} ` })).toEqual({
      username: "bob.planner",
      password: ` ${PASSWORD} `,
    });
  });

  it.each(["abc", "a".repeat(32), "0perator", "a_b-c.d"])("accepts the username %j", (username) => {
    expect(createUserSchema.safeParse({ username, password: PASSWORD }).success).toBe(true);
  });

  it.each(["ab", "a".repeat(33), ".alice", "-alice", "al ice", "alicé", "alice@x", ""])(
    "rejects the username %j with one readable message",
    (username) => {
      const result = createUserSchema.safeParse({ username, password: PASSWORD });

      expect(result.error?.issues).toEqual([
        expect.objectContaining({
          path: ["username"],
          message: "Use 3–32 lowercase letters, digits, dots, dashes or underscores.",
        }),
      ]);
    },
  );

  it("needs 12 to 256 password characters", () => {
    const parse = (password: string) => createUserSchema.safeParse({ username: "alice", password });

    expect(parse("x".repeat(MIN_PASSWORD_LENGTH - 1)).error?.issues[0]?.message).toBe("Use at least 12 characters.");
    expect(parse("x".repeat(MAX_PASSWORD_LENGTH + 1)).error?.issues[0]?.message).toBe("Use at most 256 characters.");
    expect(parse("x".repeat(MAX_PASSWORD_LENGTH)).success).toBe(true);
  });
});
