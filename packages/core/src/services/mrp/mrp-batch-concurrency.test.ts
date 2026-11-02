import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type AppConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { inRequestTransaction, isStaleSnapshot, retryingStaleSnapshot } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";

/*
 * Automatic runs on two connections (E19-S03 Q4, RUN-019): two ORMs on one file stand for two Next.js bundles
 * (lesson 2026-10-17). Queued behind the write gate, the later run plans against the earlier one's documents,
 * so no need is covered twice and no busy flag is needed.
 */
const NOW = new Date("2026-10-01T09:30:00.000Z");
const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };
const PLANT = "00000001";

let config: AppConfig;
const orms: Orm[] = [];
async function bundle(): Promise<{ orm: Orm; prod: () => Promise<AppContainer> }> {
  const orm = await initOrm(toDbOptions(config));
  orms.push(orm);
  const container = createAppContainer(config, orm);
  return { orm, prod: () => scopeForTenant(container, "prod") };
}
/** An automatic run the way the write wrappers run it, counting its attempts. */
function automatic(scope: () => Promise<AppContainer>, attempts: { n: number }, beforeRun: () => Promise<void> = async () => {}) {
  return retryingStaleSnapshot(async () => {
    attempts.n += 1;
    const { cradle } = await scope();
    return inRequestTransaction(cradle.em, async () => {
      await cradle.tenantService.currentState("prod");
      await beforeRun();
      return cradle.mrpRunService.run(ANNA, { mode: "automatic" });
    });
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-batch-concurrency-")) });
  await migrateDatabase(config);
  const { prod } = await bundle();
  const { cradle } = await prod();
  await cradle.customerService.create({ name: "Retail" }, ANNA);
  await cradle.locationService.create({ name: "Plant" }, ANNA);
  // Enough Buy needs for a few flush chunks, so the first batch yields while the second waits.
  for (let index = 0; index < 30; index += 1) {
    const item = await (await prod()).cradle.materialService.create({ type: "raw", description: `Item ${index}`, baseUnit: "kg" }, ANNA);
    await (await prod()).cradle.planningParameterService.create(
      { material: item.id, location: PLANT, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "0.000001" },
      ANNA,
    );
    await (await prod()).cradle.customerOrderService.create(
      { customer: "00000001", location: PLANT, lines: [{ material: item.id, quantity: "5", unit: "kg", requiredDate: "2026-10-06" }] },
      ANNA,
    );
  }
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const orm of orms.splice(0)) await orm.close();
});

describe("automatic MRP runs on two connections (RUN-019)", () => {
  it("queues two runs started in the same tick: one batch creates the documents, the other plans against them and creates none", async () => {
    const one = await bundle();
    const two = await bundle();
    const [first, second] = [{ n: 0 }, { n: 0 }];

    const views = await Promise.all([automatic(one.prod, first), automatic(two.prod, second)]);

    const [earlier, later] = [...views].sort((a, b) => a.id.localeCompare(b.id));
    expect(earlier.creation).toEqual({ status: "created", documents: 30 });
    expect(later.creation).toEqual({ status: "created", documents: 0 });
    // The later one read before the earlier one held the gate, so its first write found its snapshot stale, and it ran again.
    expect(first.n + second.n).toBe(3);
    const rows = await one.orm.em.getConnection().execute("select count(*) as n, count(distinct material_id) as materials, min(mrp_run) as run from purchase_requisition");
    expect(rows).toEqual([{ n: 30, materials: 30, run: earlier.id }]);
  });

  it("fails the request, storing nothing, when another connection commits a write before its retry's first write too (spec Q4)", async () => {
    const runner = await bundle();
    const writer = await bundle();
    const attempts = { n: 0 };
    // Each attempt reads, then another bundle commits a recount before the run's first write: both attempts are stale.
    const recount = async () => {
      await (await writer.prod()).cradle.stockService.correct({ material: "00000001", location: PLANT, quantity: String(attempts.n), unit: "kg", reason: "Recount" }, ANNA);
    };

    const failure = await automatic(runner.prod, attempts, recount).catch((error: unknown) => error);

    expect(isStaleSnapshot(failure)).toBe(true);
    expect(attempts.n).toBe(2);
    const counts = await runner.orm.em.getConnection().execute("select (select count(*) from mrp_run) as runs, (select count(*) from purchase_requisition) as requisitions");
    expect(counts).toEqual([{ runs: 0, requisitions: 0 }]);
  });
});
