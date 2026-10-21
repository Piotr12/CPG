import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, expect, it } from "vitest";
import { initOrm, migrate, selectTenant, Material, Location, type Orm } from "@cpg/db";
import { assertReversalSource, subtractReversedQuantity } from "./reversal-records";
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
