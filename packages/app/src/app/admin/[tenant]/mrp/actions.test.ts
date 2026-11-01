import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@cpg/core";
import { acceptMrpProposal, runMrp } from "./actions";

const mocks = vi.hoisted(() => ({ run: vi.fn(), accept: vi.fn(), currentUser: vi.fn(), bound: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@cpg/core", async (original) => {
  const core = await original<typeof import("@cpg/core")>();
  return {
    ...core,
    tenantServerAction:
      (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
      (tenant: string, generation: number, raw: unknown) => {
        mocks.bound(tenant, generation, raw);
        return core.serverAction(schema, (input) => handler(input, { cradle: { mrpRunService: { run: mocks.run }, mrpAcceptanceService: { accept: mocks.accept } } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));
afterEach(() => vi.clearAllMocks());

describe("runMrp", () => {
  it.each(["user", "admin"])("lets a signed-in %s run MRP in the bound tenant and generation, then refreshes the page", async (role) => {
    mocks.currentUser.mockResolvedValue({ userId: "u", username: "alice", sessionId: "s", role });
    mocks.run.mockResolvedValue({ id: "00000001" });

    expect(await runMrp("test", 4)).toEqual({ ok: true, data: { id: "00000001" } });
    expect(mocks.bound).toHaveBeenCalledWith("test", 4, {});
    expect(mocks.run).toHaveBeenCalledWith({ userId: "u", username: "alice", sessionId: "s", channel: "ui", token: null });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/test/mrp");
  });

  it("refuses without a session, and keeps a refusal on the page rather than refreshing it away", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect(await runMrp("prod", 1)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(mocks.run).not.toHaveBeenCalled();

    mocks.currentUser.mockResolvedValue({ userId: "u", username: "alice", sessionId: "s", role: "admin" });
    mocks.run.mockRejectedValue(new ConflictError("Read-only", "TENANT_READ_ONLY"));
    expect(await runMrp("prod", 1)).toMatchObject({ ok: false, error: { code: "TENANT_READ_ONLY" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("acceptMrpProposal", () => {
  const PROPOSAL = { run: "00000004", proposal: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" };

  it.each(["user", "admin"])("lets a signed-in %s accept the dialog's proposal in the bound tenant and generation, then refreshes the page", async (role) => {
    mocks.currentUser.mockResolvedValue({ userId: "u", username: "alice", sessionId: "s", role });
    mocks.accept.mockResolvedValue({ document: { id: "00000012" } });

    expect(await acceptMrpProposal("test", 4, PROPOSAL)).toEqual({ ok: true, data: { document: { id: "00000012" } } });
    expect(mocks.bound).toHaveBeenCalledWith("test", 4, PROPOSAL);
    expect(mocks.accept).toHaveBeenCalledWith("00000004", PROPOSAL.proposal, { userId: "u", username: "alice", sessionId: "s", channel: "ui", token: null });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/test/mrp");
  });

  it("refreshes after no refusal, so the dialog showing it stays: stale, read-only or already accepted", async () => {
    mocks.currentUser.mockResolvedValue({ userId: "u", username: "alice", sessionId: "s", role: "user" });
    mocks.accept.mockRejectedValueOnce(new ConflictError("Stale", "MRP_PROPOSAL_STALE", { material: "00000031", location: "00000001" }));
    expect(await acceptMrpProposal("prod", 1, PROPOSAL)).toMatchObject({ ok: false, error: { code: "MRP_PROPOSAL_STALE", params: { material: "00000031" } } });
    mocks.accept.mockRejectedValueOnce(new ConflictError("Read-only", "TENANT_READ_ONLY"));
    expect(await acceptMrpProposal("prod", 1, PROPOSAL)).toMatchObject({ ok: false, error: { code: "TENANT_READ_ONLY" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();

    mocks.accept.mockRejectedValueOnce(new ConflictError("Accepted", "MRP_PROPOSAL_ACCEPTED", { document: "00000012", kind: "purchase-requisition" }));
    expect(await acceptMrpProposal("prod", 1, PROPOSAL)).toMatchObject({ ok: false, error: { code: "MRP_PROPOSAL_ACCEPTED" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses without a session, or without the dialog's proposal, before accepting", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect(await acceptMrpProposal("prod", 1, PROPOSAL)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    mocks.currentUser.mockResolvedValue({ userId: "u", username: "alice", sessionId: "s", role: "user" });
    expect(await acceptMrpProposal("prod", 1, { run: "00000004" })).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.accept).not.toHaveBeenCalled();
  });
});
