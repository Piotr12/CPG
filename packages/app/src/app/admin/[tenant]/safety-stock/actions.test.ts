import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addSafetyStockTarget, changeSafetyStockTarget, removeSafetyStockTarget } from "./actions";

const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const adminActor = { userId: "u1", username: "admin", sessionId: "s1", channel: "ui", token: null };
const KEY = { material: "00000005", location: "00000001", effectiveFrom: "2027-01-01" };

const mocks = vi.hoisted(() => ({
  service: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  bound: vi.fn(),
  currentUser: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@cpg/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@cpg/core")>();
  return {
    ...core,
    tenantServerAction:
      (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
      (tenant: string, generation: number, raw: unknown) => {
        mocks.bound(tenant, generation);
        return core.serverAction(schema, (input) => handler(input, { cradle: { safetyStockTargetService: mocks.service } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("safety stock actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.service.create.mockResolvedValue({ ...KEY, quantity: "20.000000", version: 1 });
    mocks.service.update.mockResolvedValue({ ...KEY, quantity: "40.000000", version: 2 });
    mocks.service.remove.mockResolvedValue(KEY);
  });
  afterEach(() => vi.clearAllMocks());

  it("adds the form's target in the bound tenant and generation, and refreshes the list", async () => {
    await expect(addSafetyStockTarget("prod", 1, { ...KEY, quantity: "20" })).resolves.toMatchObject({ ok: true });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 1);
    expect(mocks.service.create).toHaveBeenCalledWith({ ...KEY, quantity: "20.000000" }, adminActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/safety-stock"]]);
  });

  it("changes the bound target's quantity at its version, whatever the form sends for the key", async () => {
    await changeSafetyStockTarget("test", 2, KEY, 1, { quantity: "40", effectiveFrom: "2030-01-01" });

    expect(mocks.bound).toHaveBeenCalledWith("test", 2);
    expect(mocks.service.update).toHaveBeenCalledWith(KEY, "40.000000", 1, adminActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/test/safety-stock"]]);
  });

  it("removes the bound target at its version", async () => {
    await expect(removeSafetyStockTarget("prod", 1, KEY, 2)).resolves.toEqual({ ok: true, data: KEY });
    expect(mocks.service.remove).toHaveBeenCalledWith(KEY, 2, adminActor);
  });

  it("refreshes after a stale version, so a retry carries the new one", async () => {
    const { ConflictError, VERSION_CONFLICT } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.service.update.mockRejectedValue(new ConflictError(VERSION_CONFLICT, "VERSION_CONFLICT"));

    expect(await changeSafetyStockTarget("prod", 1, KEY, 1, { quantity: "40" })).toMatchObject({
      ok: false,
      error: { code: "VERSION_CONFLICT" },
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/safety-stock"]]);
  });

  it("doesn't refresh after a read-only refusal, so the dialog keeps explaining it (R05)", async () => {
    const { ConflictError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.service.create.mockRejectedValue(new ConflictError("Read-only.", "TENANT_READ_ONLY"));

    expect(await addSafetyStockTarget("prod", 1, { ...KEY, quantity: "20" })).toMatchObject({
      ok: false,
      error: { code: "TENANT_READ_ONLY" },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("doesn't refresh after a stale generation, a page rendered before a Test reset (TEN-030)", async () => {
    const { ConflictError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.service.remove.mockRejectedValue(new ConflictError("This tenant's data was reset since you read it.", "GENERATION_STALE"));

    expect(await removeSafetyStockTarget("test", 1, KEY, 1)).toMatchObject({ ok: false, error: { code: "GENERATION_STALE" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("forbids a normal user and writes nothing (TEN-004)", async () => {
    mocks.currentUser.mockResolvedValue(alice);

    expect(await addSafetyStockTarget("prod", 1, { ...KEY, quantity: "1" })).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(await changeSafetyStockTarget("prod", 1, KEY, 1, { quantity: "1" })).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(await removeSafetyStockTarget("prod", 1, KEY, 1)).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(mocks.service.create).not.toHaveBeenCalled();
    expect(mocks.service.update).not.toHaveBeenCalled();
    expect(mocks.service.remove).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("names an impossible date without writing", async () => {
    expect(await addSafetyStockTarget("prod", 1, { ...KEY, effectiveFrom: "2027-02-30", quantity: "1" })).toMatchObject({
      ok: false,
      error: { fieldErrors: { effectiveFrom: ["Enter a real date written YYYY-MM-DD."] } },
    });
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
});
