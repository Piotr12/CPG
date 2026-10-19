import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "./session-token";

describe("session tokens", () => {
  it("are 32 random bytes, URL-safe, and never repeat", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateSessionToken));

    expect(tokens.size).toBe(100);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
    }
  });

  it("are stored as their hex SHA-256", () => {
    expect(hashSessionToken("token")).toBe(createHash("sha256").update("token").digest("hex"));
    expect(hashSessionToken("token")).toHaveLength(64);
  });
});
