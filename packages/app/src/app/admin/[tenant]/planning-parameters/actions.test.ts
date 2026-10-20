import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPlanningParameters, changePlanningParameters, removePlanningParameters } from "./actions";

const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const adminActor = { userId: "u1", username: "admin", sessionId: "s1", channel: "ui", token: null };
const FORM = { material: "00000004", location: "00000001", procurement: "make", leadTimeDays: "2", minimumQuantity: "50", lotMultiple: "10" };
const SET = { material: "00000004", location: "00000001", procurement: "make", leadTimeDays: 2, minimumQuantity: "50.000000", lotMultiple: "10.000000" };

const mocks = vi.hoisted(() => ({
  service: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
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
        return core.serverAction(schema, (input) => handler(input, { cradle: { planningParameterService: mocks.service } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("planning parameters actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.service.create.mockResolvedValue({ ...SET, version: 1 });
    mocks.service.update.mockResolvedValue({ ...SET, version: 2 });
    mocks.service.remove.mockResolvedValue({ material: "00000004", location: "00000001" });
  });
  afterEach(() => vi.clearAllMocks());

  it("adds the form's set in the bound tenant and generation, the lead time read from text, and refreshes the list", async () => {
    await expect(addPlanningParameters("prod", 1, FORM)).resolves.toEqual({ ok: true, data: { ...SET, version: 1 } });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 1);
    expect(mocks.service.create).toHaveBeenCalledWith(SET, adminActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/planning-parameters"]]);
  });

  it("changes the bound row at its version, whatever the form sends for the key", async () => {
    const form = { procurement: "buy", leadTimeDays: "5", minimumQuantity: "100", lotMultiple: "50", material: "00000009", version: 9 };
    await changePlanningParameters("test", 2, "00000004", "00000001", 1, form);

    expect(mocks.bound).toHaveBeenCalledWith("test", 2);
    expect(mocks.service.update).toHaveBeenCalledWith(
      "00000004",
      "00000001",
      { procurement: "buy", leadTimeDays: 5, minimumQuantity: "100.000000", lotMultiple: "50.000000" },
      1,
      adminActor,
    );
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/test/planning-parameters"]]);
  });

  it("removes the bound row at its version", async () => {
    await expect(removePlanningParameters("prod", 1, "00000004", "00000001", 3)).resolves.toMatchObject({ ok: true });
    expect(mocks.service.remove).toHaveBeenCalledWith("00000004", "00000001", 3, adminActor);
  });

  it("refreshes after a stale version, so a retry carries the new one", async () => {
    const { ConflictError, VERSION_CONFLICT } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.service.remove.mockRejectedValue(new ConflictError(VERSION_CONFLICT, "VERSION_CONFLICT"));

    expect((await removePlanningParameters("prod", 1, "00000004", "00000001", 1)).ok).toBe(false);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/prod/planning-parameters");
  });

  it("doesn't refresh after a read-only refusal, so the dialog keeps explaining it (R05)", async () => {
    const { ConflictError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.service.create.mockRejectedValue(new ConflictError("Read-only.", "TENANT_READ_ONLY"));

    expect(await addPlanningParameters("prod", 1, FORM)).toMatchObject({ ok: false, error: { code: "TENANT_READ_ONLY" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("doesn't refresh after a stale generation, a page rendered before a Test reset (TEN-030)", async () => {
    const { ConflictError } = await vi.importActual<typeof import("@cpg/core")>("@cpg/core");
    mocks.service.update.mockRejectedValue(new ConflictError("This tenant's data was reset since you read it.", "GENERATION_STALE"));

    expect(await changePlanningParameters("test", 1, "00000004", "00000001", 1, FORM)).toMatchObject({
      ok: false,
      error: { code: "GENERATION_STALE" },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("forbids a normal user and a signed-out visitor, writing nothing (TEN-004)", async () => {
    mocks.currentUser.mockResolvedValue(alice);
    expect(await addPlanningParameters("prod", 1, FORM)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await changePlanningParameters("prod", 1, "00000004", "00000001", 1, FORM)).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(await removePlanningParameters("prod", 1, "00000004", "00000001", 1)).toMatchObject({ error: { code: "FORBIDDEN" } });

    mocks.currentUser.mockResolvedValue(null);
    expect(await addPlanningParameters("prod", 1, FORM)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(mocks.service.create).not.toHaveBeenCalled();
    expect(mocks.service.update).not.toHaveBeenCalled();
    expect(mocks.service.remove).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("names a missing lead time without writing", async () => {
    expect(await addPlanningParameters("prod", 1, { ...FORM, leadTimeDays: "" })).toMatchObject({
      ok: false,
      error: { fieldErrors: { leadTimeDays: ["Enter a whole number of days from 0 to 999."] } },
    });
    expect(mocks.service.create).not.toHaveBeenCalled();
  });
});
