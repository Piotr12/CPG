import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { productionInput as input } from "../../../../../../../tests/setup/production-orders";
import { createProductionOrder, updateProductionOrder } from "./actions";
const mocks = vi.hoisted(() => ({ service: { create: vi.fn(), update: vi.fn(), options: vi.fn() }, currentUser: vi.fn(), bound: vi.fn(), tenantScope: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@cpg/core", async (original) => {
  const core = await original<typeof import("@cpg/core")>();
  return { ...core, tenantScope: mocks.tenantScope, tenantServerAction: (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
    (tenant: string, generation: number, raw: unknown) => { mocks.bound(tenant, generation); return core.serverAction(schema, (input) => handler(input, { cradle: { productionOrderService: mocks.service } }))(raw); } };
});
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
const normalized = { ...input, quantity: "2.000000" };
describe("production order actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue({ userId: "u1", username: "alice", role: "user", sessionId: "s1" });
    mocks.service.create.mockResolvedValue({ id: "00000001" }); mocks.service.update.mockResolvedValue({ version: 2 });
    mocks.service.options.mockResolvedValue({ selected: "recipe" }); mocks.tenantScope.mockResolvedValue({ cradle: { productionOrderService: mocks.service } });
  });
  afterEach(() => vi.clearAllMocks());
  it.each(["user", "admin"])("creates with bound generation and UI actor for %s", async (role) => {
    mocks.currentUser.mockResolvedValue({ userId: "u1", username: "alice", role, sessionId: "s1" });
    expect(await createProductionOrder("test", 7, input)).toEqual({ ok: true, data: { id: "00000001" } });
    expect(mocks.bound).toHaveBeenCalledWith("test", 7);
    expect(mocks.service.create).toHaveBeenCalledWith(normalized, expect.objectContaining({ channel: "ui", sessionId: "s1" }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/test/production-orders");
  });
  it("binds edit identity/version and refreshes list and detail", async () => {
    expect((await updateProductionOrder("test", 7, "00000001", 1, { quantity: "3", orderId: "00000099", version: 8 })).ok).toBe(true);
    expect(mocks.service.update).toHaveBeenCalledWith("00000001", { quantity: "3.000000" }, 1, expect.objectContaining({ channel: "ui" }));
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/test/production-orders"], ["/admin/test/production-orders/00000001"]]);
  });
  it("rejects signed-out writes and invalid/locked input without writing", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect(await createProductionOrder("test", 1, input)).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(await updateProductionOrder("test", 1, "00000001", 1, {})).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(await updateProductionOrder("test", 1, "00000001", 1, { output: "00000003" })).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(mocks.service.create).not.toHaveBeenCalled(); expect(mocks.service.update).not.toHaveBeenCalled();
  });
  it("refreshes conflicts and preserves read-only refusals", async () => {
    mocks.service.update.mockRejectedValueOnce(new ConflictError("reload", "VERSION_CONFLICT"));
    expect(await updateProductionOrder("test", 1, "00000001", 1, {})).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/test/production-orders/00000001");
    mocks.service.create.mockRejectedValueOnce(new ConflictError("locked", "TENANT_READ_ONLY"));
    expect(await createProductionOrder("test", 1, input)).toMatchObject({ error: { code: "TENANT_READ_ONLY" } });
  });
});
