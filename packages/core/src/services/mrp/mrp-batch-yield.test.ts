import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, MrpRun, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { createAppContainer } from "../../container/container";
import type { AppContainer } from "../../container/cradle";
import { scopeForTenant } from "../../container/tenant-scope";
import { migrateDatabase, toDbOptions } from "../../database";
import { inRequestTransaction } from "../../http/request-transaction";
import { yieldToEventLoop } from "../../http/yield-to-event-loop";
import type { AuditActor } from "../audit/actor";

// Counted, but still yielding: the batch must hand the event loop back after every document (#320 Q10).
vi.mock("../../http/yield-to-event-loop", async (original) => {
  const actual = await original<typeof import("../../http/yield-to-event-loop")>();
  return { yieldToEventLoop: vi.fn(actual.yieldToEventLoop) };
});

const NOW = new Date("2026-10-01T09:30:00.000Z");
const ANNA: AuditActor = { userId: "anna-id", username: "anna", sessionId: "anna-session", channel: "ui", token: null };
const PLANT = "00000001";

let orm: Orm;
let container: AppContainer;
const scope = () => scopeForTenant(container, "prod");

beforeEach(async () => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-mrp-batch-yield-")) });
  await migrateDatabase(config);
  orm = await initOrm(toDbOptions(config));
  container = createAppContainer(config, orm);
});
afterEach(async () => {
  vi.useRealTimers();
  await orm.close();
});

describe("the automatic batch's yields", () => {
  it("hands the event loop back after every document, not only after every chunk of 25, so a production order's reads never add up to a long stall (#320)", async () => {
    const { cradle } = await scope();
    await cradle.customerService.create({ name: "Retail" }, ANNA);
    await cradle.locationService.create({ name: "Plant" }, ANNA);
    for (let index = 0; index < 3; index += 1) {
      const item = await cradle.materialService.create({ type: "finished", description: `Item ${index}`, baseUnit: "kg" }, ANNA);
      await cradle.planningParameterService.create(
        { material: item.id, location: PLANT, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0.000000", lotMultiple: "1.000000" },
        ANNA,
      );
      await cradle.customerOrderService.create({ customer: "00000001", location: PLANT, lines: [{ material: item.id, quantity: "10", unit: "kg", requiredDate: "2026-10-05" }] }, ANNA);
    }
    const stored = await inRequestTransaction(cradle.em, () => cradle.mrpRunService.run(ANNA, { mode: "manual" }));
    const batch = await scope();
    vi.mocked(yieldToEventLoop).mockClear();

    const outcome = await inRequestTransaction(batch.cradle.em, async () =>
      batch.cradle.mrpBatchService.createAll(await batch.cradle.em.findOneOrFail(MrpRun, { code: stored.id }), ANNA));

    expect(outcome.creation).toEqual({ status: "created", documents: 3 });
    expect(yieldToEventLoop).toHaveBeenCalledTimes(3);
  });
});
