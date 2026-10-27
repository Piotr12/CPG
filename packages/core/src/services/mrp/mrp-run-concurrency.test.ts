import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, MrpDailyResult, pingDatabase, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type AppConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";

/*
 * Two ORMs on one file stand for two Next.js bundles, each with its own connection (lesson 2026-10-17):
 * a run must neither fail nor block the other one, and a write the other one already had open must
 * not leave a run built from a stale snapshot (spec, "Transactions already open elsewhere").
 */
const NOW = new Date("2026-10-01T09:30:00.000Z");
const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };
const PLANT = "00000001";

let config: AppConfig;
const orms: Orm[] = [];
/** One "bundle": its own ORM and container over the shared file. */
async function bundle(): Promise<{ orm: Orm; container: AppContainer; prod: () => Promise<AppContainer> }> {
  const orm = await initOrm(toDbOptions(config));
  orms.push(orm);
  const container = createAppContainer(config, orm);
  return { orm, container, prod: () => scopeForTenant(container, "prod") };
}
/** A run the way the write wrappers run it: the generation read first, then the handler, retried once on a stale snapshot. */
const wrappedRun = (scope: () => Promise<AppContainer>) =>
  retryingStaleSnapshot(async () => {
    const { cradle } = await scope();
    return inRequestTransaction(cradle.em, async () => {
      await cradle.tenantService.currentState("prod");
      return cradle.mrpRunService.run(ANNA);
    });
  });

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-concurrency-")) });
  await migrateDatabase(config);
  const { prod } = await bundle();
  const { cradle } = await prod();
  await cradle.customerService.create({ name: "Retail" }, ANNA);
  await cradle.locationService.create({ name: "Plant" }, ANNA);
  // Enough pairs for several chunks of daily rows, so a run yields while it writes.
  for (let index = 0; index < 20; index += 1) {
    const product = await (await prod()).cradle.materialService.create({ type: "finished", description: `Product ${index}`, baseUnit: "each" }, ANNA);
    await (await prod()).cradle.stockService.correct({ material: product.id, location: PLANT, quantity: "1", unit: "each", reason: "Count" }, ANNA);
  }
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const orm of orms.splice(0)) await orm.close();
});

describe("MRP runs on two connections", () => {
  it("both commit, one after the other, and the later one is the latest with the only results (spec Q4)", async () => {
    const one = await bundle();
    const two = await bundle();

    // Both transactions begin, and ask for the gate, before either holds it (the race #274 fixed in `holdWriteGate`).
    const [first, second] = await Promise.all([wrappedRun(one.prod), wrappedRun(two.prod)]);

    expect([first.id, second.id].sort()).toEqual(["00000001", "00000002"]);
    const latest = await (await one.prod()).cradle.mrpRunService.current();
    expect(latest?.id).toBe("00000002");
    const rows = await one.orm.em.getConnection().execute<{ code: string; n: number }[]>(
      "select m.code, count(*) as n from mrp_daily_result r join mrp_run m on r.run_id = m.id group by m.code",
    );
    expect(rows).toEqual([{ code: "00000002", n: 20 * 90 }]);
  });

  it("plans again from fresh data when a write already open on the other connection commits during the snapshot", async () => {
    const runner = await bundle();
    const writer = await bundle();
    const { cradle: writing } = await writer.prod();
    // The other bundle's write is open, holding SQLite's write lock, before the run starts.
    await writing.em.begin();
    await writing.stockService.correct({ material: "00000001", location: PLANT, quantity: "5", unit: "each", reason: "Recount" }, ANNA);
    const load = vi.fn();
    const { MrpSnapshotService } = await import("./mrp-snapshot.service");
    const original = MrpSnapshotService.prototype.load;
    vi.spyOn(MrpSnapshotService.prototype, "load").mockImplementation(async function (this: InstanceType<typeof MrpSnapshotService>, today) {
      load(today);
      // It commits while the run reads its snapshot: the run's first write then finds its snapshot stale.
      if (load.mock.calls.length === 1) await writing.em.commit();
      return original.call(this, today);
    });

    const view = await wrappedRun(runner.prod);

    expect(load).toHaveBeenCalledTimes(2);
    expect(view.id).toBe("00000001");
    const [day] = await runner.orm.em.getConnection().execute(
      "select projected_before from mrp_daily_result where material = '00000001' and date = '2026-10-01'",
    );
    // The recount of 5 on top of the 1 counted before: the run planned from what the other bundle committed.
    expect(day).toEqual({ projected_before: "6.000000" });
    expect(await runner.orm.em.getConnection().execute("select count(*) as n from mrp_run")).toEqual([{ n: 1 }]);
  });

  it("lets the server read its sockets and the other connection answer while a run writes", async () => {
    const runner = await bundle();
    const other = await bundle();
    let ticks = 0;
    let pinged = 0;
    let running = true;
    const heartbeat = () => {
      if (!running) return;
      ticks += 1;
      void pingDatabase(other.orm).then(() => (pinged += 1));
      setImmediate(heartbeat);
    };
    setImmediate(heartbeat);

    const view = await wrappedRun(runner.prod).finally(() => (running = false));

    expect(view.pairs).toBe(20);
    // 1,800 rows are four chunks; every chunk and every material chunk of the snapshot yields.
    expect(ticks).toBeGreaterThanOrEqual(4);
    expect(pinged).toBeGreaterThanOrEqual(4);
  });

  it("reads the latest run and its rows from one snapshot, even when a newer run commits in between", async () => {
    const reader = await bundle();
    const runner = await bundle();
    await wrappedRun(runner.prod);
    const { cradle } = await reader.prod();
    const find = cradle.em.find.bind(cradle.em);
    vi.spyOn(cradle.em, "find").mockImplementation(async (entity, ...rest) => {
      // Between the run's header and its rows, another bundle's run supersedes it and deletes its rows.
      if (entity === MrpDailyResult) await wrappedRun(runner.prod);
      return find(entity, ...rest);
    });

    const view = await cradle.mrpRunService.latest({});

    expect(view.run.id).toBe("00000001");
    expect(view.plans).toHaveLength(20);
    expect((await runner.prod().then(({ cradle }) => cradle.mrpRunService.current()))?.id).toBe("00000002");
  });
});
