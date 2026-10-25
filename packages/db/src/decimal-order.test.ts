import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decimalLengthKey } from "./decimal-order";
import { Forecast, Location, Material, selectTenant } from "./index";
import { initOrm, migrate, type Orm } from "./orm";

// Inserted out of numeric and text order; the dates double as the tie-breaker and a label.
const QUANTITIES = [
  ["2026-01-01", "100.000000"],
  ["2026-01-02", "25.000000"],
  ["2026-01-03", "999999999999.000002"],
  ["2026-01-04", "9.5"],
  ["2026-01-05", "0.000000"],
  ["2026-01-06", "12.000000"],
  ["2026-01-07", "999999999999.000001"],
  ["2026-01-08", "12"],
  ["2026-01-09", "12.05"],
] as const;

describe("decimalLengthKey", () => {
  let orm: Orm;

  beforeAll(async () => {
    const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-decimal-order-")), "db.sqlite");
    await migrate({ databasePath });
    orm = await initOrm({ databasePath });
    for (const tenant of ["test", "prod"] as const) {
      const em = orm.em.fork();
      selectTenant(em, tenant);
      const material = em.create(Material, { code: "00000001", type: "raw", description: "Flour", baseUnit: "kg" });
      const location = em.create(Location, { code: "00000001", name: "Plant" });
      for (const [date, quantity] of tenant === "test" ? QUANTITIES : [["2026-01-01", "50.000000"] as const]) {
        em.create(Forecast, { material, location, date, quantity });
      }
      await em.flush();
    }
  });

  afterAll(() => orm.close());

  const quantities = async (dir: "asc" | "desc") => {
    const em = orm.em.fork();
    selectTenant(em, "test");
    const forecasts = await em.find(Forecast, {}, { orderBy: [{ [decimalLengthKey("quantity")]: dir }, { quantity: dir }, { date: "asc" }] });
    return forecasts.map((forecast) => forecast.quantity);
  };

  it("orders decimal text by its numeric value, exactly, through a real find with a tie-breaker", async () => {
    expect(await quantities("asc")).toEqual([
      "0.000000",
      "9.5",
      "12",
      "12.000000",
      "12.05",
      "25.000000",
      "100.000000",
      "999999999999.000001",
      "999999999999.000002",
    ]);
  });

  it("reverses that order descending", async () => {
    expect(await quantities("desc")).toEqual([
      "999999999999.000002",
      "999999999999.000001",
      "100.000000",
      "25.000000",
      "12.05",
      "12.000000",
      "12",
      "9.5",
      "0.000000",
    ]);
  });

  it("leaves the tenant filter on: another tenant's rows never come back", async () => {
    const em = orm.em.fork();
    selectTenant(em, "prod");
    const forecasts = await em.find(Forecast, {}, { orderBy: [{ [decimalLengthKey("quantity")]: "asc" }] });
    expect(forecasts.map((forecast) => forecast.quantity)).toEqual(["50.000000"]);
  });
});
