import { ConflictError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addConversion, changeConversion, createMaterial, removeConversion, updateMaterial } from "./actions";

const admin = { sessionId: "s1", userId: "u1", username: "admin", role: "admin" };
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
/** The audit actor the actions must pass: the signed-in admin's own session, on the UI channel. */
const adminActor = { userId: "u1", username: "admin", sessionId: "s1", channel: "ui", token: null };
const bolt = { id: "00000002", type: "raw", description: "Bolt M8", baseUnit: "each", active: true, version: 1 };
const conversion = { unit: "case", numerator: "12", denominator: "1", inverse: "0.083333", version: 1 };

const mocks = vi.hoisted(() => ({
  materialService: {
    create: vi.fn(),
    update: vi.fn(),
    addConversion: vi.fn(),
    changeConversion: vi.fn(),
    removeConversion: vi.fn(),
  },
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
        return core.serverAction(schema, (input) => handler(input, { cradle: { materialService: mocks.materialService } }))(raw);
      },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("materials actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(admin);
    mocks.materialService.create.mockResolvedValue(bolt);
    mocks.materialService.update.mockResolvedValue({ ...bolt, version: 2 });
    mocks.materialService.addConversion.mockResolvedValue(conversion);
    mocks.materialService.changeConversion.mockResolvedValue({ ...conversion, numerator: "10", version: 2 });
    mocks.materialService.removeConversion.mockResolvedValue({ unit: "case" });
  });
  afterEach(() => vi.clearAllMocks());

  it("creates a material in the bound tenant and generation, and refreshes the list (MAT-001)", async () => {
    await expect(createMaterial("prod", 1, { type: "raw", description: " Bolt M8 ", baseUnit: "each" })).resolves.toEqual({
      ok: true,
      data: bolt,
    });

    expect(mocks.bound).toHaveBeenCalledWith("prod", 1);
    expect(mocks.materialService.create).toHaveBeenCalledWith({ type: "raw", description: "Bolt M8", baseUnit: "each" }, adminActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/prod/materials"]]);
  });

  it("edits the bound material at the bound version, whatever the form sends as its ID (MAT-004)", async () => {
    await updateMaterial("test", 1, "00000002", 1, { description: "Bolt", materialId: "00000009", version: 7 });

    expect(mocks.materialService.update).toHaveBeenCalledWith("00000002", { description: "Bolt" }, 1, adminActor);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/test/materials"], ["/admin/test/materials/00000002"]]);
  });

  it("deactivates through the same edit", async () => {
    await updateMaterial("test", 1, "00000002", 3, { active: false });

    expect(mocks.materialService.update).toHaveBeenCalledWith("00000002", { active: false }, 3, adminActor);
  });

  it("adds, changes and removes conversions of the bound material", async () => {
    await expect(addConversion("prod", 1, "00000002", { unit: "case", numerator: "12.0", denominator: "1" })).resolves.toEqual({
      ok: true,
      data: conversion,
    });
    await changeConversion("prod", 1, "00000002", "case", 1, { numerator: "10", denominator: "1", unit: "box" });
    await removeConversion("prod", 1, "00000002", "case", 2);

    expect(mocks.materialService.addConversion).toHaveBeenCalledWith(
      "00000002",
      { unit: "case", numerator: "12", denominator: "1" },
      adminActor,
    );
    expect(mocks.materialService.changeConversion).toHaveBeenCalledWith(
      "00000002",
      "case",
      { numerator: "10", denominator: "1" },
      1,
      adminActor,
    );
    expect(mocks.materialService.removeConversion).toHaveBeenCalledWith("00000002", "case", 2, adminActor);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(6);
  });

  it("refuses a normal user, writing and refreshing nothing (TEN-004)", async () => {
    mocks.currentUser.mockResolvedValue(alice);

    await expect(createMaterial("prod", 1, { type: "raw", description: "x", baseUnit: "kg" })).resolves.toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    await expect(removeConversion("prod", 1, "00000002", "case", 1)).resolves.toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(mocks.materialService.create).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    mocks.currentUser.mockResolvedValue(null);

    await expect(addConversion("prod", 1, "00000002", { unit: "case", numerator: "1", denominator: "1" })).resolves.toMatchObject({
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("refreshes after a stale version, so the page shows the newer values", async () => {
    mocks.materialService.update.mockRejectedValue(new ConflictError("Reload and try again.", "VERSION_CONFLICT"));

    await expect(updateMaterial("prod", 1, "00000002", 1, { description: "x" })).resolves.toMatchObject({
      error: { code: "VERSION_CONFLICT" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/prod/materials/00000002");
  });

  it("doesn't refresh after a read-only refusal, so the dialog keeps explaining it (R05)", async () => {
    mocks.materialService.create.mockRejectedValue(new ConflictError("Read-only.", "TENANT_READ_ONLY"));

    await expect(createMaterial("prod", 1, { type: "raw", description: "Bolt", baseUnit: "each" })).resolves.toMatchObject({
      error: { code: "TENANT_READ_ONLY" },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns field errors without refreshing, and treats non-object values as empty", async () => {
    const result = await addConversion("prod", 1, "00000002", "not a form");

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(Object.keys((result as { error: { fieldErrors: object } }).error.fieldErrors).sort()).toEqual([
      "denominator",
      "numerator",
      "unit",
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
