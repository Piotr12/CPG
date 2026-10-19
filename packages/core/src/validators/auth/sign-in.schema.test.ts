import { describe, expect, it } from "vitest";
import { signInSchema } from "./sign-in.schema";

describe("signInSchema", () => {
  it("accepts a username and password, trimming the username", () => {
    expect(signInSchema.parse({ username: "  admin ", password: " pass word " })).toEqual({
      username: "admin",
      password: " pass word ",
    });
  });

  it.each([
    [{ username: "", password: "x" }, "username", "Enter your username."],
    [{ username: "   ", password: "x" }, "username", "Enter your username."],
    [{ username: "admin", password: "" }, "password", "Enter your password."],
  ])("rejects %j", (input, field, message) => {
    const result = signInSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([expect.objectContaining({ path: [field], message })]);
  });

  it("caps the length of both fields", () => {
    expect(signInSchema.safeParse({ username: "a".repeat(65), password: "x" }).success).toBe(false);
    expect(signInSchema.safeParse({ username: "admin", password: "x".repeat(257) }).success).toBe(false);
    expect(signInSchema.safeParse({ username: "a".repeat(64), password: "x".repeat(256) }).success).toBe(true);
  });
});
