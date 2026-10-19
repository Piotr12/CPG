import { ForbiddenError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, resetUserPassword, setUserActive } from "./actions";

const USER_ID = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";
const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const summary = { id: USER_ID, username: "alice", role: "user", active: true, createdAt: new Date("2026-10-19T09:00:00Z") };

const mocks = vi.hoisted(() => ({
  userService: { create: vi.fn(), resetPassword: vi.fn(), setActive: vi.fn() },
  currentUser: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  requestScope: async () => ({ cradle: { userService: mocks.userService } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("users actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.userService.create.mockResolvedValue(summary);
    mocks.userService.resetPassword.mockResolvedValue(summary);
    mocks.userService.setActive.mockResolvedValue({ ...summary, active: false });
  });
  afterEach(() => vi.clearAllMocks());

  it("creates a user with the parsed input and refreshes the list", async () => {
    await expect(createUser({ username: " Alice ", password: "initial password" })).resolves.toEqual({
      ok: true,
      data: summary,
    });

    expect(mocks.userService.create).toHaveBeenCalledWith({ username: "alice", password: "initial password" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("resets a password", async () => {
    await expect(resetUserPassword({ userId: USER_ID, password: "a brand new password" })).resolves.toMatchObject({
      ok: true,
    });

    expect(mocks.userService.resetPassword).toHaveBeenCalledWith(USER_ID, "a brand new password");
  });

  it("deactivates and reactivates", async () => {
    await expect(setUserActive({ userId: USER_ID, active: false })).resolves.toMatchObject({
      ok: true,
      data: { active: false },
    });
    await setUserActive({ userId: USER_ID, active: true });

    expect(mocks.userService.setActive.mock.calls).toEqual([
      [USER_ID, false],
      [USER_ID, true],
    ]);
  });

  it.each([
    ["a normal user", alice, { code: "FORBIDDEN", message: "You don't have access to this." }],
    ["nobody signed in", null, { code: "UNAUTHORIZED", message: "You need to sign in." }],
  ])("refuses %s and changes nothing", async (_case, actor, error) => {
    mocks.currentUser.mockResolvedValue(actor);

    await expect(createUser({ username: "mallory", password: "initial password" })).resolves.toEqual({ ok: false, error });
    await expect(resetUserPassword({ userId: USER_ID, password: "a brand new password" })).resolves.toEqual({
      ok: false,
      error,
    });
    await expect(setUserActive({ userId: USER_ID, active: false })).resolves.toEqual({ ok: false, error });

    expect(mocks.userService.create).not.toHaveBeenCalled();
    expect(mocks.userService.resetPassword).not.toHaveBeenCalled();
    expect(mocks.userService.setActive).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns field errors for bad input without calling the service", async () => {
    const result = await createUser({ username: "x", password: "short" });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(Object.keys(result.ok ? {} : (result.error.fieldErrors ?? {})).sort()).toEqual(["password", "username"]);
    expect(mocks.userService.create).not.toHaveBeenCalled();
  });

  it("passes the service's own errors through, and never returns a password hash", async () => {
    mocks.userService.setActive.mockRejectedValue(new ForbiddenError("Nope."));

    await expect(setUserActive({ userId: USER_ID, active: false })).resolves.toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Nope." },
    });
    const created = await createUser({ username: "alice", password: "initial password" });
    expect(JSON.stringify(created)).not.toMatch(/passwordHash|argon2/);
  });
});
