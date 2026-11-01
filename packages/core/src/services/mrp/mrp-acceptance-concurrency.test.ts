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
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import type { AuditActor } from "../audit/actor";
import { MrpSnapshotService } from "./mrp-snapshot.service";

/*
 * Two ORMs on one file stand for two Next.js bundles, each with its own connection (lesson 2026-10-19):
 * two accepts of one proposal, a second click and an API call, must leave exactly one requisition.
 */
const NOW = new Date("2026-10-01T09:30:00.000Z");
const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };
const PLANT = "00000001";

let config: AppConfig;
const orms: Orm[] = [];
async function bundle(): Promise<() => Promise<AppContainer>> {
  const orm = await initOrm(toDbOptions(config));
  orms.push(orm);
  const container = createAppContainer(config, orm);
  return () => scopeForTenant(container, "prod");
}
/** A write the way the wrappers run it: the tenant read first, then the handler, retried once on a stale snapshot. */
const wrapped = <T>(scope: () => Promise<AppContainer>, write: (cradle: AppContainer["cradle"]) => Promise<T>) =>
  retryingStaleSnapshot(async () => {
    const { cradle } = await scope();
    return inRequestTransaction(cradle.em, async () => {
      await cradle.tenantService.currentState("prod");
      return write(cradle);
    });
  });

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-acceptance-race-")) });
  await migrateDatabase(config);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const orm of orms.splice(0)) await orm.close();
});

describe("Accepting one MRP proposal on two connections", () => {
  it("creates one requisition: the other accept, which read before the first committed, is refused as accepted on its retry (R07, spec step 1)", async () => {
    const setup = await bundle();
    const { cradle } = await setup();
    await cradle.customerService.create({ name: "Retail" }, ANNA);
    await cradle.locationService.create({ name: "Plant" }, ANNA);
    const sugar = await cradle.materialService.create({ type: "finished", description: "Sugar", baseUnit: "kg" }, ANNA);
    await cradle.planningParameterService.create({ material: sugar.id, location: PLANT, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "1.000000" }, ANNA);
    await cradle.customerOrderService.create({ customer: "00000001", location: PLANT, lines: [{ material: sugar.id, quantity: "100", unit: "kg", requiredDate: "2026-10-05" }] }, ANNA);
    await wrapped(setup, (scoped) => scoped.mrpRunService.run(ANNA));
    const { run, plans } = await (await setup()).cradle.mrpRunService.latest({});
    const proposal = plans[0].proposals[0].id;
    const plannings = vi.spyOn(MrpSnapshotService.prototype, "load");
    const [one, two] = [await bundle(), await bundle()];

    // Both transactions begin, and read, before either holds the write gate.
    const outcomes = await Promise.allSettled([
      wrapped(one, (scoped) => scoped.mrpAcceptanceService.accept(run.id, proposal, ANNA)),
      wrapped(two, (scoped) => scoped.mrpAcceptanceService.accept(run.id, proposal, ANNA)),
    ]);

    expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toEqual([
      { status: "rejected", reason: expect.objectContaining({ code: "MRP_PROPOSAL_ACCEPTED", messageParams: { document: "00000001", kind: "purchase-requisition" } }) },
    ]);
    const connection = (await setup()).cradle.em.getConnection();
    expect(await connection.execute("select code, mrp_run from purchase_requisition")).toEqual([{ code: "00000001", mrp_run: run.id }]);
    // The winner planned once; the loser planned on the data it had read, failed its first write and was refused on the retry.
    expect(plannings).toHaveBeenCalledTimes(2);
  });
});
