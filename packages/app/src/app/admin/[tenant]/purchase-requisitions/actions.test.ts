import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequisition } from "./actions";

const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const aliceActor = { userId: "u2", username: "alice", sessionId: "s2", channel: "ui", token: null };
const requisition = { id: "00000002", version: 1 };
const FORM = { material: "00000001", location: "00000001", quantity: "100", unit: "kg", requiredDate: "2027-03-01" };

const mocks = vi.hoisted(() => ({
  purchaseRequisitionService: { create: vi.fn() },
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
        return core.serverAction(schema, (input) => handler(input, { cradle: { purchaseRequisitionService: mocks.purchaseRequisitionService } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("requisition actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(alice);
    mocks.purchaseRequisitionService.create.mockResolvedValue(requisition);
  });
  afterEach(() => vi.clearAllMocks());

  it("creates a requisition for any signed-in account, in the bound tenant and generation, and refreshes the list", async () => {
    await expect(createRequisition("prod", 1, FORM)).resolves.toEqual({ ok: true, data: requisition });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 1);
    expect(mocks.purchaseRequisitionService.create).toHaveBeenCalledWith(FORM, aliceActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/purchase-requisitions"]]);
  });

  it("refuses a signed-out caller, writing and refreshing nothing", async () => {
    mocks.currentUser.mockResolvedValue(null);

    await expect(createRequisition("prod", 1, FORM)).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    expect(mocks.purchaseRequisitionService.create).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a field's error by its name, and writes nothing", async () => {
    await expect(createRequisition("prod", 1, { ...FORM, quantity: "0" })).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", fieldErrors: { quantity: [expect.any(String)] } },
    });
    expect(mocks.purchaseRequisitionService.create).not.toHaveBeenCalled();
  });

  it("doesn't refresh after a read-only refusal", async () => {
    mocks.purchaseRequisitionService.create.mockRejectedValueOnce(new ConflictError("Read-only.", "TENANT_READ_ONLY"));

    await expect(createRequisition("prod", 1, FORM)).resolves.toMatchObject({ error: { code: "TENANT_READ_ONLY" } });

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
