import { describe, expect, it } from "vitest";
import { canonicalJson, fingerprintMatches, fingerprintOf, operationOf } from "./fingerprint";

const request = { method: "post", path: "/api/users", body: { username: "carol", password: "a password 123" } };

describe("fingerprint", () => {
  it("names the operation as METHOD /path", () => {
    expect(operationOf(request)).toBe("POST /api/users");
  });

  it("sorts object keys at every level, and leaves arrays in order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}');
  });

  it("is the same for the same request, whatever its key order", async () => {
    const reordered = { ...request, body: { password: "a password 123", username: "carol" } };

    expect((await fingerprintOf(request)).sha256).toBe((await fingerprintOf(reordered)).sha256);
  });

  it("differs when the body, the method or the path differs", async () => {
    const base = (await fingerprintOf(request)).sha256;
    const others = [
      { ...request, body: { username: "dave" } },
      { ...request, method: "PUT" },
      { ...request, path: "/api/users/1" },
    ];
    for (const other of others) expect((await fingerprintOf(other)).sha256).not.toBe(base);
  });

  it("treats a missing body like a JSON null", async () => {
    const empty = { method: "DELETE", path: "/api/tokens/1" };
    expect((await fingerprintOf({ ...empty, body: undefined })).sha256).toBe((await fingerprintOf({ ...empty, body: null })).sha256);
  });

  it("stores the SHA-256 itself, and matches only it", async () => {
    const { sha256, stored } = await fingerprintOf(request);

    expect(stored).toBe(sha256);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    await expect(fingerprintMatches(stored, sha256)).resolves.toBe(true);
    await expect(fingerprintMatches(stored, "0".repeat(64))).resolves.toBe(false);
  });

  it("stores an argon2id hash for a secret-bearing body, and matches only its request", async () => {
    const { sha256, stored } = await fingerprintOf(request, { secret: true });

    expect(stored).toMatch(/^\$argon2id\$/);
    expect(stored).not.toContain(sha256);
    await expect(fingerprintMatches(stored, sha256)).resolves.toBe(true);
    await expect(fingerprintMatches(stored, (await fingerprintOf({ ...request, body: {} })).sha256)).resolves.toBe(false);
  });
});
