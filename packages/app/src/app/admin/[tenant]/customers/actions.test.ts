import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomer, updateCustomer } from "./actions";

const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
/** The audit actor the actions must pass: the signed-in admin's own session, on the UI channel. */
const adminActor = { userId: "u1", username: "admin", sessionId: "s1", channel: "ui", token: null };
const record = { id: "00000002", name: "North", active: true, version: 1 };

const mocks = vi.hoisted(() => ({
  service: { create: vi.fn(), update: vi.fn() },
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
        return core.serverAction(schema, (input) => handler(input, { cradle: { customerService: mocks.service } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("customers actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.service.create.mockResolvedValue(record);
    mocks.service.update.mockResolvedValue({ ...record, version: 2 });
  });
  afterEach(() => vi.clearAllMocks());

  it("creates a customer in the bound tenant and generation, and refreshes the list", async () => {
    await expect(createCustomer("prod", 1, { name: " North " })).resolves.toEqual({ ok: true, data: record });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 1);
    expect(mocks.service.create).toHaveBeenCalledWith({ name: "North" }, adminActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/customers"]]);
  });

  it("renames and (de)activates the bound row at its version", async () => {
    await updateCustomer("test", 2, "00000002", 1, { name: "South", active: false, recordId: "00000009", version: 7 });

    expect(mocks.bound).toHaveBeenCalledWith("test", 2);
    expect(mocks.service.update).toHaveBeenCalledWith("00000002", { name: "South", active: false }, 1, adminActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/test/customers"]]);
  });

  it("refreshes after a stale version, so a retry carries the new one", async () => {
    const { ConflictError, VERSION_CONFLICT } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.service.update.mockRejectedValue(new ConflictError(VERSION_CONFLICT, "VERSION_CONFLICT"));

    expect((await updateCustomer("prod", 1, "00000002", 1, { active: false })).ok).toBe(false);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/prod/customers");
  });

  it("forbids a normal user and writes nothing (TEN-004)", async () => {
    mocks.currentUser.mockResolvedValue(alice);

    expect(await createCustomer("prod", 1, { name: "North" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await updateCustomer("prod", 1, "00000002", 1, { active: false })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(mocks.service.create).not.toHaveBeenCalled();
    expect(mocks.service.update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a signed-out visitor", async () => {
    mocks.currentUser.mockResolvedValue(null);

    expect(await createCustomer("prod", 1, { name: "North" })).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
  });

  it("names a missing name, and a body changing nothing, without writing", async () => {
    expect(await createCustomer("prod", 1, {})).toMatchObject({ ok: false, error: { fieldErrors: { name: ["Enter a name."] } } });
    expect(await updateCustomer("prod", 1, "00000002", 1, "nothing")).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(mocks.service.create).not.toHaveBeenCalled();
    expect(mocks.service.update).not.toHaveBeenCalled();
  });
});
