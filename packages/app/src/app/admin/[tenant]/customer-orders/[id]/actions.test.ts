import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShipment } from "./actions";

const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const aliceActor = { userId: "u2", username: "alice", sessionId: "s2", channel: "ui", token: null };
const LINE = "7f0c8a8e-3b7b-4a52-9a39-1f2a0e6b2c11";
const shipment = { id: "00000003" };
const FORM = { plannedDate: "2026-11-03", lines: [{ orderLine: LINE, quantity: "30", unit: "each" }] };

const mocks = vi.hoisted(() => ({
  shipmentService: { create: vi.fn() },
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
        return core.serverAction(schema, (input) => handler(input, { cradle: { shipmentService: mocks.shipmentService } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("customer order page actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(alice);
    mocks.shipmentService.create.mockResolvedValue(shipment);
  });
  afterEach(() => vi.clearAllMocks());

  it("creates a shipment against the page's order for any signed-in account, and refreshes the order", async () => {
    await expect(createShipment("prod", 4, "00000002", FORM)).resolves.toEqual({ ok: true, data: shipment });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 4);
    expect(mocks.shipmentService.create).toHaveBeenCalledWith({ customerOrder: "00000002", ...FORM }, aliceActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/customer-orders/00000002"]]);
  });

  it("takes the order from the page, never from the form", async () => {
    await createShipment("prod", 4, "00000002", { ...FORM, customerOrder: "00000009" });

    expect(mocks.shipmentService.create).toHaveBeenCalledWith(expect.objectContaining({ customerOrder: "00000002" }), aliceActor);
  });

  it("refuses a signed-out caller and values that aren't a form, writing and refreshing nothing", async () => {
    mocks.currentUser.mockResolvedValue(null);
    await expect(createShipment("prod", 4, "00000002", FORM)).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    mocks.currentUser.mockResolvedValue(alice);
    await expect(createShipment("prod", 4, "00000002", null)).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });

    expect(mocks.shipmentService.create).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("doesn't refresh after a read-only refusal", async () => {
    mocks.shipmentService.create.mockRejectedValueOnce(new ConflictError("Read-only.", "TENANT_READ_ONLY"));

    await expect(createShipment("prod", 4, "00000002", FORM)).resolves.toMatchObject({ error: { code: "TENANT_READ_ONLY" } });

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
