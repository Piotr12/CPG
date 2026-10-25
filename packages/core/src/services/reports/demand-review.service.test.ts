import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Customer, GoodsIssue, Location, Material, MaterialConversion, StockMovement, initOrm, selectTenant, type Orm, type TenantCode } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { DEMAND_OFFSET_MESSAGE, FINISHED_PRODUCTS_ONLY_MESSAGE } from "../../validators/reports/demand-review.schema";
import type { AuditActor } from "../audit/actor";
import { CustomerOrderService, type CustomerOrderView } from "../customer-orders/customer-order.service";
import { ForecastService } from "../forecasts/forecast.service";
import { GOODS_ISSUE_MOVEMENT, GoodsIssueService } from "../goods-issues/goods-issue.service";
import { ShipmentService } from "../shipments/shipment.service";
import { StockReversalService } from "../stock/stock-reversal.service";
import { StockService } from "../stock/stock.service";
import { DemandReviewService, type DemandFiguresView } from "./demand-review.service";

const ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: "user-session", channel: "ui", token: null };
/** 1 each = 1.5 SU, 1 pallet = 10 each. */
const WIDGET = "00000001";
/** No SU factor. */
const GADGET = "00000002";
const RAW = "00000003";
/** 1 each = 1 SU, never ordered. */
const BOLT = "00000004";
/** No SU factor, never ordered. */
const NUT = "00000005";
const PLANT = "00000001";
const STORE = "00000002";
const DEPOT = "00000003";

// Sunday 25 October 2026: in weeks, bucket 12 is 12–18 Oct, 13 this week (19–25 Oct), 14 the week
// of 26 Oct, 15 of 2 Nov and 17 of 16 Nov.
const NOW = new Date("2026-10-25T12:00:00Z");

const zero: DemandFiguresView = { shipped: "0.000000", ordered: "0.000000", open: "0.000000", overdue: "0.000000", forecast: "0.000000" };
const figures = (values: Partial<DemandFiguresView>): DemandFiguresView => ({ ...zero, ...values });

describe("DemandReviewService", () => {
  let orm: Orm;
  const scoped = (tenant: TenantCode = "prod") => {
    const em = orm.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const review = (query: Record<string, unknown> = {}, tenant: TenantCode = "prod") => new DemandReviewService({ em: scoped(tenant) }).read(query);
  const orders = () => new CustomerOrderService({ em: scoped() });
  const order = (location: string, material: string, quantity: string, requiredDate: string) =>
    orders().create({ customer: "00000001", location, lines: [{ material, quantity, unit: "each", requiredDate }] }, ACTOR);
  /** Ships `quantity` of the order's only line and issues it: today, or on `at` as a seed. */
  const issue = async (target: CustomerOrderView, quantity: string, at?: Date) => {
    const shipment = await new ShipmentService({ em: scoped() }).create(
      { customerOrder: target.id, plannedDate: "2026-10-20", lines: [{ orderLine: target.lines[0].id, quantity, unit: "each" }] },
      ACTOR,
    );
    const input = { shipment: shipment.id, lines: [{ line: 1, quantity, unit: "each" }] };
    const issues = new GoodsIssueService({ em: scoped() });
    return at ? issues.seedDemo(input, at) : issues.post(input, ACTOR);
  };
  const forecast = (material: string, location: string, date: string, quantity: string) =>
    new ForecastService({ em: scoped() }).create({ material, location, date, quantity, unit: "each" }, ACTOR);
  const row = (view: { rows: { key: string; figures: DemandFiguresView[] }[] }, key: string) => view.rows.find((candidate) => candidate.key === key)!.figures;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-demand-review-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    for (const tenant of ["prod", "test"] as const) {
      const em = scoped(tenant);
      const widget = em.create(Material, { code: WIDGET, type: "finished", description: "Widget", baseUnit: "each" });
      em.create(MaterialConversion, { material: widget, unit: "SU", numerator: "1", denominator: "1.5" });
      em.create(MaterialConversion, { material: widget, unit: "pallet", numerator: "10", denominator: "1" });
      em.create(Material, { code: GADGET, type: "finished", description: "Gadget", baseUnit: "each" });
      em.create(Material, { code: RAW, type: "raw", description: "Steel", baseUnit: "kg" });
      const bolt = em.create(Material, { code: BOLT, type: "finished", description: "Bolt", baseUnit: "each" });
      em.create(MaterialConversion, { material: bolt, unit: "SU", numerator: "1", denominator: "1" });
      em.create(Material, { code: NUT, type: "finished", description: "Nut", baseUnit: "box" });
      em.create(Location, { code: PLANT, name: "Plant" });
      em.create(Location, { code: STORE, name: "Store" });
      em.create(Location, { code: DEPOT, name: "Depot" });
      em.create(Customer, { code: "00000001", name: "Retail" });
      await em.flush();
    }
    for (const location of [PLANT, STORE]) {
      for (const material of [WIDGET, GADGET]) {
        await new StockService({ em: scoped() }).correct({ material, location, quantity: "1000", unit: "each", reason: "Count" }, ACTOR);
      }
    }
    // At the plant: 60 widgets due Wednesday, 20 issued today, 40 overdue; 5 issued on 13 Oct (a seed).
    const due = await order(PLANT, WIDGET, "60", "2026-10-21");
    await issue(due, "20");
    const earlier = await order(PLANT, WIDGET, "5", "2026-10-13");
    await issue(earlier, "5", new Date("2026-10-13T09:00:00Z"));
    // At the store: 10 widgets due 3 Nov, issued today and reversed, so open again.
    const reversed = await order(STORE, WIDGET, "10", "2026-11-03");
    const posted = await issue(reversed, "10");
    const goodsIssue = await scoped().findOneOrFail(GoodsIssue, { code: posted.id });
    const movement = await scoped().findOneOrFail(StockMovement, { type: GOODS_ISSUE_MOVEMENT, postingId: goodsIssue.id });
    await new StockReversalService({ em: scoped() }).reverse(movement.id, { reason: "Wrong posting" }, ACTOR);
    // November at the plant: 30 open on the 20th, 50 cancelled (consumes nothing, DEM-011); forecast 100 on the 1st.
    await order(PLANT, WIDGET, "30", "2026-11-20");
    const cancelled = await order(PLANT, WIDGET, "50", "2026-11-10");
    await orders().cancel(cancelled.id, cancelled.version, ACTOR);
    await forecast(WIDGET, PLANT, "2026-11-01", "100");
    // October at the plant: forecast 80 on the 1st, consumed by the 60 + 5 ordered (D08): 15 left, due today.
    await forecast(WIDGET, PLANT, "2026-10-01", "80");
    // A forecast of September has expired.
    await forecast(WIDGET, PLANT, "2026-09-01", "70");
    // Gadgets: 5 due 2 Nov at the plant.
    await order(PLANT, GADGET, "5", "2026-11-02");
  });
  afterEach(async () => {
    vi.useRealTimers();
    await orm.close();
  });

  it("shows every finished product per week in SU, leaving out and naming the one without an SU factor", async () => {
    const view = await review();
    expect(view).toMatchObject({
      today: "2026-10-25", bucket: "week", offset: 0, window: { from: "2026-07-20", to: "2027-01-25" },
      unit: "SU", units: ["SU"], disabledUnits: ["box", "each", "pallet"], materials: [], locations: [],
      excluded: [{ material: GADGET, code: "NO_STATISTICAL_FACTOR" }, { material: NUT, code: "NO_STATISTICAL_FACTOR" }],
    });
    expect(view.buckets).toHaveLength(27);
    expect(view.buckets[13]).toEqual({ start: "2026-10-19", end: "2026-10-26", past: false, current: true, todayFraction: 6 / 7 });
    // The bolt has a factor but no figure: left out and counted. The widget in SU (× 1.5):
    expect(view.rows.map(({ key }) => key)).toEqual([WIDGET]);
    expect(view.omittedRows).toBe(1);
    const widget = row(view, WIDGET);
    expect(widget[12]).toEqual(figures({ shipped: "7.500000", ordered: "7.500000" }));
    expect(widget[13]).toEqual(figures({ shipped: "30.000000", ordered: "90.000000", open: "60.000000", overdue: "60.000000", forecast: "22.500000" }));
    expect(widget[14]).toEqual(figures({ forecast: "105.000000" }));
    expect(widget[15]).toEqual(figures({ ordered: "15.000000", open: "15.000000" }));
    expect(widget[16]).toEqual(zero);
    expect(widget[17]).toEqual(figures({ ordered: "45.000000", open: "45.000000" }));
    expect(view.total).toEqual(widget);
  });

  it("adds the converted products for the total, and leaves the gadget out of SU when it is chosen with another", async () => {
    const view = await review({ material: [BOLT, WIDGET, GADGET], unit: "each" });
    expect(view).toMatchObject({ unit: "SU", units: ["SU"], materials: [BOLT, WIDGET, GADGET], excluded: [{ material: GADGET }] });
    expect(view.omittedRows).toBe(1);
    expect(view.total[13].shipped).toBe("30.000000");
  });

  it("shows nothing but the callout when no chosen product has an SU factor", async () => {
    const view = await review({ material: [GADGET, NUT] });
    expect(view).toMatchObject({ unit: "SU", rows: [], omittedRows: 0, disabledUnits: ["box", "each"] });
    expect(view.excluded.map(({ material }) => material)).toEqual([GADGET, NUT]);
    expect(view.total.every((bucket) => JSON.stringify(bucket) === JSON.stringify(zero))).toBe(true);
  });

  it("shows one product per location, in any of its units, converting each location's base figure once", async () => {
    const view = await review({ material: WIDGET, unit: "pallet", bucket: "month" });
    expect(view).toMatchObject({ unit: "pallet", units: ["each", "pallet", "SU"], disabledUnits: [], window: { from: "2026-01-01", to: "2027-05-01" } });
    expect(view.rows.map(({ key }) => key)).toEqual([PLANT, STORE]);
    expect(view.omittedRows).toBe(1);
    // October (bucket 9) at the plant: 25 shipped, 65 ordered, 40 open and overdue, 15 forecast left; November: 100 − 30 = 70.
    expect(row(view, PLANT)[9]).toEqual(figures({ shipped: "2.500000", ordered: "6.500000", open: "4.000000", overdue: "4.000000", forecast: "1.500000" }));
    expect(row(view, PLANT)[10]).toEqual(figures({ ordered: "3.000000", open: "3.000000", forecast: "7.000000" }));
    expect(row(view, STORE)[10]).toEqual(figures({ ordered: "1.000000", open: "1.000000" }));
    expect(view.total[10]).toEqual(figures({ ordered: "4.000000", open: "4.000000", forecast: "7.000000" }));
  });

  it("defaults one product to its base unit, and to SU after a stale unit", async () => {
    expect((await review({ material: GADGET, unit: "SU" })).unit).toBe("each");
    const gadget = await review({ material: GADGET, location: [STORE, PLANT] });
    expect(gadget).toMatchObject({ unit: "each", units: ["each"], locations: [STORE, PLANT], excluded: [] });
    expect(row(gadget, PLANT)[15]).toEqual(figures({ ordered: "5.000000", open: "5.000000" }));
    expect(gadget.omittedRows).toBe(1);
    expect((await review({ material: [WIDGET, BOLT], unit: "pallet" })).unit).toBe("SU");
  });

  it("reads only the chosen locations", async () => {
    const view = await review({ material: WIDGET, location: STORE });
    expect(view.rows.map(({ key }) => key)).toEqual([STORE]);
    const all = await review({ location: STORE });
    expect(row(all, WIDGET)[13]).toEqual(zero);
    expect(row(all, WIDGET)[15]).toEqual(figures({ ordered: "15.000000", open: "15.000000" }));
  });

  it("moves the window with the offset, keeping today's bucket marked by the real date", async () => {
    const later = await review({ bucket: "day", offset: "1" });
    expect(later.window.from).toBe("2026-10-25");
    expect(later.buckets[0]).toMatchObject({ current: true, todayFraction: 0 });
    expect(row(later, WIDGET)[0]).toEqual(figures({ shipped: "30.000000", open: "60.000000", overdue: "60.000000", forecast: "22.500000" }));
    // One step back still ends on this week (13 back, 13 ahead, moved by 13); two steps leave it.
    expect((await review({ offset: -1 })).window.to).toBe("2026-10-26");
    const earlier = await review({ offset: -2 });
    expect(earlier.window.to).toBe("2026-07-27");
    expect(earlier.rows).toEqual([]);
    expect(earlier.omittedRows).toBe(2);
  });

  it("keeps the tenants apart (R05): Test has the masters but none of Prod's documents", async () => {
    const view = await review({}, "test");
    expect(view.rows).toEqual([]);
    expect(view.omittedRows).toBe(2);
  });

  it("refuses an unknown product or location, a product that isn't finished, and an offset out of range", async () => {
    await expect(review({ material: "00000099" })).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    await expect(review({ location: [PLANT, "00000099"] })).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
    await expect(review({ material: [WIDGET, RAW] })).rejects.toMatchObject({
      code: "VALIDATION_FAILED", fieldErrors: { material: [FINISHED_PRODUCTS_ONLY_MESSAGE] }, messageParams: { material: RAW },
    });
    await expect(review({ offset: "21" })).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { offset: [DEMAND_OFFSET_MESSAGE] } });
  });
});
