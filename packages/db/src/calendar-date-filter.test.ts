import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notCalendarDate } from "./calendar-date-filter";
import { Forecast, Location, Material, selectTenant, type TenantCode } from "./index";
import { initOrm, migrate, type Orm } from "./orm";

/** Real days, a leap day and the first and last day SQLite's `date()` writes among them. */
const REAL = ["2026-10-05", "2024-02-29", "0000-01-01", "9999-12-31"];
/** Dates a legacy import or a hand edit could store: none is a real day written `YYYY-MM-DD`. */
const CORRUPT = ["30/10/2026", "", "2026-02-30", "2025-02-29", "2026-10-5", "2026-13-01", "2026-10-00", " 2026-10-05", "2026-10-05 ", "2026-10-05T00:00", "2461000", "today"];

describe("notCalendarDate", () => {
  let orm: Orm;
  const scoped = (tenant: TenantCode) => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };

  beforeAll(async () => {
    const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-calendar-date-filter-")), "db.sqlite");
    await migrate({ databasePath });
    orm = await initOrm({ databasePath });
    for (const [tenant, dates] of [["prod", [...REAL, ...CORRUPT]], ["test", ["31/10/2026"]]] as const) {
      const em = scoped(tenant);
      const material = em.create(Material, { code: "00000001", type: "raw", description: "Flour", baseUnit: "kg" });
      const location = em.create(Location, { code: "00000001", name: "Plant" });
      for (const date of dates) em.create(Forecast, { material, location, date, quantity: "1.000000" });
      await em.flush();
    }
  });

  afterAll(() => orm.close());

  it("matches every stored date that isn't a real day written YYYY-MM-DD, and no real one", async () => {
    const found = await scoped("prod").find(Forecast, notCalendarDate("date"), { fields: ["date"] });
    expect(found.map(({ date }) => date).sort()).toEqual([...CORRUPT].sort());
  });

  it("combines with the other conditions of a where", async () => {
    const found = await scoped("prod").find(Forecast, { ...notCalendarDate("date"), date: { $gte: "2026-10-01" } }, { fields: ["date"] });
    expect(found.map(({ date }) => date).sort()).toEqual(["2026-10-05 ", "2026-10-05T00:00", "2026-10-5", "2026-13-01", "2461000", "30/10/2026", "today"]);
  });

  it("leaves the tenant filter on: another tenant's rows never come back", async () => {
    const found = await scoped("test").find(Forecast, notCalendarDate("date"), { fields: ["date"] });
    expect(found.map(({ date }) => date)).toEqual(["31/10/2026"]);
  });

  it("refuses anything but a plain column name, so no other SQL can reach the query", () => {
    for (const column of ["f0.date", "effectiveFrom", "date) --", ""]) expect(() => notCalendarDate(column)).toThrow(`Not a column name: ${column}`);
    expect(() => notCalendarDate("effective_from")).not.toThrow();
  });
});
