import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchTransfer, receiveTransfer, setTransferDates, writeOffTransfer } from "./actions";

const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const aliceActor = { userId: "u2", username: "alice", sessionId: "s2", channel: "ui", token: null };
const posted = { transfer: { id: "00000004" }, posting: { id: "p1" } };

const mocks = vi.hoisted(() => ({
  transferService: { dispatch: vi.fn(), receive: vi.fn(), writeOff: vi.fn(), setPlannedDates: vi.fn() },
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
        return core.serverAction(schema, (input) => handler(input, { cradle: { transferService: mocks.transferService } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

const POSTED_PATHS = [["/admin/prod/transfers/00000004"], ["/admin/prod/transfers"], ["/admin/prod/stock"]];

describe("transfer page actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(alice);
    for (const method of [mocks.transferService.dispatch, mocks.transferService.receive, mocks.transferService.writeOff]) method.mockResolvedValue(posted);
    mocks.transferService.setPlannedDates.mockResolvedValue({ id: "00000004", version: 3 });
  });
  afterEach(() => vi.clearAllMocks());

  it.each([
    ["dispatches", dispatchTransfer, mocks.transferService.dispatch],
    ["receives", receiveTransfer, mocks.transferService.receive],
  ] as const)("%s on the page's transfer for any signed-in account, and refreshes the transfer, the list and stock", async (_, action, method) => {
    await expect(action("prod", 4, "00000004", { quantity: "60", unit: "kg", transfer: "00000009" })).resolves.toEqual({ ok: true, data: posted });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 4);
    expect(method).toHaveBeenCalledWith("00000004", { quantity: "60", unit: "kg" }, aliceActor);
    expect(mocks.revalidatePath.mock.calls).toEqual(POSTED_PATHS);
  });

  it("writes off with its reason, and refuses one without", async () => {
    await expect(writeOffTransfer("prod", 4, "00000004", { quantity: "10", unit: "kg", reason: "Lost" })).resolves.toEqual({ ok: true, data: posted });
    expect(mocks.transferService.writeOff).toHaveBeenCalledWith("00000004", { quantity: "10", unit: "kg", reason: "Lost" }, aliceActor);
    expect(mocks.revalidatePath.mock.calls).toEqual(POSTED_PATHS);

    mocks.revalidatePath.mockClear();
    await expect(writeOffTransfer("prod", 4, "00000004", { quantity: "10", unit: "kg" })).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", fieldErrors: { reason: [expect.any(String)] } },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sets the planned dates at the version the page loaded, and refreshes after a version conflict too", async () => {
    const dates = { plannedDispatch: "2027-03-02", plannedArrival: "2027-03-04" };
    await expect(setTransferDates("prod", 4, "00000004", 2, dates)).resolves.toEqual({ ok: true, data: { id: "00000004", version: 3 } });
    expect(mocks.transferService.setPlannedDates).toHaveBeenCalledWith("00000004", dates, 2, aliceActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/transfers/00000004"], ["/admin/prod/transfers"]]);

    mocks.transferService.setPlannedDates.mockRejectedValueOnce(new ConflictError("Changed.", "VERSION_CONFLICT"));
    await expect(setTransferDates("prod", 4, "00000004", 2, dates)).resolves.toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(4);
  });

  it("refuses a signed-out caller and a nonpositive quantity, writing and refreshing nothing", async () => {
    mocks.currentUser.mockResolvedValue(null);
    await expect(dispatchTransfer("prod", 4, "00000004", { quantity: "60", unit: "kg" })).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    mocks.currentUser.mockResolvedValue(alice);
    await expect(receiveTransfer("prod", 4, "00000004", { quantity: "0", unit: "kg" })).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.transferService.dispatch).not.toHaveBeenCalled();
    expect(mocks.transferService.receive).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("doesn't refresh after a read-only refusal", async () => {
    mocks.transferService.dispatch.mockRejectedValueOnce(new ConflictError("Read-only.", "TENANT_READ_ONLY"));

    await expect(dispatchTransfer("prod", 4, "00000004", { quantity: "60", unit: "kg" })).resolves.toMatchObject({ error: { code: "TENANT_READ_ONLY" } });

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
