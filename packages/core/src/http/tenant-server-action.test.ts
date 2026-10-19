import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate, Setting, Tenant } from "@cpg/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { loadConfig } from "../config";
import { getContainer } from "../container/container";
import type { AppContainer } from "../container/cradle";
import { toDbOptions } from "../database";
import { NotFoundError } from "./errors";
import { INTERNAL_ERROR } from "./server-action";
import { tenantServerAction } from "./tenant-server-action";

const schema = z.object({ name: z.string().min(1, "Required.") });

describe("tenantServerAction", () => {
  beforeAll(async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-tenant-action-"));
    await migrate(toDbOptions(loadConfig({ DATA_DIR: dataDir })));
    vi.stubEnv("DATA_DIR", dataDir);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await (await getContainer()).cradle.orm.close();
    vi.unstubAllEnvs();
  });

  it("runs the handler on the parsed input in the bound tenant's scope", async () => {
    const handler = vi.fn(async ({ name }: { name: string }, scope: AppContainer) => `${name} in ${scope.cradle.tenant.name}`);

    await expect(tenantServerAction(schema, handler)("prod", 1, { name: "rock" })).resolves.toEqual({
      ok: true,
      data: "rock in Prod",
    });
  });

  it("rejects an unknown tenant before parsing the input", async () => {
    const handler = vi.fn();

    await expect(tenantServerAction(schema, handler)("staging", 1, { name: "" })).resolves.toEqual({
      ok: false,
      error: { code: "TENANT_NOT_FOUND", message: "Unknown tenant." },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input", async () => {
    await expect(tenantServerAction(schema, vi.fn())("test", 1, { name: "" })).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_FAILED", fieldErrors: { name: ["Required."] } },
    });
  });

  it("maps errors from the handler like serverAction", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const notFound = tenantServerAction(schema, async () => {
      throw new NotFoundError();
    });
    const broken = tenantServerAction(schema, async () => {
      throw new Error("disk on fire");
    });

    await expect(notFound("test", 1, { name: "x" })).resolves.toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Not found." },
    });
    await expect(broken("test", 1, { name: "x" })).resolves.toEqual({ ok: false, error: INTERNAL_ERROR });
  });

  describe("the dataset generation (R07, TEN-030)", () => {
    const orm = async () => (await getContainer()).cradle.orm;
    afterEach(async () => {
      await (await orm()).em.fork().nativeUpdate(Tenant, {}, { generation: 1 });
    });

    it("refuses a form rendered before a reset with GENERATION_STALE, without running the handler", async () => {
      await (await orm()).em.fork().nativeUpdate(Tenant, { code: "test" }, { generation: 2 });
      const handler = vi.fn();

      await expect(tenantServerAction(schema, handler)("test", 1, { name: "rock" })).resolves.toEqual({
        ok: false,
        error: {
          code: "GENERATION_STALE",
          message: "This tenant's data was reset since you read it: its generation is now 2. Reload and try again.",
        },
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it.each([0, 1.5, "1", null])("refuses a bound generation of %j as GENERATION_REQUIRED", async (generation) => {
      const handler = vi.fn();

      await expect(
        tenantServerAction(schema, handler)("prod", generation as unknown as number, { name: "rock" }),
      ).resolves.toMatchObject({ ok: false, error: { code: "GENERATION_REQUIRED" } });
      expect(handler).not.toHaveBeenCalled();
    });

    it("runs the handler in one transaction, rolled back when it fails", async () => {
      const action = tenantServerAction(schema, async ({ name }, scope) => {
        scope.cradle.em.create(Setting, { key: `tenant-action.${name}`, value: "1" });
        await scope.cradle.em.flush();
        throw new NotFoundError();
      });

      await expect(action("prod", 1, { name: "rolled-back" })).resolves.toMatchObject({ ok: false });
      expect(await (await orm()).em.fork().count(Setting, { key: "tenant-action.rolled-back" })).toBe(0);
    });
  });
});
