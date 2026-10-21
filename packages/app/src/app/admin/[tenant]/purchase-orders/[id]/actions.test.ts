import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postReceipt, setPurchaseOrderLineDate } from "./actions";

const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const aliceActor = { userId: "u2", username: "alice", sessionId: "s2", channel: "ui", token: null };
const receipt = { id: "00000003", warnings: [] };
const FORM = { lines: [{ line: 1, quantity: "30", unit: "kg" }] };

const mocks = vi.hoisted(() => ({
  goodsReceiptService: { post: vi.fn() },
  purchaseOrderService: { setPlannedDates: vi.fn() },
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
        return core.serverAction(schema, (input) => handler(input, { cradle: { goodsReceiptService: mocks.goodsReceiptService, purchaseOrderService: mocks.purchaseOrderService } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("purchase-order page actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(alice);
    mocks.goodsReceiptService.post.mockResolvedValue(receipt);
  });
  afterEach(() => vi.clearAllMocks());

  it("posts a receipt against the page's order for any signed-in account, and refreshes the order, the list and stock", async () => {
    await expect(postReceipt("prod", 4, "00000002", FORM)).resolves.toEqual({ ok: true, data: receipt });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 4);
    expect(mocks.goodsReceiptService.post).toHaveBeenCalledWith({ purchaseOrder: "00000002", lines: FORM.lines }, aliceActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/purchase-orders/00000002"], ["/admin/prod/purchase-orders"], ["/admin/prod/stock"]]);
  });

  it("takes the order from the page, never from the form", async () => {
    await postReceipt("prod", 4, "00000002", { ...FORM, purchaseOrder: "00000009" });

    expect(mocks.goodsReceiptService.post).toHaveBeenCalledWith(expect.objectContaining({ purchaseOrder: "00000002" }), aliceActor);
  });

  it("refuses a signed-out caller and values that aren't a form, writing and refreshing nothing", async () => {
    mocks.currentUser.mockResolvedValue(null);
    await expect(postReceipt("prod", 4, "00000002", FORM)).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    mocks.currentUser.mockResolvedValue(alice);
    await expect(postReceipt("prod", 4, "00000002", null)).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED", fieldErrors: { lines: [expect.any(String)] } } });

    expect(mocks.goodsReceiptService.post).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("doesn't refresh after a read-only refusal", async () => {
    mocks.goodsReceiptService.post.mockRejectedValueOnce(new ConflictError("Read-only.", "TENANT_READ_ONLY"));

    await expect(postReceipt("prod", 4, "00000002", FORM)).resolves.toMatchObject({ error: { code: "TENANT_READ_ONLY" } });

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  describe("setPurchaseOrderLineDate", () => {
    const order = { id: "00000002", version: 5 };
    beforeEach(() => {
      mocks.purchaseOrderService.setPlannedDates.mockResolvedValue(order);
    });

    it("sets the bound line's planned date at the version its dialog opened with, and refreshes the order's page only", async () => {
      await expect(setPurchaseOrderLineDate("prod", 4, "00000002", 2, 4, { plannedDate: "2027-04-01" })).resolves.toEqual({ ok: true, data: order });

      expect(mocks.bound).toHaveBeenCalledWith("prod", 4);
      expect(mocks.purchaseOrderService.setPlannedDates).toHaveBeenCalledWith("00000002", [{ line: 2, plannedDate: "2027-04-01" }], 4, aliceActor);
      expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/purchase-orders/00000002"]]);
    });

    it("refreshes after a version conflict, and not after a read-only refusal", async () => {
      mocks.purchaseOrderService.setPlannedDates.mockRejectedValueOnce(new ConflictError("Changed.", "VERSION_CONFLICT"));
      await expect(setPurchaseOrderLineDate("prod", 4, "00000002", 2, 4, { plannedDate: "2027-04-01" })).resolves.toMatchObject({
        error: { code: "VERSION_CONFLICT" },
      });
      expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);

      mocks.purchaseOrderService.setPlannedDates.mockRejectedValueOnce(new ConflictError("Read-only.", "TENANT_READ_ONLY"));
      await expect(setPurchaseOrderLineDate("prod", 4, "00000002", 2, 4, { plannedDate: "2027-04-01" })).resolves.toMatchObject({
        error: { code: "TENANT_READ_ONLY" },
      });
      expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
    });

    it("refuses a signed-out caller or a missing date, writing and refreshing nothing", async () => {
      await expect(setPurchaseOrderLineDate("prod", 4, "00000002", 2, 4, {})).resolves.toMatchObject({
        ok: false,
        error: { code: "VALIDATION_FAILED", fieldErrors: { plannedDate: [expect.any(String)] } },
      });
      mocks.currentUser.mockResolvedValue(null);
      await expect(setPurchaseOrderLineDate("prod", 4, "00000002", 2, 4, { plannedDate: "2027-04-01" })).resolves.toMatchObject({
        ok: false,
        error: { code: "UNAUTHORIZED" },
      });

      expect(mocks.purchaseOrderService.setPlannedDates).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });
  });
});
