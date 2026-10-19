import { describe, expect, it } from "vitest";
import { ARGON2_PARAMETERS, hashPassword, verifyDummy, verifyPassword } from "./password-hash";

const PASSWORD = "correct horse battery";

/** Swaps one `$`-separated part of a PHC string. */
function withPart(phc: string, index: number, value: string): string {
  const parts = phc.split("$");
  parts[index] = value;
  return parts.join("$");
}

describe("password hashing", () => {
  it("uses argon2id at the engineering standards' floor", async () => {
    expect(ARGON2_PARAMETERS).toEqual({ memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 });
    expect(await hashPassword(PASSWORD)).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
  });

  it("never contains the password and salts every hash", async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(first).not.toContain(PASSWORD);
    expect(first).not.toBe(second);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const phc = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, phc)).toBe(true);
    expect(await verifyPassword("correct horse battery!", phc)).toBe(false);
  });

  it("fails closed on malformed or truncated hashes", async () => {
    const phc = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, "")).toBe(false);
    expect(await verifyPassword(PASSWORD, phc.slice(0, -10) + "!")).toBe(false);
    expect(await verifyPassword(PASSWORD, phc.replace("argon2id", "argon2i"))).toBe(false);
    expect(await verifyPassword(PASSWORD, withPart(phc, 4, "c2FsdA"))).toBe(false); // salt under 8 bytes
    expect(await verifyPassword(PASSWORD, withPart(phc, 5, "aGFzaA"))).toBe(false); // hash under 16 bytes
  });

  it("refuses parameters out of bounds instead of hashing with them", async () => {
    const phc = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, withPart(phc, 3, "m=2000000,t=2,p=1"))).toBe(false);
    expect(await verifyPassword(PASSWORD, withPart(phc, 3, "m=19456,t=99,p=1"))).toBe(false);
    expect(await verifyPassword(PASSWORD, withPart(phc, 3, "m=19456,t=2,p=4"))).toBe(false);
  });

  it("treats a hash argon2 can't derive as no match", async () => {
    const phc = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, withPart(phc, 3, "m=1,t=2,p=1"))).toBe(false);
  });

  it("spends a real check on the dummy and never succeeds", async () => {
    expect(await verifyDummy(PASSWORD)).toBe(false);
    expect(await verifyDummy("cpg-dummy-password-never-valid")).toBe(false);
  });
});
