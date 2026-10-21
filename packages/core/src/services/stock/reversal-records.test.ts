import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { initOrm, migrate, selectTenant, Material, Location, StockMovement, StockReversal, type Orm } from "@cpg/db";
import { postHistoricalInverses, postStockMovements } from "./stock-posting";
import { assertReversalSource, existingReversal, linkReversals, subtractReversedQuantity } from "./reversal-records";
let orm: Orm; let directory: string; let material: Material; let location: Location;
beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "cpg-reversal-source-")); const databasePath = path.join(directory, "db.sqlite");
  await migrate({ databasePath }); orm = await initOrm({ databasePath }); const em = orm.em.fork(); selectTenant(em, "prod");
  material = em.create(Material, { code: "00000001", type: "raw", description: "Bolts", baseUnit: "each" });
  location = em.create(Location, { code: "00000001", name: "Plant" }); await em.flush();
});
afterAll(async () => { await orm.close(); rmSync(directory, { recursive: true }); });
it("matches sign, captured quantity and immutable material/location identities", () => {
  expect(() => assertReversalSource({ quantity: "-2.000000", material, location }, material.id, location.id, "2", -1n)).not.toThrow();
  expect(() => assertReversalSource({ quantity: "2.000000", material, location }, material.id, location.id, "2", 1n)).not.toThrow();
  for (const [quantity, mat, loc, source] of [["2", material.id, location.id, "broken"], ["2", material.id, location.id, "0"], ["-2", material.id, location.id, "2"], ["2", "wrong", location.id, "2"], ["2", material.id, "wrong", "2"]]) {
    expect(() => assertReversalSource({ quantity, material, location }, mat, loc, source, 1n)).toThrow(expect.objectContaining({ code: "STOCK_REVERSAL_INCONSISTENT" }));
  }
});
it("subtracts exact micro-units and refuses corrupt or insufficient document progress", () => {
  expect(subtractReversedQuantity("0.666667", "0.333333")).toBe("0.333334");
  expect(subtractReversedQuantity("5", "5")).toBe("0.000000");
  for (const [total, quantity] of [["broken", "1"], ["5", "broken"], ["1", "2"]]) {
    expect(() => subtractReversedQuantity(total, quantity)).toThrow(expect.objectContaining({ code: "STOCK_REVERSAL_INCONSISTENT" }));
  }
});
it("links each original to the inverse at its position and finds a group's existing reversal", async () => {
  const actor = { userId: "u1", username: "Alice", sessionId: "s1", channel: "ui" as const, token: null };
  const em = orm.em.fork(); selectTenant(em, "prod");
  await em.transactional(async (tx) => {
    const posted = await postStockMovements(tx, { lines: [{ material: "00000001", location: "00000001", quantity: "3", unit: "each" }, { material: "00000001", location: "00000001", quantity: "2", unit: "each" }], reason: "Count" }, { type: "correction", id: randomUUID() }, { kind: "user", actor });
    const originals = await tx.find(StockMovement, { id: { $in: posted.map(({ id }) => id) } }, { populate: ["material", "location"], orderBy: { position: "asc" } });
    expect(await existingReversal(tx, originals)).toBeNull();
    const inverses = await postHistoricalInverses(tx, originals, "Entered twice", randomUUID(), actor);
    await linkReversals(tx, originals, inverses);
    await tx.flush();
    const links = await tx.find(StockReversal, {}, { populate: ["original", "inverse"] });
    expect(links.map(({ original, inverse }) => [original.position, inverse.position, inverse.quantity])).toEqual(expect.arrayContaining([[0, 0, "-3.000000"], [1, 1, "-2.000000"]]));
    expect((await existingReversal(tx, [originals[1]]))?.inverse.postingId).toBe(inverses[0].postingId);
  });
});
