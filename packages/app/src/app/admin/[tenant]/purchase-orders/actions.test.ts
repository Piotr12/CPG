import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrder } from "./actions";

const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const aliceActor = { userId: "u2", username: "alice", sessionId: "s2", channel: "ui", token: null };
const order = { id: "00000002", version: 1 };
const LINE = { material: "00000001", quantity: "40", unit: "kg", plannedDate: "2027-03-03", requisition: "00000007" };
const FORM = { supplier: "00000001", location: "00000001", lines: [LINE, { ...LINE, requisition: "" }] };

const mocks = vi.hoisted(() => ({
  purchaseOrderService: { create: vi.fn() },
  bound: vi.fn(),
  currentUser: vi.fn(),
  revalidatePath: vi.fn(),
}));
// tenantServerAction's tenant, generation and transaction are core's (tenant-server-action.test.ts);
// here it parses and runs the handler as serverAction does, and records what the page bound.
vi.mock("@cpg/core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@cpg/core")>();
  return {
    ...core,
    tenantServerAction:
      (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
      (tenant: string, generation: number, raw: unknown) => {
        mocks.bound(tenant, generation);
        return core.serverAction(schema, (input) => handler(input, { cradle: { purchaseOrderService: mocks.purchaseOrderService } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("purchase-order actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(alice);
    mocks.purchaseOrderService.create.mockResolvedValue(order);
  });
  afterEach(() => vi.clearAllMocks());

  it("creates an order for any signed-in account in the bound tenant and generation, reading an empty requisition as none, and refreshes both lists", async () => {
    await expect(createOrder("prod", 1, FORM)).resolves.toEqual({ ok: true, data: order });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 1);
    expect(mocks.purchaseOrderService.create).toHaveBeenCalledWith(
      { supplier: "00000001", location: "00000001", lines: [LINE, { ...LINE, requisition: null }] },
      aliceActor,
    );
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/purchase-orders"], ["/admin/prod/purchase-requisitions"]]);
  });

  it("refuses a signed-out caller, writing and refreshing nothing", async () => {
    mocks.currentUser.mockResolvedValue(null);

    await expect(createOrder("prod", 1, FORM)).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    expect(mocks.purchaseOrderService.create).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a line's field error by its path, and writes nothing", async () => {
    await expect(createOrder("prod", 1, { ...FORM, lines: [{ ...LINE, quantity: "0" }] })).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", fieldErrors: { "lines.0.quantity": [expect.any(String)] } },
    });
    expect(mocks.purchaseOrderService.create).not.toHaveBeenCalled();
  });

  it("doesn't refresh after a read-only refusal", async () => {
    mocks.purchaseOrderService.create.mockRejectedValueOnce(new ConflictError("Read-only.", "TENANT_READ_ONLY"));

    await expect(createOrder("prod", 1, FORM)).resolves.toMatchObject({ error: { code: "TENANT_READ_ONLY" } });

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
