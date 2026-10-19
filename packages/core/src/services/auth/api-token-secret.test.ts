import { describe, expect, it } from "vitest";
import { API_TOKEN_PREFIX, generateApiTokenSecret, hashApiTokenSecret } from "./api-token-secret";
import { hashSessionToken } from "./session-token";

describe("API token secrets", () => {
  it("are the cpg_ prefix and 32 random bytes, URL-safe, and never repeat", () => {
    const secrets = new Set(Array.from({ length: 100 }, generateApiTokenSecret));

    expect(API_TOKEN_PREFIX).toBe("cpg_");
    expect(secrets.size).toBe(100);
    for (const secret of secrets) {
      expect(secret).toMatch(/^cpg_[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(secret.slice(API_TOKEN_PREFIX.length), "base64url")).toHaveLength(32);
    }
  });

  it("are stored as their hex SHA-256, like session tokens", () => {
    const secret = generateApiTokenSecret();

    expect(hashApiTokenSecret(secret)).toBe(hashSessionToken(secret));
    expect(hashApiTokenSecret(secret)).toMatch(/^[0-9a-f]{64}$/);
  });
});
