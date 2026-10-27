import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate } from "@cpg/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { getContainer } from "../../container/container";
import { tenantScope } from "../../container/tenant-scope";
import { toDbOptions } from "../../database";
import { tenantServerAction } from "../../http/tenant-server-action";
import { mrpRunSchema } from "../../validators/mrp/mrp-run.schema";
import type { AuditActor } from "../audit/actor";
import { fingerprintOf, operationOf } from "../idempotency/fingerprint";

/*
 * The run trusts its callers for the read-only and generation gate (spec, "Read-only, generation and
 * channels"). The app's tests mock `@cpg/core`, so these run the real wrappers around the real service:
 * the Run MRP action's `tenantServerAction`, and the `IdempotencyService` behind `tenantApiWrite`.
 */
const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };
const ADMIN_TOKEN: AuditActor = { userId: "admin-id", username: "admin", sessionId: null, channel: "api", token: { id: "t", name: "ops" } };
const runAction = tenantServerAction(mrpRunSchema, (_input, { cradle }) => cradle.mrpRunService.run(ANNA));

const sql = async (query: string) => (await getContainer()).cradle.orm.em.getConnection().execute(query);
const runs = async () => (await sql("select tenant_code, code from mrp_run order by tenant_code, code")) as { tenant_code: string; code: string }[];
/** A keyed API run, as `POST /api/tenants/{tenant}/mrp/runs` makes it. */
async function apiRun(tenant: "prod" | "test", key: string, generation: number | null) {
  const { cradle } = await tenantScope(tenant);
  const write = { method: "POST", path: `/api/tenants/${tenant}/mrp/runs`, body: null };
  return cradle.idempotencyService.run(
    { userId: ADMIN_TOKEN.userId, key, operation: operationOf(write), fingerprint: await fingerprintOf(write) },
    { kind: "tenant", tenant, generation, requireGeneration: tenant === "test" },
    () => cradle.mrpRunService.run(ADMIN_TOKEN),
  );
}

describe("the gate around an MRP run", () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-mrp-gate-"));
  beforeAll(async () => {
    await migrate(toDbOptions(loadConfig({ DATA_DIR: dataDir })));
    vi.stubEnv("DATA_DIR", dataDir);
  });
  afterEach(async () => {
    await sql("update tenant set read_only = 0");
    await sql("delete from mrp_daily_result");
    await sql("delete from mrp_run");
  });
  afterAll(async () => {
    await (await getContainer()).cradle.orm.close();
    vi.unstubAllEnvs();
  });

  it("runs from the page in a writable tenant", async () => {
    await expect(runAction("prod", 1, {})).resolves.toMatchObject({ ok: true, data: { id: "00000001", account: "anna", channel: "ui" } });
    expect(await runs()).toEqual([{ tenant_code: "prod", code: "00000001" }]);
  });

  it("refuses a run from the page in a read-only tenant, and stores nothing (RUN-021, TEN-019)", async () => {
    await sql("update tenant set read_only = 1 where code = 'prod'");

    await expect(runAction("prod", 1, {})).resolves.toMatchObject({ ok: false, error: { code: "TENANT_READ_ONLY" } });
    expect(await runs()).toEqual([]);
  });

  it("refuses a run from a page rendered for an older Test generation, and stores nothing", async () => {
    await sql("update tenant set generation = 2 where code = 'test'");
    try {
      await expect(runAction("test", 1, {})).resolves.toMatchObject({ ok: false, error: { code: "GENERATION_STALE" } });
      expect(await runs()).toEqual([]);
    } finally {
      await sql("update tenant set generation = 1 where code = 'test'");
    }
  });

  it("refuses an input the run doesn't take", async () => {
    await expect(runAction("prod", 1, { mode: "automatic" })).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(await runs()).toEqual([]);
  });

  it("refuses an API run in a read-only tenant, the admin's token included, and stores nothing (RUN-021, TEN-019)", async () => {
    await sql("update tenant set read_only = 1 where code = 'prod'");

    await expect(apiRun("prod", "key-1", null)).rejects.toMatchObject({ code: "TENANT_READ_ONLY", status: 409 });
    expect(await runs()).toEqual([]);
  });

  it("refuses a Test API run without the generation, or with a stale one, and stores nothing (R07)", async () => {
    await expect(apiRun("test", "key-2", null)).rejects.toMatchObject({ code: "GENERATION_REQUIRED", status: 428 });
    await expect(apiRun("test", "key-3", 7)).rejects.toMatchObject({ code: "GENERATION_STALE", status: 409 });
    expect(await runs()).toEqual([]);
  });

  it("replays a repeated API run with the same key, so no second run exists", async () => {
    const first = await apiRun("test", "key-4", 1);
    const repeat = await apiRun("test", "key-4", 1);

    expect(first.replayed).toBe(false);
    expect(repeat).toEqual({ data: JSON.parse(JSON.stringify(first.data)), replayed: true });
    expect(await runs()).toEqual([{ tenant_code: "test", code: "00000001" }]);
  });
});
