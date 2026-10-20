import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBom, setBomActive, updateBomRecipe } from "./actions";

const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const adminActor = { userId: "u1", username: "admin", sessionId: "s1", channel: "ui", token: null };
const bom = { id: "00000002", revision: 1, version: 1 };
const LINES = [{ material: "00000004", quantity: "4", unit: "each" }];
const RECIPE = { priority: "1", validFrom: "2027-01-01", validThrough: "", components: LINES };

const mocks = vi.hoisted(() => ({
  bomService: { create: vi.fn(), update: vi.fn() },
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
        return core.serverAction(schema, (input) => handler(input, { cradle: { bomService: mocks.bomService } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("BOM actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.bomService.create.mockResolvedValue(bom);
    mocks.bomService.update.mockResolvedValue({ ...bom, revision: 2, version: 2 });
  });
  afterEach(() => vi.clearAllMocks());

  it("creates a BOM in the bound tenant and generation from the form's text, and refreshes the list", async () => {
    await expect(createBom("prod", 1, { ...RECIPE, output: "00000005" })).resolves.toEqual({ ok: true, data: bom });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 1);
    expect(mocks.bomService.create).toHaveBeenCalledWith(
      { output: "00000005", priority: 1, validFrom: "2027-01-01", validThrough: null, components: LINES },
      adminActor,
    );
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/boms"]]);
  });

  it("saves the recipe of the bound BOM at the bound version, whatever the form sends as its ID", async () => {
    await updateBomRecipe("test", 1, "00000002", 1, { ...RECIPE, validThrough: "2027-12-31", bomId: "00000009", version: 7 });

    expect(mocks.bomService.update).toHaveBeenCalledWith(
      "00000002",
      { priority: 1, validFrom: "2027-01-01", validThrough: "2027-12-31", components: LINES },
      1,
      adminActor,
    );
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/test/boms"], ["/admin/test/boms/00000002"]]);
  });

  it("sends only the active flag, at the bound version, to deactivate and reactivate", async () => {
    await setBomActive("test", 1, "00000002", 3, false);
    await setBomActive("test", 1, "00000002", 4, true);

    expect(mocks.bomService.update.mock.calls).toEqual([
      ["00000002", { active: false }, 3, adminActor],
      ["00000002", { active: true }, 4, adminActor],
    ]);
  });

  it("refuses every write to a normal user and to a signed-out caller, writing and refreshing nothing (TEN-004)", async () => {
    const writes = [
      () => createBom("prod", 1, { ...RECIPE, output: "00000005" }),
      () => updateBomRecipe("prod", 1, "00000002", 1, RECIPE),
      () => setBomActive("prod", 1, "00000002", 1, false),
    ];
    for (const [user, code] of [
      [alice, "FORBIDDEN"],
      [null, "UNAUTHORIZED"],
    ] as const) {
      mocks.currentUser.mockResolvedValue(user);
      for (const write of writes) await expect(write()).resolves.toMatchObject({ ok: false, error: { code } });
    }

    expect(mocks.bomService.create).not.toHaveBeenCalled();
    expect(mocks.bomService.update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refreshes after a stale version, and not after a read-only refusal", async () => {
    mocks.bomService.update.mockRejectedValueOnce(new ConflictError("Reload.", "VERSION_CONFLICT"));
    await expect(setBomActive("prod", 1, "00000002", 1, false)).resolves.toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/prod/boms/00000002");

    mocks.revalidatePath.mockClear();
    mocks.bomService.update.mockRejectedValueOnce(new ConflictError("Read-only.", "TENANT_READ_ONLY"));
    await expect(updateBomRecipe("prod", 1, "00000002", 1, RECIPE)).resolves.toMatchObject({ error: { code: "TENANT_READ_ONLY" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a line's field error by its path, and treats non-object values as empty", async () => {
    const line = await updateBomRecipe("prod", 1, "00000002", 1, { ...RECIPE, components: [{ ...LINES[0], quantity: "0" }] });
    const empty = await updateBomRecipe("prod", 1, "00000002", 1, "not a form");

    expect(line).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED", fieldErrors: { "components.0.quantity": [expect.any(String)] } } });
    expect(empty).toMatchObject({ ok: false, error: { fieldErrors: { priority: [expect.any(String)] } } });
    expect(mocks.bomService.update).not.toHaveBeenCalled();
  });
});
