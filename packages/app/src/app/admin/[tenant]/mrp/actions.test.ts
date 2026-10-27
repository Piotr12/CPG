import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@cpg/core";
import { runMrp } from "./actions";

const mocks = vi.hoisted(() => ({ run: vi.fn(), currentUser: vi.fn(), bound: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@cpg/core", async (original) => {
  const core = await original<typeof import("@cpg/core")>();
  return {
    ...core,
    tenantServerAction:
      (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) =>
      (tenant: string, generation: number, raw: unknown) => {
        mocks.bound(tenant, generation, raw);
        return core.serverAction(schema, (input) => handler(input, { cradle: { mrpRunService: { run: mocks.run } } }))(raw);
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
