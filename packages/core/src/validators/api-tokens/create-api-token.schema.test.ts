import { API_TOKEN_NAME_MAX } from "@cpg/db";
import { describe, expect, it } from "vitest";
import {
  createApiTokenSchema,
  MAX_TOKEN_NAME_LENGTH,
  TOKEN_NAME_REQUIRED_MESSAGE,
  TOKEN_NAME_TOO_LONG_MESSAGE,
} from "./create-api-token.schema";

const issues = (input: unknown) => {
  const result = createApiTokenSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map(({ message }) => message);
};

describe("createApiTokenSchema", () => {
  it("trims the name and keeps its case", () => {
    expect(createApiTokenSchema.parse({ name: "  Agent 1 " })).toEqual({ name: "Agent 1" });
  });

  it("requires a name", () => {
    expect(issues({ name: "   " })).toEqual([TOKEN_NAME_REQUIRED_MESSAGE]);
    expect(issues({})).toHaveLength(1);
  });

  it("allows up to 64 characters, the column's length", () => {
    expect(MAX_TOKEN_NAME_LENGTH).toBe(API_TOKEN_NAME_MAX);
    expect(issues({ name: "x".repeat(64) })).toEqual([]);
    expect(issues({ name: "x".repeat(65) })).toEqual([TOKEN_NAME_TOO_LONG_MESSAGE]);
  });
});
