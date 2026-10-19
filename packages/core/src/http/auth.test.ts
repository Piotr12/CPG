import { describe, expect, it } from "vitest";
import type { Actor } from "../services/auth/actor";
import type { SessionUser } from "../services/auth/auth.service";
import { assertAdmin, assertSignedIn } from "./auth";
import { ForbiddenError, UnauthorizedError } from "./errors";

const admin: SessionUser = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice: SessionUser = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };

describe("assertSignedIn", () => {
  it("returns any signed-in user", () => {
    expect(assertSignedIn(alice)).toBe(alice);
    expect(assertSignedIn(admin)).toBe(admin);
  });

  it("rejects a missing session as unauthorized", () => {
    expect(() => assertSignedIn(null)).toThrow(UnauthorizedError);
  });
});

describe("assertAdmin", () => {
  it("returns the admin", () => {
    expect(assertAdmin(admin)).toBe(admin);
  });

  it("forbids a normal user", () => {
    expect(() => assertAdmin(alice)).toThrow(ForbiddenError);
  });

  it("rejects a missing session as unauthorized, not forbidden", () => {
    expect(() => assertAdmin(null)).toThrow(UnauthorizedError);
  });
});

describe("with an API token", () => {
  const adminToken: Actor = { userId: "u1", username: "admin", role: "admin" };
  const aliceToken: Actor = { userId: "u2", username: "alice", role: "user" };

  it("applies the token owner's role, exactly as for a session (API-002, API-010)", () => {
    expect(assertSignedIn(aliceToken)).toBe(aliceToken);
    expect(assertAdmin(adminToken)).toBe(adminToken);
    expect(() => assertAdmin(aliceToken)).toThrow(ForbiddenError);
  });
});
