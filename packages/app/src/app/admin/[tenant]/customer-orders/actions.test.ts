import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomerOrder, updateCustomerOrder } from "./actions";
const mocks = vi.hoisted(() => ({ service: { create: vi.fn(), update: vi.fn() }, currentUser: vi.fn(), bound: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@cpg/core", async (original) => {
  const core = await original<typeof import("@cpg/core")>();
  return { ...core, tenantServerAction: (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
    (tenant: string, generation: number, raw: unknown) => { mocks.bound(tenant, generation); return core.serverAction(schema, (input) => handler(input, { cradle: { customerOrderService: mocks.service } }))(raw); } };
});
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
const input = { customer: "00000001", location: "00000001", lines: [{ material: "00000005", quantity: "2", unit: "each", requiredDate: "2027-01-04" }] };
const normalized = { ...input, lines: [{ ...input.lines[0], quantity: "2.000000" }] };
describe("customer order actions", () => {
  beforeEach(() => { mocks.currentUser.mockResolvedValue({ userId: "u1", username: "alice", role: "user", sessionId: "s1" }); mocks.service.create.mockResolvedValue({ id: "00000001" }); mocks.service.update.mockResolvedValue({ version: 2 }); });
  afterEach(() => vi.clearAllMocks());
  it("lets both roles create within the bound tenant/generation with the UI actor", async () => {
    expect(await createCustomerOrder("test", 7, input)).toEqual({ ok: true, data: { id: "00000001" } });
    expect(mocks.bound).toHaveBeenCalledWith("test", 7);
    expect(mocks.service.create).toHaveBeenCalledWith(normalized, { userId: "u1", username: "alice", sessionId: "s1", channel: "ui", token: null });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/test/customer-orders");
    mocks.currentUser.mockResolvedValue({ userId: "u2", username: "admin", role: "admin", sessionId: "s2" });
    expect((await createCustomerOrder("prod", 1, input)).ok).toBe(true);
  });
  it("uses page-bound ID and version and refreshes the exact list/detail pages", async () => {
    expect((await updateCustomerOrder("test", 7, "00000001", 1, { ...input, orderId: "00000099", version: 8 })).ok).toBe(true);
    expect(mocks.service.update).toHaveBeenCalledWith("00000001", normalized, 1, expect.objectContaining({ channel: "ui" }));
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/test/customer-orders"], ["/admin/test/customer-orders/00000001"]]);
  });
  it("refuses signed-out callers and invalid fields without writing", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect(await createCustomerOrder("test", 1, input)).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(await updateCustomerOrder("test", 1, "00000001", 1, input)).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(await updateCustomerOrder("test", 1, "00000001", 1, null)).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(mocks.service.create).not.toHaveBeenCalled(); expect(mocks.service.update).not.toHaveBeenCalled(); expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it("refreshes a conflict but keeps read-only refusal visible", async () => {
    mocks.service.update.mockRejectedValueOnce(new ConflictError("reload", "VERSION_CONFLICT"));
    expect(await updateCustomerOrder("test", 1, "00000001", 1, input)).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/test/customer-orders/00000001"); mocks.revalidatePath.mockClear();
    mocks.service.create.mockRejectedValueOnce(new ConflictError("locked", "TENANT_READ_ONLY"));
    expect(await createCustomerOrder("test", 1, input)).toMatchObject({ error: { code: "TENANT_READ_ONLY" } }); expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
