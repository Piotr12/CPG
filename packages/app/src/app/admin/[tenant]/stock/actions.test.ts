import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "@cpg/core";
import { postStockCorrection } from "./actions";
const mocks = vi.hoisted(() => ({ correct: vi.fn(), currentUser: vi.fn(), bound: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@cpg/core", async (original) => {
  const core = await original<typeof import("@cpg/core")>();
  return { ...core, tenantServerAction: (schema: Parameters<typeof core.serverAction>[0], handler: (input: unknown, scope: unknown) => Promise<unknown>) => (tenant: string, generation: number, raw: unknown) => {
    mocks.bound(tenant, generation); return core.serverAction(schema, (input) => handler(input, { cradle: { stockService: { correct: mocks.correct } } }))(raw);
  } };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));
const pair = { material: "00000001", location: "00000001" };
const values = { quantity: "2", unit: "each", reason: "Count" };
afterEach(() => vi.clearAllMocks());
describe("stock correction action", () => {
  it.each(["user", "admin"])("allows %s and binds pair/generation independently of form fields", async (role) => {
    mocks.currentUser.mockResolvedValue({ userId: "u", username: "alice", sessionId: "s", role }); mocks.correct.mockResolvedValue({ id: "m1" });
    expect(await postStockCorrection("test", 2, pair, { ...values, material: "00000099" })).toEqual({ ok: true, data: { id: "m1" } });
    expect(mocks.correct).toHaveBeenCalledWith({ ...pair, ...values }, { userId: "u", username: "alice", sessionId: "s", channel: "ui", token: null });
    expect(mocks.bound).toHaveBeenCalledWith("test", 2); expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/test/stock");
  });
  it("refuses no session, malformed fields and domain failures without refreshing away their explanation", async () => {
    mocks.currentUser.mockResolvedValue(null);
    expect(await postStockCorrection("prod", 1, pair, values)).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(mocks.correct).not.toHaveBeenCalled();
    mocks.currentUser.mockResolvedValue({ userId: "u", username: "alice", sessionId: "s", role: "user" });
    expect(await postStockCorrection("prod", 1, pair, {})).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    mocks.correct.mockRejectedValue(new ConflictError("Read-only", "TENANT_READ_ONLY"));
    expect(await postStockCorrection("prod", 1, pair, values)).toMatchObject({ error: { code: "TENANT_READ_ONLY" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
