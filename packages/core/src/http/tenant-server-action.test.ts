import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "@cpg/db";
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

    await expect(tenantServerAction(schema, handler)("prod", { name: "rock" })).resolves.toEqual({
      ok: true,
      data: "rock in Prod",
    });
  });

  it("rejects an unknown tenant before parsing the input", async () => {
    const handler = vi.fn();

    await expect(tenantServerAction(schema, handler)("staging", { name: "" })).resolves.toEqual({
      ok: false,
      error: { code: "TENANT_NOT_FOUND", message: "Unknown tenant." },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input", async () => {
    await expect(tenantServerAction(schema, vi.fn())("test", { name: "" })).resolves.toMatchObject({
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

    await expect(notFound("test", { name: "x" })).resolves.toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Not found." },
    });
    await expect(broken("test", { name: "x" })).resolves.toEqual({ ok: false, error: INTERNAL_ERROR });
  });
});
