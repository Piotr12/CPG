import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cancelProductionOrder, closeEarlyProductionOrder } from "./actions";

const mocks = vi.hoisted(() => ({ service: { cancel: vi.fn(), closeEarly: vi.fn() }, currentUser: vi.fn(), bound: vi.fn(), refresh: vi.fn() }));
vi.mock("@cpg/core", async (original) => {
  const core = await original<typeof import("@cpg/core")>();
  return { ...core, tenantServerAction:
    (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
    (tenant: string, generation: number, raw: unknown) => {
      mocks.bound(tenant, generation);
      return core.serverAction(schema, (input) => handler(input, { cradle: { productionOrderService: mocks.service } }))(raw);
    },
  };
});
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
beforeEach(() => {
  mocks.currentUser.mockResolvedValue({ sessionId: "s", userId: "u", username: "alice", role: "user" });
  mocks.service.cancel.mockResolvedValue({ id: "00000001", status: "cancelled" });
  mocks.service.closeEarly.mockResolvedValue({ id: "00000001", status: "closed-early" });
});
afterEach(() => vi.clearAllMocks());
it.each([[cancelProductionOrder, "cancel"], [closeEarlyProductionOrder, "closeEarly"]] as const)("resolves through its owning service and refreshes the document", async (action, method) => {
  expect(await action("prod", 4, "00000001", { version: 3 })).toMatchObject({ ok: true });
  expect(mocks.bound).toHaveBeenCalledWith("prod", 4);
  expect(mocks.service[method]).toHaveBeenCalledWith("00000001", 3, { userId: "u", username: "alice", sessionId: "s", channel: "ui", token: null });
  expect(mocks.refresh).toHaveBeenCalledWith("/admin/prod/production-orders");
});
it("refuses malformed input and signed-out callers before mutation", async () => {
  expect(await cancelProductionOrder("prod", 4, "00000001", {})).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  mocks.currentUser.mockResolvedValue(null);
  expect(await closeEarlyProductionOrder("prod", 4, "00000001", { version: 3 })).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  expect(mocks.service.cancel).not.toHaveBeenCalled(); expect(mocks.service.closeEarly).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("preserves read-only errors without refreshing and refreshes conflicts", async () => {
  mocks.service.cancel.mockRejectedValueOnce(new ConflictError("Read-only", "TENANT_READ_ONLY"));
  expect(await cancelProductionOrder("prod", 4, "00000001", { version: 3 })).toMatchObject({ error: { code: "TENANT_READ_ONLY" } });
  expect(mocks.refresh).not.toHaveBeenCalled();
  mocks.service.closeEarly.mockRejectedValueOnce(new ConflictError("Changed", "VERSION_CONFLICT"));
  expect(await closeEarlyProductionOrder("prod", 4, "00000001", { version: 3 })).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
  expect(mocks.refresh).toHaveBeenCalledWith("/admin/prod/production-orders");
});
