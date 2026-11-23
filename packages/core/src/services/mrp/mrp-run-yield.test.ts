import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { inRequestTransaction } from "../../http/request-transaction";
import { runYielding, yieldToEventLoop } from "../../http/yield-to-event-loop";
import type { AuditActor } from "../audit/actor";
import { MRP_RANK_YIELD_MS } from "./mrp-run.service";

// Counted, but still yielding: a run ranks each pair's shortages while it writes, and must hand the event loop back
// between pairs once `MRP_RANK_YIELD_MS` has passed, however few rows they wrote (#380 spec Q9).
vi.mock("../../http/yield-to-event-loop", async (original) => {
  const actual = await original<typeof import("../../http/yield-to-event-loop")>();
  return { ...actual, yieldToEventLoop: vi.fn(actual.yieldToEventLoop), runYielding: vi.fn(actual.runYielding) };
});

const NOW = new Date("2026-10-01T09:30:00.000Z");
const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };
const PLANT = "00000001";
const PAIRS = 4;

let orm: Orm;
let container: AppContainer;
const scope = () => scopeForTenant(container, "prod");

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-run-yield-")) });
  await migrateDatabase(config);
  orm = await initOrm(toDbOptions(config));
  container = createAppContainer(config, orm);
  const { cradle } = await scope();
  await cradle.customerService.create({ name: "Retail" }, ANNA);
  await cradle.locationService.create({ name: "Plant" }, ANNA);
  // Four pairs, each one short requirement: far fewer rows than a chunk.
  for (let index = 0; index < PAIRS; index += 1) {
    const item = await cradle.materialService.create({ type: "finished", description: `Item ${index}`, baseUnit: "kg" }, ANNA);
    await cradle.customerOrderService.create({ customer: "00000001", location: PLANT, lines: [{ material: item.id, quantity: "10", unit: "kg", requiredDate: "2026-10-05" }] }, ANNA);
  }
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await orm.close();
});

/** The yields one run takes, with `performance.now` advancing `step` ms on every read. */
async function yieldsOfRun(step: number): Promise<number> {
  let clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => (clock += step));
  vi.mocked(yieldToEventLoop).mockClear();
  const { cradle } = await scope();
  await inRequestTransaction(cradle.em, () => cradle.mrpRunService.run(ANNA));
  vi.mocked(performance.now).mockRestore();
  return vi.mocked(yieldToEventLoop).mock.calls.length;
}

describe("a run's yields while it ranks shortages", () => {
  it("yields after a pair once MRP_RANK_YIELD_MS has passed, so ranking never adds up to a long stall, and not while time hasn't", async () => {
    const still = await yieldsOfRun(0);
    const slow = await yieldsOfRun(MRP_RANK_YIELD_MS);

    // One more yield per pair when every pair's ranking takes the whole allowance; the run's own yields are the same.
    expect(slow - still).toBe(PAIRS);
    expect(await orm.em.getConnection().execute("select count(*) as n from mrp_run_exception where exception_code = 'SHORTAGE'")).toEqual([{ n: PAIRS }]);
  });
});

describe("a run's yields while it clears the previous run and plans (#400)", () => {
  it("yields after each of the four ranges it deletes the previous run in, then plans in steps through runYielding", async () => {
    const { cradle } = await scope();
    await inRequestTransaction(cradle.em, () => cradle.mrpRunService.run(ANNA));
    const order: string[] = [];
    const nativeDelete = cradle.em.nativeDelete.bind(cradle.em);
    vi.spyOn(cradle.em, "nativeDelete").mockImplementation((...args) => {
      order.push("delete");
      return nativeDelete(...args);
    });
    vi.mocked(yieldToEventLoop).mockImplementation(() => {
      order.push("yield");
      return new Promise<void>((resolve) => setImmediate(resolve));
    });
    vi.mocked(runYielding).mockClear();

    await inRequestTransaction(cradle.em, () => cradle.mrpRunService.run(ANNA));

    // Each range deletes the daily results, the recommendations and the exceptions, then the server reads its sockets.
    expect(order.slice(0, 16)).toEqual(Array.from({ length: 4 }, () => ["delete", "delete", "delete", "yield"]).flat());
    expect(order.slice(16)).not.toContain("delete");
    expect(runYielding).toHaveBeenCalledTimes(1);
    expect(await orm.em.getConnection().execute("select count(*) as n from mrp_daily_result")).toEqual([{ n: PAIRS * 90 }]);
  });
});
