import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTransfer } from "./actions";

const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const aliceActor = { userId: "u2", username: "alice", sessionId: "s2", channel: "ui", token: null };
const FORM = { material: "00000001", source: "00000001", destination: "00000002", quantity: "100", unit: "kg", plannedDispatch: "2027-03-01", plannedArrival: "2027-03-03" };

const mocks = vi.hoisted(() => ({
  transferService: { create: vi.fn() },
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
        return core.serverAction(schema, (input) => handler(input, { cradle: { transferService: mocks.transferService } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("transfers page actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(alice);
    mocks.transferService.create.mockResolvedValue({ id: "00000001" });
  });
  afterEach(() => vi.clearAllMocks());

  it("creates a transfer for any signed-in account in the page's tenant, and refreshes the list", async () => {
    await expect(createTransfer("prod", 4, FORM)).resolves.toEqual({ ok: true, data: { id: "00000001" } });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 4);
    expect(mocks.transferService.create).toHaveBeenCalledWith(FORM, aliceActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/transfers"]]);
  });

  it("refuses a signed-out caller and the same location twice, writing and refreshing nothing", async () => {
    mocks.currentUser.mockResolvedValue(null);
    await expect(createTransfer("prod", 4, FORM)).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    mocks.currentUser.mockResolvedValue(alice);
    await expect(createTransfer("prod", 4, { ...FORM, destination: "00000001" })).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", fieldErrors: { destination: [expect.any(String)] } },
    });
    expect(mocks.transferService.create).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("doesn't refresh after a read-only refusal", async () => {
    mocks.transferService.create.mockRejectedValueOnce(new ConflictError("Read-only.", "TENANT_READ_ONLY"));

    await expect(createTransfer("prod", 4, FORM)).resolves.toMatchObject({ error: { code: "TENANT_READ_ONLY" } });

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
