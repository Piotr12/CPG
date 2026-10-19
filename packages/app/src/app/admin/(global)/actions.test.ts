import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTenantReadOnly } from "./actions";

const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
/** The audit actor the action must pass: the signed-in admin's own session, on the UI channel. */
const adminActor = { userId: "u1", username: "admin", sessionId: "s1", channel: "ui", token: null };
const prod = { code: "prod", name: "Prod", generation: 1, readOnly: true };

const mocks = vi.hoisted(() => ({
  tenantService: { setReadOnly: vi.fn() },
  currentUser: vi.fn(),
  revalidatePath: vi.fn(),
  retries: 0,
}));
vi.mock("@cpg/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@cpg/core")>();
  return {
    ...core,
    requestScope: async () => ({ cradle: { tenantService: mocks.tenantService } }),
    retryingStaleSnapshot: <T>(attempt: () => Promise<T>) => {
      mocks.retries += 1;
      return core.retryingStaleSnapshot(attempt);
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("setTenantReadOnly", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.tenantService.setReadOnly.mockResolvedValue(prod);
  });
  afterEach(() => vi.clearAllMocks());

  it("sets the flag as the signed-in admin and refreshes Cave control only", async () => {
    await expect(setTenantReadOnly({ tenant: "prod", readOnly: true })).resolves.toEqual({ ok: true, data: prod });

    expect(mocks.tenantService.setReadOnly).toHaveBeenCalledWith("prod", true, adminActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin"]]);
  });

  it("runs the write through the stale-snapshot retry the tenant writes use", async () => {
    mocks.retries = 0;

    await setTenantReadOnly({ tenant: "test", readOnly: false });

    expect(mocks.retries).toBe(1);
    expect(mocks.tenantService.setReadOnly).toHaveBeenCalledWith("test", false, adminActor);
  });

  it("forbids a normal user, changing and refreshing nothing", async () => {
    mocks.currentUser.mockResolvedValue(alice);

    await expect(setTenantReadOnly({ tenant: "prod", readOnly: true })).resolves.toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(mocks.tenantService.setReadOnly).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    mocks.currentUser.mockResolvedValue(null);

    await expect(setTenantReadOnly({ tenant: "test", readOnly: false })).resolves.toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("refuses an unknown tenant or a missing flag as invalid", async () => {
    for (const values of [{ tenant: "staging", readOnly: true }, { tenant: "prod" }]) {
      await expect(setTenantReadOnly(values)).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    }
    expect(mocks.tenantService.setReadOnly).not.toHaveBeenCalled();
  });
});
