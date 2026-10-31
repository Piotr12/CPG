import { describe, expect, it } from "vitest";
import { formatDecimal, parseDecimal } from "../quantities/decimal";
import type {
  MrpForecast,
  MrpInputs,
  MrpOrderLine,
  MrpProductionOrder,
  MrpPurchaseOrderLine,
  MrpRequisition,
  MrpSafetyTarget,
  MrpStock,
  MrpTransfer,
} from "./mrp-inputs";
import type { MrpPlan } from "./mrp-result";
import { planMrp } from "./plan-mrp";
import { safetyGap } from "./projection/safety-gap";

const TODAY = "2026-10-01";
const q = (text: string) => parseDecimal(text)!;

const stock = (material: string, location: string, physical: string): MrpStock => ({ material, location, physical: q(physical) });

let position = 0;
const line = (overrides: Partial<MrpOrderLine> & { quantity: bigint; requiredDate: string }): MrpOrderLine => ({
  order: "00000001",
  position: ++position,
  material: "M1",
  location: "L1",
  fulfilled: 0n,
  abandoned: 0n,
  status: "open",
  removed: false,
  ...overrides,
});

let requisitionNumber = 0;
const requisition = (overrides: Partial<MrpRequisition> & { quantity: bigint; requiredDate: string }): MrpRequisition => ({
  code: String(++requisitionNumber).padStart(8, "0"),
  material: "M1",
  location: "L1",
  converted: 0n,
  abandoned: 0n,
  status: "open",
  ...overrides,
});
/** A production order of product P at L1 needing 2 of A per unit unless overridden. */
const production = (overrides: Partial<MrpProductionOrder> & { plannedStart: string; plannedFinish: string }): MrpProductionOrder => ({
  order: "00000001",
  material: "P",
  location: "L1",
  quantity: q("100"),
  produced: 0n,
  abandoned: 0n,
  status: "open",
  components: [{ material: "A", perOutput: q("2") }],
  ...overrides,
});
/** A transfer of M1 from S to D, nothing posted yet, unless overridden. */
const transfer = (overrides: Partial<MrpTransfer> & { quantity: bigint; plannedDispatch: string; plannedArrival: string }): MrpTransfer => ({
  transfer: "00000001",
  material: "M1",
  source: "S",
  destination: "D",
  dispatched: 0n,
  received: 0n,
  writtenOff: 0n,
  abandoned: 0n,
  status: "open",
  ...overrides,
});
/** The plan of `material` at `location` among `plans`. */
const planAt = (plans: readonly MrpPlan[], material: string, location = "L1") => plans.find((plan) => plan.material === material && plan.location === location)!;

const orderLine = (overrides: Partial<MrpPurchaseOrderLine> & { quantity: bigint; plannedDate: string }): MrpPurchaseOrderLine => ({
  order: "00000001",
  position: ++position,
  material: "M1",
  location: "L1",
  received: 0n,
  abandoned: 0n,
  status: "open",
  ...overrides,
});

const inputs = (overrides: Partial<MrpInputs> = {}): MrpInputs => ({
  stock: [],
  orderLines: [],
  forecasts: [],
  safetyTargets: [],
  requisitions: [],
  purchaseOrderLines: [],
  productionOrders: [],
  transfers: [],
  ...overrides,
});

const only = (plans: readonly MrpPlan[]) => {
  expect(plans).toHaveLength(1);
  return plans[0];
};
const balances = (plan: MrpPlan) => new Map(plan.buckets.map(({ date, projectedBefore }) => [date, projectedBefore]));

/** Freezes the snapshot all the way down, so a write anywhere in it throws. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe("planMrp", () => {
  it("MRP-003: plans exactly 90 buckets per pair, 1 October through 29 December, in date order", () => {
    const result = planMrp(inputs({ stock: [stock("M1", "L1", "1"), stock("M2", "L1", "2")] }), TODAY);
    expect(result.today).toBe(TODAY);
    expect(result.dates).toHaveLength(90);
    expect(result.plans).toHaveLength(2);
    for (const plan of result.plans) {
      expect(plan.buckets.map(({ date }) => date)).toEqual(result.dates);
      expect(plan.buckets[0].date).toBe("2026-10-01");
      expect(plan.buckets.at(-1)!.date).toBe("2026-12-29");
      expect(new Set(plan.buckets.map(({ date }) => date)).size).toBe(90);
    }
  });

  it("MRP-004: leaves demand due on day 90 out of every bucket, 29 December included", () => {
    const plan = only(planMrp(inputs({ stock: [stock("M1", "L1", "10")], orderLines: [line({ quantity: q("5"), requiredDate: "2026-12-30" })] }), TODAY).plans);
    expect(plan.buckets.every(({ firmDemand }) => firmDemand === 0n)).toBe(true);
    expect(plan.buckets.at(-1)).toMatchObject({ date: "2026-12-29", projectedBefore: q("10") });
    expect(plan.firmDemand).toEqual([]);
  });

  it("MRP-007: starts from physical 100 and drops to 60 on the order's day, with no shortage and no proposal", () => {
    const result = planMrp(inputs({ stock: [stock("M1", "L1", "100")], orderLines: [line({ quantity: q("40"), requiredDate: "2026-10-15" })] }), TODAY);
    const plan = only(result.plans);
    expect(plan.physical).toBe(q("100"));
    for (const bucket of plan.buckets) {
      expect(bucket.projectedBefore).toBe(bucket.date < "2026-10-15" ? q("100") : q("60"));
      expect(bucket.shortage).toBe(0n);
    }
    expect(result.proposals).toEqual([]);
  });

  it("MRP-008, INV-008: projects −15 with a shortage of 15 while the snapshot's physical stays 5", () => {
    const snapshot = deepFreeze(inputs({ stock: [stock("M1", "L1", "5")], orderLines: [line({ quantity: q("20"), requiredDate: "2026-10-10" })] }));
    const before = structuredClone(snapshot);
    const plan = only(planMrp(snapshot, TODAY).plans);
    for (const bucket of plan.buckets) {
      const short = bucket.date >= "2026-10-10";
      expect(bucket.projectedBefore).toBe(short ? -q("15") : q("5"));
      expect(bucket.shortage).toBe(short ? q("15") : 0n);
    }
    expect(snapshot.stock[0].physical).toBe(q("5"));
    expect(snapshot).toEqual(before);
  });

  it("SAL-017: counts an overdue line's outstanding 30 today and keeps its required date of 30 September", () => {
    const plan = only(
      planMrp(inputs({ orderLines: [line({ quantity: q("50"), fulfilled: q("20"), requiredDate: "2026-09-30" })] }), TODAY).plans,
    );
    expect(plan.buckets[0]).toMatchObject({ date: TODAY, firmDemand: q("30") });
    expect(plan.firmDemand).toEqual([expect.objectContaining({ requiredDate: "2026-09-30", date: TODAY, quantity: q("30") })]);
  });

  it("SAL-004: adds no demand for closed-early, cancelled, removed or fully issued lines, and counts the rest at the order's location", () => {
    const orderLines = [
      line({ quantity: q("10"), fulfilled: q("4"), abandoned: q("6"), status: "closed-early", requiredDate: "2026-10-05" }),
      line({ quantity: q("10"), abandoned: q("10"), status: "cancelled", requiredDate: "2026-10-05" }),
      line({ quantity: q("10"), removed: true, requiredDate: "2026-10-05" }),
      line({ quantity: q("10"), fulfilled: q("10"), status: "completed", requiredDate: "2026-10-05" }),
      line({ quantity: q("10"), fulfilled: q("12"), status: "completed", requiredDate: "2026-10-05" }),
      line({ quantity: q("10"), fulfilled: q("12"), requiredDate: "2026-10-05" }),
      line({ quantity: q("10"), abandoned: q("6"), status: "closed-early", requiredDate: "2026-10-05" }),
      line({ quantity: q("10"), status: "cancelled", requiredDate: "2026-10-05" }),
      line({ location: "L2", quantity: q("10"), fulfilled: q("3"), abandoned: q("2"), requiredDate: "2026-10-05" }),
    ];
    const result = planMrp(inputs({ stock: [stock("M1", "L1", "1")], orderLines }), TODAY);
    const [atL1, atL2] = result.plans;
    expect([atL1.location, atL2.location]).toEqual(["L1", "L2"]);
    expect(atL1.buckets.every(({ firmDemand }) => firmDemand === 0n)).toBe(true);
    expect(atL1.firmDemand).toEqual([]);
    expect(atL2.buckets.find(({ date }) => date === "2026-10-05")!.firmDemand).toBe(q("5"));
  });

  it("sums two lines due the same day and keeps a third on its own day", () => {
    const orderLines = [
      line({ quantity: q("3"), requiredDate: "2026-10-05" }),
      line({ order: "00000002", quantity: q("4"), requiredDate: "2026-10-05" }),
      line({ quantity: q("5"), requiredDate: "2026-10-07" }),
    ];
    const plan = only(planMrp(inputs({ stock: [stock("M1", "L1", "20")], orderLines }), TODAY).plans);
    const demand = new Map(plan.buckets.map(({ date, firmDemand }) => [date, firmDemand]));
    expect([demand.get("2026-10-05"), demand.get("2026-10-06"), demand.get("2026-10-07")]).toEqual([q("7"), 0n, q("5")]);
    expect(plan.firmDemand).toHaveLength(3);
    expect(balances(plan).get("2026-10-07")).toBe(q("8"));
  });

  it("R03: 0.3 less three lines of 0.1 ends at exactly 0.000000, and every figure is an exact bigint", () => {
    const orderLines = ["2026-10-02", "2026-10-03", "2026-10-04"].map((requiredDate) => line({ quantity: q("0.1"), requiredDate }));
    const plan = only(planMrp(inputs({ stock: [stock("M1", "L1", "0.3")], orderLines }), TODAY).plans);
    expect(plan.buckets.at(-1)!.projectedBefore).toBe(0n);
    expect(formatDecimal(plan.buckets.at(-1)!.projectedBefore, { fixed: true })).toBe("0.000000");
    expect(typeof plan.physical).toBe("bigint");
    for (const bucket of plan.buckets) {
      for (const [key, value] of Object.entries(bucket)) if (key !== "date") expect(typeof value).toBe("bigint");
    }
    for (const item of plan.firmDemand) expect(typeof item.quantity).toBe("bigint");
  });

  it("gives an equal result for the same snapshot in another order, ties broken by business ID", () => {
    const stockRows = [stock("M2", "L1", "4"), stock("M10", "L2", "3"), stock("M10", "L1", "2"), stock("A1", "L1", "1")];
    const orderLines = [
      line({ material: "M10", order: "00000007", position: 2, quantity: q("1"), requiredDate: "2026-10-03" }),
      line({ material: "M10", order: "00000007", position: 1, quantity: q("1"), requiredDate: "2026-10-03" }),
      line({ material: "M10", order: "00000003", position: 5, quantity: q("1"), requiredDate: "2026-10-03" }),
      line({ material: "M2", order: "00000009", position: 1, quantity: q("2"), requiredDate: "2026-09-20" }),
      line({ material: "M2", order: "00000008", position: 1, quantity: q("2"), requiredDate: "2026-09-25" }),
    ];
    const forward = planMrp(inputs({ stock: stockRows, orderLines }), TODAY);
    const backward = planMrp(inputs({ stock: [...stockRows].reverse(), orderLines: [...orderLines].reverse() }), TODAY);
    expect(backward).toEqual(forward);
    expect(forward.plans.map(({ material, location }) => `${material}@${location}`)).toEqual(["A1@L1", "M10@L1", "M10@L2", "M2@L1"]);
    expect(forward.plans[1].firmDemand.map(({ order, position }) => `${order}/${position}`)).toEqual(["00000003/5", "00000007/1", "00000007/2"]);
    expect(forward.plans[3].firmDemand.map(({ order }) => order)).toEqual(["00000009", "00000008"]);
  });

  it("leaves the figures later stories fill at zero with no forecast, target or supply, so the balance after proposals equals the one before", () => {
    const plan = only(planMrp(inputs({ stock: [stock("M1", "L1", "7")], orderLines: [line({ quantity: q("2"), requiredDate: "2026-10-03" })] }), TODAY).plans);
    for (const bucket of plan.buckets) {
      expect(bucket).toMatchObject({
        forecastDemand: 0n,
        dependentDemand: 0n,
        transferOut: 0n,
        tentativeSupply: 0n,
        dependableSupply: 0n,
        atRiskSupply: 0n,
        transferIn: 0n,
        proposedReceipts: 0n,
        safetyTarget: 0n,
      });
      expect(bucket.projectedAfter).toBe(bucket.projectedBefore);
    }
  });

  it("plans the pairs the snapshot names: stock rows summed, demand-only pairs from zero, nothing for an empty snapshot", () => {
    expect(planMrp(inputs(), TODAY).plans).toEqual([]);
    const result = planMrp(
      inputs({
        stock: [stock("M1", "L1", "60"), stock("M1", "L1", "40"), stock("M3", "L1", "0")],
        orderLines: [
          line({ material: "M2", quantity: q("5"), requiredDate: "2026-10-02" }),
          line({ material: "M4", quantity: q("5"), requiredDate: "2026-12-30" }),
          line({ material: "M5", quantity: q("5"), fulfilled: q("5"), requiredDate: "2026-10-02" }),
        ],
      }),
      TODAY,
    );
    expect(result.plans.map(({ material }) => material)).toEqual(["M1", "M2", "M3"]);
    const [m1, m2, m3] = result.plans;
    expect(m1.physical).toBe(q("100"));
    expect(m1.buckets.at(-1)!.projectedBefore).toBe(q("100"));
    expect(m2.physical).toBe(0n);
    expect(balances(m2).get("2026-10-02")).toBe(-q("5"));
    expect(m3.buckets.every(({ projectedBefore }) => projectedBefore === 0n)).toBe(true);
  });
});

const forecast = (date: string, quantity: string, overrides: Partial<MrpForecast> = {}): MrpForecast => ({
  material: "M1",
  location: "L1",
  date,
  quantity: q(quantity),
  ...overrides,
});
const target = (effectiveFrom: string, quantity: string, overrides: Partial<MrpSafetyTarget> = {}): MrpSafetyTarget => ({
  material: "M1",
  location: "L1",
  effectiveFrom,
  quantity: q(quantity),
  ...overrides,
});
const bucketOf = (plan: MrpPlan, date: string) => plan.buckets.find((bucket) => bucket.date === date)!;
const demandOn = (plan: MrpPlan, date: string) => {
  const { firmDemand, forecastDemand } = bucketOf(plan, date);
  return { firm: formatDecimal(firmDemand, { fixed: true }), forecast: formatDecimal(forecastDemand, { fixed: true }) };
};
const planOf = (result: ReturnType<typeof planMrp>, material: string, location = "L1") => result.plans.find((plan) => plan.material === material && plan.location === location)!;
const totals = (plan: MrpPlan) => ({
  firm: formatDecimal(plan.buckets.reduce((sum, { firmDemand }) => sum + firmDemand, 0n), { fixed: true }),
  forecast: formatDecimal(plan.buckets.reduce((sum, { forecastDemand }) => sum + forecastDemand, 0n), { fixed: true }),
});

describe("planMrp: forecast netting by calendar month (#275, D08)", () => {
  it("DEM-002: a forecast of 100 and an order of 60 the same day, or later that month, plan 60 firm plus 40 forecast", () => {
    const sameDay = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "100")], orderLines: [line({ quantity: q("60"), requiredDate: "2026-10-10" })] }), TODAY).plans);
    expect(demandOn(sameDay, "2026-10-10")).toEqual({ firm: "60.000000", forecast: "40.000000" });
    expect(balances(sameDay).get("2026-10-10")).toBe(-q("100"));
    const later = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "100")], orderLines: [line({ quantity: q("60"), requiredDate: "2026-10-20" })] }), TODAY).plans);
    expect(demandOn(later, "2026-10-10")).toEqual({ firm: "0.000000", forecast: "40.000000" });
    expect(demandOn(later, "2026-10-20")).toEqual({ firm: "60.000000", forecast: "0.000000" });
    expect(later.forecastDemand).toEqual([{ material: "M1", location: "L1", forecastDate: "2026-10-10", date: "2026-10-10", forecastQuantity: q("100"), quantity: q("40") }]);
  });

  it("DEM-003: orders of 120 against a forecast of 100 plan 120 firm and no forecast, never 220 or a negative residual", () => {
    const orderLines = [line({ quantity: q("70"), requiredDate: "2026-10-10" }), line({ quantity: q("50"), requiredDate: "2026-10-28" })];
    const plan = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "100")], orderLines }), TODAY).plans);
    expect(totals(plan)).toEqual({ firm: "120.000000", forecast: "0.000000" });
    expect(plan.forecastDemand).toEqual([]);
  });

  it("DEM-004: a forecast of 100 with no order plans 100 forecast, from zero stock into a shortage of 100", () => {
    const plan = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "100")] }), TODAY).plans);
    expect(plan).toMatchObject({ material: "M1", location: "L1", physical: 0n });
    expect(demandOn(plan, "2026-10-10")).toEqual({ firm: "0.000000", forecast: "100.000000" });
    expect(bucketOf(plan, "2026-10-10")).toMatchObject({ projectedBefore: -q("100"), shortage: q("100") });
  });

  it("DEM-005, DEM-006: an order of another material, or at another location, consumes nothing of the forecast", () => {
    const materials = planMrp(
      inputs({ forecasts: [forecast("2026-10-10", "100", { material: "A" })], orderLines: [line({ material: "B", quantity: q("60"), requiredDate: "2026-10-10" })] }),
      TODAY,
    );
    expect(demandOn(planOf(materials, "A"), "2026-10-10")).toEqual({ firm: "0.000000", forecast: "100.000000" });
    expect(demandOn(planOf(materials, "B"), "2026-10-10")).toEqual({ firm: "60.000000", forecast: "0.000000" });
    const locations = planMrp(
      inputs({ forecasts: [forecast("2026-10-10", "100", { location: "LA" })], orderLines: [line({ location: "LB", quantity: q("60"), requiredDate: "2026-10-10" })] }),
      TODAY,
    );
    expect(demandOn(planOf(locations, "M1", "LA"), "2026-10-10")).toEqual({ firm: "0.000000", forecast: "100.000000" });
    expect(demandOn(planOf(locations, "M1", "LB"), "2026-10-10")).toEqual({ firm: "60.000000", forecast: "0.000000" });
  });

  it("DEM-007 per D08: Tuesday's order consumes Monday's forecast in the same month, an order next month none of it", () => {
    const tuesday = only(planMrp(inputs({ forecasts: [forecast("2026-10-05", "100")], orderLines: [line({ quantity: q("60"), requiredDate: "2026-10-06" })] }), TODAY).plans);
    expect(demandOn(tuesday, "2026-10-05").forecast).toBe("40.000000");
    const nextMonth = planOf(planMrp(inputs({ forecasts: [forecast("2026-10-05", "100")], orderLines: [line({ quantity: q("60"), requiredDate: "2026-11-02" })] }), TODAY), "M1");
    expect(demandOn(nextMonth, "2026-10-05").forecast).toBe("100.000000");
    expect(demandOn(nextMonth, "2026-11-02").firm).toBe("60.000000");
  });

  it("D08: orders of 70 consume a month's forecasts in date order, leaving 0 on the 1st and 30 on the 15th", () => {
    const orderLines = [line({ quantity: q("70"), requiredDate: "2026-10-20" })];
    const plan = only(planMrp(inputs({ forecasts: [forecast("2026-10-15", "50"), forecast("2026-10-01", "50")], orderLines }), TODAY).plans);
    expect(demandOn(plan, "2026-10-01").forecast).toBe("0.000000");
    expect(demandOn(plan, "2026-10-15").forecast).toBe("30.000000");
  });

  it("DEM-008: with 30 of the 60 ordered issued, plans 30 firm plus 40 forecast, 70 in all", () => {
    const orderLines = [line({ quantity: q("60"), fulfilled: q("30"), requiredDate: "2026-10-10" })];
    const plan = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "100")], orderLines }), TODAY).plans);
    expect(demandOn(plan, "2026-10-10")).toEqual({ firm: "30.000000", forecast: "40.000000" });
    expect(balances(plan).get("2026-10-10")).toBe(-q("70"));
  });

  it("DEM-009, SAL-014: a fully issued order plans no firm demand and its consumed forecast stays consumed", () => {
    const orderLines = [line({ quantity: q("60"), fulfilled: q("60"), status: "completed", requiredDate: "2026-10-10" })];
    const plan = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "100")], orderLines }), TODAY).plans);
    expect(totals(plan)).toEqual({ firm: "0.000000", forecast: "40.000000" });
  });

  it("DEM-010, SAL-015: an order of 60 with 30 issued and the rest closed early plans no firm demand and a residual of 70", () => {
    const closed = line({ quantity: q("60"), fulfilled: q("30"), abandoned: q("30"), status: "closed-early", requiredDate: "2026-10-10" });
    // A reversed issue leaves 20 outstanding by arithmetic on a closed line: only the status keeps it out of firm demand.
    const reversed = line({ order: "00000002", quantity: q("60"), fulfilled: q("10"), abandoned: q("30"), status: "closed-early", requiredDate: "2026-10-10" });
    for (const orderLine of [closed, reversed]) {
      const plan = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "100")], orderLines: [orderLine] }), TODAY).plans);
      expect(totals(plan)).toEqual({ firm: "0.000000", forecast: "70.000000" });
    }
  });

  it("DEM-011, SAL-016: an order cancelled before any issue consumes nothing, leaving the forecast at 100", () => {
    const orderLines = [line({ quantity: q("60"), abandoned: q("60"), status: "cancelled", requiredDate: "2026-10-10" })];
    const plan = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "100")], orderLines }), TODAY).plans);
    expect(totals(plan)).toEqual({ firm: "0.000000", forecast: "100.000000" });
  });

  it("SAL-019, DEM-024, R10: a line edited from 60 to 80 plans 80 firm and 20 forecast from the current snapshot", () => {
    const forecasts = [forecast("2026-10-10", "100")];
    const before = only(planMrp(inputs({ forecasts, orderLines: [line({ order: "00000005", position: 1, quantity: q("60"), requiredDate: "2026-10-12" })] }), TODAY).plans);
    expect(totals(before)).toEqual({ firm: "60.000000", forecast: "40.000000" });
    const after = only(planMrp(inputs({ forecasts, orderLines: [line({ order: "00000005", position: 1, quantity: q("80"), requiredDate: "2026-10-12" })] }), TODAY).plans);
    expect(totals(after)).toEqual({ firm: "80.000000", forecast: "20.000000" });
  });

  it("REV-015: reversing a completed order's final issue counts its outstanding quantity as firm again, with consumption unchanged", () => {
    const forecasts = [forecast("2026-10-10", "100")];
    const completed = only(planMrp(inputs({ forecasts, orderLines: [line({ quantity: q("60"), fulfilled: q("60"), status: "completed", requiredDate: "2026-10-10" })] }), TODAY).plans);
    expect(totals(completed)).toEqual({ firm: "0.000000", forecast: "40.000000" });
    const reopened = only(planMrp(inputs({ forecasts, orderLines: [line({ quantity: q("60"), fulfilled: q("25"), status: "open", requiredDate: "2026-10-10" })] }), TODAY).plans);
    expect(totals(reopened)).toEqual({ firm: "35.000000", forecast: "40.000000" });
  });

  it("removes a removed line from consumption, and an order of the forecast's month past the horizon still consumes it", () => {
    const removed = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "100")], orderLines: [line({ quantity: q("60"), requiredDate: "2026-10-12", removed: true })] }), TODAY).plans);
    expect(totals(removed)).toEqual({ firm: "0.000000", forecast: "100.000000" });
    // The horizon ends on 29 December; an order of 30 December adds no firm demand but consumes December's forecast.
    const pastHorizon = only(planMrp(inputs({ forecasts: [forecast("2026-12-20", "100")], orderLines: [line({ quantity: q("60"), requiredDate: "2026-12-30" })] }), TODAY).plans);
    expect(totals(pastHorizon)).toEqual({ firm: "0.000000", forecast: "40.000000" });
  });

  it("R03: a forecast of 0.3 less three orders of 0.1 leaves exactly nothing, and 0.3 less one leaves exactly 0.2", () => {
    const tenth = (order: string) => line({ order, quantity: q("0.1"), requiredDate: "2026-10-10" });
    const none = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "0.3")], orderLines: [tenth("1"), tenth("2"), tenth("3")] }), TODAY).plans);
    expect(none.forecastDemand).toEqual([]);
    expect(none.buckets.every(({ forecastDemand }) => forecastDemand === 0n)).toBe(true);
    const some = only(planMrp(inputs({ forecasts: [forecast("2026-10-10", "0.3")], orderLines: [tenth("1")] }), TODAY).plans);
    expect(bucketOf(some, "2026-10-10").forecastDemand).toBe(200_000n);
    expect(typeof bucketOf(some, "2026-10-10").safetyTarget).toBe("bigint");
  });

  it("plans no pair for a fully consumed forecast whose orders are all issued, and gives an equal result in any input order", () => {
    const issued = line({ quantity: q("120"), fulfilled: q("120"), status: "completed", requiredDate: "2026-10-10" });
    expect(planMrp(inputs({ forecasts: [forecast("2026-10-10", "100")], orderLines: [issued] }), TODAY).plans).toEqual([]);
    const forecasts = [forecast("2026-10-10", "5", { material: "M2" }), forecast("2026-10-03", "5"), forecast("2026-10-05", "5", { location: "L2" })];
    const safetyTargets = [target("2026-10-10", "3", { material: "M3" }), target("2026-09-01", "1", { material: "M3" })];
    const forward = planMrp(inputs({ forecasts, safetyTargets }), TODAY);
    expect(planMrp(inputs({ forecasts: [...forecasts].reverse(), safetyTargets: [...safetyTargets].reverse() }), TODAY)).toEqual(forward);
    expect(forward.plans.map(({ material, location }) => `${material}@${location}`)).toEqual(["M1@L1", "M1@L2", "M2@L1", "M3@L1"]);
  });
});

describe("planMrp: past days (#275, PRD §04)", () => {
  it("DEM-012: an order of 40 due yesterday counts 40 firm today and keeps its required date", () => {
    const plan = only(planMrp(inputs({ orderLines: [line({ quantity: q("40"), requiredDate: "2026-09-30" })] }), TODAY).plans);
    expect(demandOn(plan, TODAY).firm).toBe("40.000000");
    expect(plan.firmDemand).toMatchObject([{ requiredDate: "2026-09-30", date: TODAY }]);
  });

  it("DEM-013: on Wednesday, Monday's unshipped order still consumes Monday's forecast and its 60 is due today", () => {
    const wednesday = "2026-10-07";
    const plan = only(planMrp(inputs({ forecasts: [forecast("2026-10-05", "100")], orderLines: [line({ quantity: q("60"), requiredDate: "2026-10-05" })] }), wednesday).plans);
    expect(demandOn(plan, wednesday)).toEqual({ firm: "60.000000", forecast: "40.000000" });
    expect(plan.forecastDemand).toMatchObject([{ forecastDate: "2026-10-05", date: wednesday, quantity: q("40") }]);
  });

  it("DEM-025 per D08: on 2 September the 30 still to ship of 31 August is due today, and August's residual of 40 has expired", () => {
    const orderLines = [line({ quantity: q("60"), fulfilled: q("30"), requiredDate: "2026-08-31" })];
    const plan = only(planMrp(inputs({ forecasts: [forecast("2026-08-31", "100")], orderLines }), "2026-09-02").plans);
    expect(demandOn(plan, "2026-09-02")).toEqual({ firm: "30.000000", forecast: "0.000000" });
    expect(totals(plan).forecast).toBe("0.000000");
  });

  it("MRP-048 per D08: on 1 October only the unfulfilled 40 of 30 September moves to today, and September's residual expires", () => {
    const orderLines = [line({ quantity: q("60"), fulfilled: q("20"), requiredDate: "2026-09-30" })];
    const plan = only(planMrp(inputs({ forecasts: [forecast("2026-09-30", "100")], orderLines }), TODAY).plans);
    expect(totals(plan)).toEqual({ firm: "40.000000", forecast: "0.000000" });
    expect(demandOn(plan, TODAY).firm).toBe("40.000000");
  });

  it("D08: an earlier residual of this month counts today, and a forecast after day 89 adds nothing", () => {
    const today = "2026-10-20";
    const plan = only(planMrp(inputs({ forecasts: [forecast("2026-10-05", "100")], orderLines: [line({ quantity: q("60"), requiredDate: "2026-10-25" })] }), today).plans);
    expect(demandOn(plan, today).forecast).toBe("40.000000");
    expect(plan.forecastDemand).toMatchObject([{ forecastDate: "2026-10-05", date: today }]);
    expect(planMrp(inputs({ forecasts: [forecast("2026-12-30", "100")] }), TODAY).plans).toEqual([]);
  });
});

describe("planMrp: safety-stock targets (#275, PRD §04)", () => {
  it("DEM-014: with no target the safety target is 0.000000 every day, and no gap appears beyond a shortage", () => {
    const plan = only(planMrp(inputs({ stock: [stock("M1", "L1", "10")], orderLines: [line({ quantity: q("15"), requiredDate: "2026-10-05" })] }), TODAY).plans);
    expect(plan.buckets.every(({ safetyTarget }) => formatDecimal(safetyTarget, { fixed: true }) === "0.000000")).toBe(true);
    expect(plan.buckets.map(safetyGap)).toEqual(plan.buckets.map(({ shortage }) => shortage));
    expect(safetyGap(bucketOf(plan, "2026-10-04"))).toBe(0n);
  });

  it("DEM-015: a target of 100 effective 1 January is 100 on each of 1–15 January", () => {
    const plan = only(planMrp(inputs({ safetyTargets: [target("2027-01-01", "100")] }), "2027-01-01").plans);
    expect(plan.buckets.slice(0, 15).every(({ safetyTarget }) => safetyTarget === q("100"))).toBe(true);
  });

  it("DEM-016: 100 from 1 January and 150 from 1 February switch at the month boundary", () => {
    const plan = only(planMrp(inputs({ safetyTargets: [target("2027-02-01", "150"), target("2027-01-01", "100")] }), "2027-01-01").plans);
    expect(bucketOf(plan, "2027-01-31").safetyTarget).toBe(q("100"));
    expect(bucketOf(plan, "2027-02-01").safetyTarget).toBe(q("150"));
    expect(plan.buckets.at(-1)!.safetyTarget).toBe(q("150"));
  });

  it("MRP-043: a target rising from 20 to 40 measures each day's gap against the target of that day, the target-only pair from zero", () => {
    const safetyTargets = [target("2026-09-01", "20"), target("2026-10-31", "40")];
    const withStock = only(planMrp(inputs({ stock: [stock("M1", "L1", "30")], safetyTargets }), TODAY).plans);
    expect(safetyGap(bucketOf(withStock, "2026-10-30"))).toBe(0n);
    expect(safetyGap(bucketOf(withStock, "2026-10-31"))).toBe(q("10"));
    expect(bucketOf(withStock, "2026-10-31")).toMatchObject({ projectedBefore: q("30"), shortage: 0n });
    const alone = only(planMrp(inputs({ safetyTargets }), TODAY).plans);
    expect(alone.physical).toBe(0n);
    expect(alone.buckets.map(safetyGap).slice(29, 31)).toEqual([q("20"), q("40")]);
  });
});

// The status filter itself is pinned with fixtures that keep a remainder in `supply/purchasing-supply.test.ts`
// ("counts no closed document…"); these tests assert each scenario's outcome through the whole plan.
describe("planMrp: purchasing supply (#276)", () => {
  const supplyOn = (plan: MrpPlan, date: string) => {
    const { tentativeSupply, dependableSupply } = plan.buckets.find((bucket) => bucket.date === date)!;
    return { tentativeSupply, dependableSupply };
  };
  const supplyTotals = (plan: MrpPlan) =>
    plan.buckets.reduce(
      (sum, { tentativeSupply, dependableSupply }) => ({
        tentativeSupply: sum.tentativeSupply + tentativeSupply,
        dependableSupply: sum.dependableSupply + dependableSupply,
      }),
      { tentativeSupply: 0n, dependableSupply: 0n },
    );

  it("BUY-002: projects a direct purchase order's 100 as dependable supply on its planned date", () => {
    const plan = only(planMrp(inputs({ purchaseOrderLines: [orderLine({ quantity: q("100"), plannedDate: "2026-10-15" })] }), TODAY).plans);
    expect(supplyOn(plan, "2026-10-15")).toEqual({ tentativeSupply: 0n, dependableSupply: q("100") });
    expect(supplyTotals(plan)).toEqual({ tentativeSupply: 0n, dependableSupply: q("100") });
    expect(balances(plan).get("2026-10-14")).toBe(0n);
    expect(balances(plan).get("2026-10-15")).toBe(q("100"));
  });

  it("MRP-010: counts a received 40 in physical stock and projects only the order's remaining 60, not another 100", () => {
    const plan = only(
      planMrp(
        inputs({ stock: [stock("M1", "L1", "40")], purchaseOrderLines: [orderLine({ quantity: q("100"), received: q("40"), plannedDate: "2026-10-15" })] }),
        TODAY,
      ).plans,
    );
    expect(plan.physical).toBe(q("40"));
    expect(supplyTotals(plan).dependableSupply).toBe(q("60"));
    expect(plan.buckets.at(-1)!.projectedBefore).toBe(q("100"));
  });

  it("MRP-012: a requisition of 100 converted into a line of 60 projects 60 dependable and 40 tentative, 100 in total", () => {
    const plan = only(
      planMrp(
        inputs({
          requisitions: [requisition({ quantity: q("100"), converted: q("60"), requiredDate: "2026-10-20" })],
          purchaseOrderLines: [orderLine({ quantity: q("60"), plannedDate: "2026-10-12" })],
        }),
        TODAY,
      ).plans,
    );
    expect(supplyOn(plan, "2026-10-12")).toEqual({ tentativeSupply: 0n, dependableSupply: q("60") });
    expect(supplyOn(plan, "2026-10-20")).toEqual({ tentativeSupply: q("40"), dependableSupply: 0n });
    expect(plan.buckets.at(-1)!.projectedBefore).toBe(q("100"));
  });

  it("BUY-026: a requisition of 100 converted entirely into an order of 100 projects 100 dependable, not 200", () => {
    const plan = only(
      planMrp(
        inputs({
          requisitions: [requisition({ quantity: q("100"), converted: q("100"), status: "completed", requiredDate: "2026-10-20" })],
          purchaseOrderLines: [orderLine({ quantity: q("100"), plannedDate: "2026-10-20" })],
        }),
        TODAY,
      ).plans,
    );
    expect(supplyTotals(plan)).toEqual({ tentativeSupply: 0n, dependableSupply: q("100") });
    expect(plan.supply.map(({ kind }) => kind)).toEqual(["purchase-order"]);
  });

  it("BUY-018, MRP-013: neither a Cancelled requisition nor a Cancelled purchase-order line adds incoming supply", () => {
    const plan = only(
      planMrp(
        inputs({
          stock: [stock("M1", "L1", "5")],
          requisitions: [requisition({ quantity: q("100"), abandoned: q("100"), status: "cancelled", requiredDate: "2026-10-20" })],
          purchaseOrderLines: [orderLine({ quantity: q("100"), abandoned: q("100"), status: "cancelled", plannedDate: "2026-10-20" })],
        }),
        TODAY,
      ).plans,
    );
    expect(supplyTotals(plan)).toEqual({ tentativeSupply: 0n, dependableSupply: 0n });
    expect(plan.supply).toEqual([]);
    expect(plan.buckets.at(-1)!.projectedBefore).toBe(q("5"));
  });

  it("BUY-017, MRP-014: a line of 100 with 60 received and the rest Closed Early leaves the 60 in stock and projects no 40", () => {
    const plan = only(
      planMrp(
        inputs({
          stock: [stock("M1", "L1", "60")],
          purchaseOrderLines: [orderLine({ quantity: q("100"), received: q("60"), abandoned: q("40"), status: "closed-early", plannedDate: "2026-10-20" })],
        }),
        TODAY,
      ).plans,
    );
    expect(plan.physical).toBe(q("60"));
    expect(supplyTotals(plan).dependableSupply).toBe(0n);
    expect(plan.buckets.at(-1)!.projectedBefore).toBe(q("60"));
  });

  it("LFC-024: neither a Completed line nor a Closed Early line with 20 abandoned projects incoming supply", () => {
    const purchaseOrderLines = [
      orderLine({ quantity: q("50"), received: q("50"), status: "completed", plannedDate: "2026-10-20" }),
      orderLine({ quantity: q("100"), received: q("80"), abandoned: q("20"), status: "closed-early", plannedDate: "2026-10-20" }),
    ];
    const plan = only(planMrp(inputs({ stock: [stock("M1", "L1", "130")], purchaseOrderLines }), TODAY).plans);
    expect(supplyTotals(plan).dependableSupply).toBe(0n);
    expect(plan.buckets.at(-1)!.projectedBefore).toBe(q("130"));
  });

  it("MRP-015, BUY-019: projects 50 unreceived and 40 outstanding, both due yesterday, today with the Overdue Supply marker", () => {
    const snapshot = deepFreeze(
      inputs({
        stock: [stock("M1", "L1", "5")],
        purchaseOrderLines: [
          orderLine({ quantity: q("50"), plannedDate: "2026-09-30" }),
          orderLine({ order: "00000002", quantity: q("60"), received: q("20"), plannedDate: "2026-09-30" }),
        ],
      }),
    );
    const before = structuredClone(snapshot);
    const plan = only(planMrp(snapshot, TODAY).plans);
    expect(plan.buckets[0]).toMatchObject({ date: TODAY, dependableSupply: q("90"), projectedBefore: q("95") });
    expect(plan.supply.map(({ document, plannedDate, date, overdue, quantity }) => ({ document, plannedDate, date, overdue, quantity }))).toEqual([
      { document: "00000001", plannedDate: "2026-09-30", date: TODAY, overdue: true, quantity: q("50") },
      { document: "00000002", plannedDate: "2026-09-30", date: TODAY, overdue: true, quantity: q("40") },
    ]);
    // Physical stock is unchanged and no receipt is posted: the snapshot is the same afterwards.
    expect(plan.physical).toBe(q("5"));
    expect(snapshot).toEqual(before);
  });

  it("BUY-024: projects a partly received line's outstanding quantity on its revised planned date", () => {
    const plan = only(
      planMrp(inputs({ purchaseOrderLines: [orderLine({ quantity: q("100"), received: q("30"), plannedDate: "2026-10-20" })] }), TODAY).plans,
    );
    expect(supplyOn(plan, "2026-10-10").dependableSupply).toBe(0n);
    expect(supplyOn(plan, "2026-10-20").dependableSupply).toBe(q("70"));
  });

  it("MRP-042: a receipt of 40 and a customer-order line of 40 on the same day balance, with no shortage and physical unchanged", () => {
    const plan = only(
      planMrp(
        inputs({
          orderLines: [line({ quantity: q("40"), requiredDate: "2026-10-10" })],
          purchaseOrderLines: [orderLine({ quantity: q("40"), plannedDate: "2026-10-10" })],
        }),
        TODAY,
      ).plans,
    );
    expect(plan.physical).toBe(0n);
    expect(plan.buckets.find(({ date }) => date === "2026-10-10")).toMatchObject({ firmDemand: q("40"), dependableSupply: q("40"), projectedBefore: 0n, shortage: 0n });
    expect(plan.buckets.every(({ shortage }) => shortage === 0n)).toBe(true);
  });

  it("marks a requisition's unconverted quantity tentative and a purchase-order line dependable, in their own figures", () => {
    const plan = only(
      planMrp(
        inputs({
          requisitions: [requisition({ quantity: q("10"), requiredDate: "2026-10-05" })],
          purchaseOrderLines: [orderLine({ quantity: q("20"), plannedDate: "2026-10-05" })],
        }),
        TODAY,
      ).plans,
    );
    expect(supplyOn(plan, "2026-10-05")).toEqual({ tentativeSupply: q("10"), dependableSupply: q("20") });
    expect(plan.supply.map(({ kind, reliability }) => `${kind}:${reliability}`)).toEqual(["purchase-order:dependable", "requisition:tentative"]);
    expect(balances(plan).get("2026-10-05")).toBe(q("30"));
  });

  it("BUY-015: projects nothing from a line received beyond its quantity, never negative supply", () => {
    const plan = only(
      planMrp(
        inputs({ stock: [stock("M1", "L1", "110")], purchaseOrderLines: [orderLine({ quantity: q("100"), received: q("110"), plannedDate: "2026-10-05" })] }),
        TODAY,
      ).plans,
    );
    expect(supplyTotals(plan).dependableSupply).toBe(0n);
    expect(plan.supply).toEqual([]);
  });

  it("R03, R10: a line of 0.3 with 0.1 and 0.1 received projects exactly 0.1, and the snapshot is never changed", () => {
    const snapshot = deepFreeze(inputs({ purchaseOrderLines: [orderLine({ quantity: q("0.3"), received: q("0.1") + q("0.1"), plannedDate: "2026-10-05" })] }));
    const before = structuredClone(snapshot);
    const plan = only(planMrp(snapshot, TODAY).plans);
    expect(supplyOn(plan, "2026-10-05").dependableSupply).toBe(100_000n);
    expect(formatDecimal(plan.buckets.at(-1)!.projectedBefore, { fixed: true })).toBe("0.100000");
    for (const item of plan.supply) expect(typeof item.quantity).toBe("bigint");
    expect(snapshot).toEqual(before);
  });

  it("plans a pair named only by supply from zero, and leaves a pair whose only supply lies past day 89 unplanned", () => {
    const result = planMrp(
      inputs({
        requisitions: [requisition({ material: "M2", quantity: q("5"), requiredDate: "2026-10-03" })],
        purchaseOrderLines: [orderLine({ material: "M3", quantity: q("5"), plannedDate: "2026-12-30" })],
      }),
      TODAY,
    );
    const plan = only(result.plans);
    expect(plan).toMatchObject({ material: "M2", physical: 0n });
    expect(balances(plan).get("2026-10-02")).toBe(0n);
    expect(balances(plan).get("2026-10-03")).toBe(q("5"));
  });
});

describe("planMrp: demand and supply seams together (#275, #276)", () => {
  it("nets a forecast against its month's orders and projects it with purchasing supply and the day's safety target in one balance", () => {
    const plan = only(
      planMrp(
        inputs({
          stock: [stock("M1", "L1", "10")],
          orderLines: [line({ quantity: q("60"), requiredDate: "2026-10-12" })],
          forecasts: [forecast("2026-10-10", "100")],
          safetyTargets: [target("2026-09-01", "25")],
          requisitions: [requisition({ quantity: q("30"), requiredDate: "2026-10-11" })],
          purchaseOrderLines: [orderLine({ quantity: q("50"), plannedDate: "2026-10-12" })],
        }),
        TODAY,
      ).plans,
    );
    // 10 − 40 forecast left on the 10th, + 30 requisitioned on the 11th, + 50 ordered − 60 firm on the 12th.
    expect(bucketOf(plan, "2026-10-10")).toMatchObject({ forecastDemand: q("40"), projectedBefore: -q("30"), shortage: q("30"), safetyTarget: q("25") });
    expect(bucketOf(plan, "2026-10-11")).toMatchObject({ tentativeSupply: q("30"), projectedBefore: 0n, shortage: 0n });
    expect(bucketOf(plan, "2026-10-12")).toMatchObject({ dependableSupply: q("50"), firmDemand: q("60"), projectedBefore: -q("10"), shortage: q("10") });
    expect(safetyGap(bucketOf(plan, "2026-10-12"))).toBe(q("35"));
    expect([plan.firmDemand.length, plan.forecastDemand.length, plan.supply.length]).toEqual([1, 1, 2]);
  });
});

describe("planMrp: open production orders (#277)", () => {
  // Wednesday 28 October 2026; 1 November is a Sunday, 2 November a Monday, 6 November a Friday.
  const TODAY_PO = "2026-10-28";

  it("MRP-017: expects a 5-day order's output on Friday 6 November and its inputs on Sunday 1 November, calendar days", () => {
    const { plans } = planMrp(inputs({ productionOrders: [production({ plannedStart: "2026-11-01", plannedFinish: "2026-11-06" })] }), TODAY_PO);
    const output = planAt(plans, "P");
    const input = planAt(plans, "A");
    expect(output.buckets.filter(({ dependableSupply }) => dependableSupply !== 0n).map(({ date }) => date)).toEqual(["2026-11-06"]);
    expect(input.buckets.filter(({ dependentDemand }) => dependentDemand !== 0n).map(({ date }) => date)).toEqual(["2026-11-01"]);
    expect(output.productionOutput).toEqual([
      { order: "00000001", material: "P", location: "L1", plannedFinish: "2026-11-06", date: "2026-11-06", quantity: q("100"), overdue: false },
    ]);
    expect(input.componentDemand).toEqual([
      { order: "00000001", material: "A", location: "L1", plannedStart: "2026-11-01", date: "2026-11-01", quantity: q("200"), overdue: false },
    ]);
  });

  it("MRP-018: subtracts the pinned BOM's 80 of A from A's projection on Monday, the start day", () => {
    const order = production({ quantity: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const input = planAt(planMrp(inputs({ stock: [stock("A", "L1", "100")], productionOrders: [order] }), TODAY_PO).plans, "A");
    expect(bucketOf(input, "2026-11-01").projectedBefore).toBe(q("100"));
    expect(bucketOf(input, "2026-11-02")).toMatchObject({ dependentDemand: q("80"), projectedBefore: q("20") });
    expect(bucketOf(input, "2026-11-06").projectedBefore).toBe(q("20"));
  });

  it("MRP-019: keeps the physical 100 while the projection after the start day is 20, writing nothing", () => {
    const snapshot = deepFreeze(
      inputs({ stock: [stock("A", "L1", "100")], productionOrders: [production({ quantity: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" })] }),
    );
    const before = structuredClone(snapshot);
    const input = planAt(planMrp(snapshot, TODAY_PO).plans, "A");
    expect(input.physical).toBe(q("100"));
    expect(input.buckets.at(-1)!.projectedBefore).toBe(q("20"));
    expect(snapshot).toEqual(before);
  });

  it("PRD-009: shows the shortage of unavailable components on the future order's start day, physical unchanged", () => {
    const input = planAt(
      planMrp(inputs({ stock: [stock("A", "L1", "0")], productionOrders: [production({ quantity: q("10"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" })] }), TODAY_PO).plans,
      "A",
    );
    expect(input.physical).toBe(0n);
    expect(bucketOf(input, "2026-11-01").shortage).toBe(0n);
    expect(bucketOf(input, "2026-11-02")).toMatchObject({ dependentDemand: q("20"), shortage: q("20") });
  });

  it("MRP-023: Friday's output doesn't cover Wednesday's demand: Wednesday is short and the output lands Friday", () => {
    const { plans } = planMrp(
      inputs({
        orderLines: [line({ material: "P", quantity: q("50"), requiredDate: "2026-11-04" })],
        productionOrders: [production({ quantity: q("50"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" })],
      }),
      TODAY_PO,
    );
    const product = planAt(plans, "P");
    expect(bucketOf(product, "2026-11-04")).toMatchObject({ projectedBefore: -q("50"), shortage: q("50") });
    expect(bucketOf(product, "2026-11-05").shortage).toBe(q("50"));
    expect(bucketOf(product, "2026-11-06")).toMatchObject({ dependableSupply: q("50"), projectedBefore: 0n, shortage: 0n });
  });

  it("MRP-011, MRP-021: projects only the unproduced 60 as output and 120 kg of A for it, the produced 40 being physical", () => {
    const order = production({ produced: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const { plans } = planMrp(inputs({ stock: [stock("P", "L1", "40")], productionOrders: [order] }), TODAY_PO);
    const product = planAt(plans, "P");
    expect(product.physical).toBe(q("40"));
    expect(bucketOf(product, "2026-11-06")).toMatchObject({ dependableSupply: q("60"), projectedBefore: q("100") });
    expect(bucketOf(planAt(plans, "A"), "2026-11-02").dependentDemand).toBe(q("120"));
  });

  it("PRD-028: plans the remaining 60 by the recipe, whatever the completion of 40 actually consumed", () => {
    // The completion used 160 kg of A instead of 80, which is already out of A's physical 40.
    const order = production({ produced: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const input = planAt(planMrp(inputs({ stock: [stock("A", "L1", "40")], productionOrders: [order] }), TODAY_PO).plans, "A");
    expect(bucketOf(input, "2026-11-02")).toMatchObject({ dependentDemand: q("120"), projectedBefore: -q("80") });
  });

  it("PRD-025: after a target raised to 120 with 40 produced, projects 80 of output and components for 80", () => {
    const order = production({ quantity: q("120"), produced: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const { plans } = planMrp(inputs({ productionOrders: [order] }), TODAY_PO);
    expect(planAt(plans, "P").productionOutput.map(({ quantity }) => quantity)).toEqual([q("80")]);
    expect(planAt(plans, "A").componentDemand.map(({ quantity }) => quantity)).toEqual([q("160")]);
  });

  it("PRD-027: after a finish moved to 13 November, projects output then and components on the recalculated start", () => {
    const order = production({ produced: q("40"), plannedStart: "2026-11-08", plannedFinish: "2026-11-13" });
    const { plans } = planMrp(inputs({ productionOrders: [order] }), TODAY_PO);
    expect(planAt(plans, "P").productionOutput.map(({ date }) => date)).toEqual(["2026-11-13"]);
    expect(planAt(plans, "A").componentDemand.map(({ date }) => date)).toEqual(["2026-11-08"]);
  });

  it("PRD-029, PRD-030, MRP-013: projects nothing for orders closed early, fully produced, overproduced or cancelled", () => {
    const dates = { plannedStart: "2026-11-02", plannedFinish: "2026-11-06" };
    const productionOrders = [
      production({ ...dates, order: "00000001", produced: q("40"), abandoned: q("60"), status: "closed-early" }),
      // A remainder by arithmetic, which only the status filter keeps out (lesson 2026-10-27).
      production({ ...dates, order: "00000002", produced: q("40"), status: "closed-early" }),
      production({ ...dates, order: "00000003", produced: q("100"), status: "completed" }),
      production({ ...dates, order: "00000004", produced: q("110") }),
      production({ ...dates, order: "00000005", abandoned: q("100"), status: "cancelled" }),
      production({ ...dates, order: "00000006", status: "cancelled" }),
    ];
    const result = planMrp(inputs({ stock: [stock("P", "L1", "40")], productionOrders }), TODAY_PO);
    const product = only(result.plans);
    expect(product.material).toBe("P");
    expect(product.productionOutput).toEqual([]);
    expect(product.buckets.every(({ dependableSupply, projectedBefore }) => dependableSupply === 0n && projectedBefore === q("40"))).toBe(true);
  });

  it("MRP-016: expects yesterday's pending 20 today with an Overdue Supply marker, keeping the original finish day", () => {
    const order = production({ quantity: q("20"), plannedStart: "2026-10-22", plannedFinish: "2026-10-27" });
    const { plans } = planMrp(inputs({ productionOrders: [order] }), TODAY_PO);
    const product = planAt(plans, "P");
    expect(product.physical).toBe(0n);
    expect(product.buckets[0]).toMatchObject({ date: TODAY_PO, dependableSupply: q("20") });
    expect(product.productionOutput).toEqual([expect.objectContaining({ plannedFinish: "2026-10-27", date: TODAY_PO, quantity: q("20"), overdue: true })]);
  });

  it("MRP-022: projects a Monday start's remaining need on Wednesday, today, keeping the original start day", () => {
    const order = production({ produced: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const input = planAt(planMrp(inputs({ productionOrders: [order] }), "2026-11-04").plans, "A");
    expect(input.buckets[0]).toMatchObject({ date: "2026-11-04", dependentDemand: q("120") });
    expect(input.componentDemand).toEqual([expect.objectContaining({ plannedStart: "2026-11-02", date: "2026-11-04", overdue: true })]);
  });

  it("UX-024: projects two overlapping orders at one site in full, with no capacity check", () => {
    const productionOrders = [
      production({ order: "00000001", quantity: q("30"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" }),
      production({ order: "00000002", quantity: q("20"), plannedStart: "2026-11-03", plannedFinish: "2026-11-05" }),
    ];
    const { plans } = planMrp(inputs({ productionOrders }), TODAY_PO);
    expect(planAt(plans, "P").buckets.at(-1)!.projectedBefore).toBe(q("50"));
    expect(planAt(plans, "A").buckets.at(-1)!.projectedBefore).toBe(-q("100"));
  });

  it("UX-026: shows a 10 kg shortage on the start day after a goods issue of 10 kg left 90 of the 100 needed", () => {
    const order = production({ quantity: q("100"), components: [{ material: "A", perOutput: q("1") }], plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const input = planAt(planMrp(inputs({ stock: [stock("A", "L1", "90")], productionOrders: [order] }), TODAY_PO).plans, "A");
    expect(bucketOf(input, "2026-11-02").shortage).toBe(q("10"));
  });

  it("counts an in-horizon start without the output finishing after day 89, and rounds a sub-micro need upward", () => {
    const productionOrders = [
      production({ order: "00000001", plannedStart: "2027-01-20", plannedFinish: "2027-02-01" }),
      production({ order: "00000002", quantity: q("0.5"), components: [{ material: "B", perOutput: q("0.000001") }], plannedStart: "2026-11-02", plannedFinish: "2026-11-06" }),
    ];
    const { plans } = planMrp(inputs({ productionOrders }), TODAY_PO);
    expect(planAt(plans, "P").productionOutput.map(({ order }) => order)).toEqual(["00000002"]);
    expect(planAt(plans, "A").componentDemand).toEqual([expect.objectContaining({ order: "00000001", date: "2027-01-20", quantity: q("200") })]);
    expect(planAt(plans, "B").componentDemand.map(({ quantity }) => quantity)).toEqual([1n]);
  });

  it("gives an equal result for production orders in another order", () => {
    const productionOrders = [
      production({ order: "00000003", plannedStart: "2026-11-02", plannedFinish: "2026-11-06", components: [{ material: "B", perOutput: q("1") }, { material: "A", perOutput: q("1") }] }),
      production({ order: "00000001", plannedStart: "2026-11-02", plannedFinish: "2026-11-06" }),
      production({ order: "00000002", location: "L2", plannedStart: "2026-10-30", plannedFinish: "2026-11-01" }),
    ];
    const forward = planMrp(inputs({ productionOrders }), TODAY_PO);
    const backward = planMrp(inputs({ productionOrders: [...productionOrders].reverse().map((order) => ({ ...order, components: [...order.components].reverse() })) }), TODAY_PO);
    expect(backward).toEqual(forward);
    expect(planAt(forward.plans, "A").componentDemand.map(({ order }) => order)).toEqual(["00000001", "00000003"]);
  });
});

describe("planMrp: open transfers (#277)", () => {
  // Wednesday 28 October 2026: "yesterday" is 27 October.
  const TODAY_T = "2026-10-28";
  const sum = (items: readonly { quantity: bigint }[]) => items.reduce((total, { quantity }) => total + quantity, 0n);

  it("TRF-016: expects the 30 in transit at the destination today with an Overdue Transfer warning, at neither site physically", () => {
    const snapshot = inputs({
      stock: [stock("M1", "S", "0"), stock("M1", "D", "5")],
      transfers: [transfer({ quantity: q("30"), dispatched: q("30"), plannedDispatch: "2026-10-25", plannedArrival: "2026-10-27" })],
    });
    const result = planMrp(snapshot, TODAY_T);
    const destination = planAt(result.plans, "M1", "D");
    const source = planAt(result.plans, "M1", "S");
    expect(destination.physical).toBe(q("5"));
    expect(destination.buckets[0]).toMatchObject({ date: TODAY_T, transferIn: q("30"), projectedBefore: q("35") });
    expect(destination.transfersIn).toEqual([
      { transfer: "00000001", material: "M1", location: "D", stage: "in-transit", plannedDate: "2026-10-27", date: TODAY_T, quantity: q("30"), overdue: true },
    ]);
    expect(source.physical).toBe(0n);
    expect(source.buckets.every(({ transferOut, projectedBefore }) => transferOut === 0n && projectedBefore === 0n)).toBe(true);
    expect(result.exceptions).toEqual([]);
  });

  it("MRP-040: plans the 25 in transit since yesterday for the destination today, with no physical stock there yet", () => {
    const { plans } = planMrp(inputs({ transfers: [transfer({ quantity: q("25"), dispatched: q("25"), plannedDispatch: "2026-10-26", plannedArrival: "2026-10-27" })] }), TODAY_T);
    const destination = only(plans);
    expect(destination).toMatchObject({ location: "D", physical: 0n });
    expect(destination.buckets[0].transferIn).toBe(q("25"));
    expect(destination.transfersIn.map(({ overdue }) => overdue)).toEqual([true]);
  });

  it("projects an undispatched transfer leaving the source on the dispatch day and arriving on the arrival day", () => {
    const { plans, exceptions } = planMrp(
      inputs({ stock: [stock("M1", "S", "100")], transfers: [transfer({ quantity: q("40"), plannedDispatch: "2026-11-02", plannedArrival: "2026-11-04" })] }),
      TODAY_T,
    );
    const source = planAt(plans, "M1", "S");
    const destination = planAt(plans, "M1", "D");
    expect(bucketOf(source, "2026-11-02")).toMatchObject({ transferOut: q("40"), projectedBefore: q("60") });
    expect(bucketOf(destination, "2026-11-03").projectedBefore).toBe(0n);
    expect(bucketOf(destination, "2026-11-04")).toMatchObject({ transferIn: q("40"), projectedBefore: q("40") });
    expect(source.transfersOut).toEqual([
      { transfer: "00000001", material: "M1", location: "S", stage: "planned", plannedDate: "2026-11-02", date: "2026-11-02", quantity: q("40"), overdue: false },
    ]);
    expect(destination.transfersIn).toEqual([expect.objectContaining({ stage: "planned", plannedDate: "2026-11-04", date: "2026-11-04", overdue: false })]);
    expect(exceptions).toEqual([]);
  });

  it("moves an overdue dispatch to today, and the arrival too when it has also passed, keeping both planned days", () => {
    const { plans } = planMrp(
      inputs({
        stock: [stock("M1", "S", "100")],
        transfers: [
          transfer({ transfer: "00000001", quantity: q("10"), plannedDispatch: "2026-10-20", plannedArrival: "2026-10-25" }),
          transfer({ transfer: "00000002", quantity: q("20"), plannedDispatch: "2026-10-26", plannedArrival: "2026-11-02" }),
        ],
      }),
      TODAY_T,
    );
    expect(planAt(plans, "M1", "S").transfersOut.map(({ transfer: id, plannedDate, date, overdue }) => [id, plannedDate, date, overdue])).toEqual([
      ["00000001", "2026-10-20", TODAY_T, true],
      ["00000002", "2026-10-26", TODAY_T, true],
    ]);
    expect(planAt(plans, "M1", "D").transfersIn.map(({ transfer: id, plannedDate, date, overdue }) => [id, plannedDate, date, overdue])).toEqual([
      ["00000001", "2026-10-25", TODAY_T, true],
      ["00000002", "2026-11-02", "2026-11-02", false],
    ]);
  });

  it("TRF-017, MRP-039: counts only the 60 the source can supply at both sites, raises Insufficient Transfer Stock and changes no transfer", () => {
    const snapshot = deepFreeze(
      inputs({ stock: [stock("M1", "S", "60")], transfers: [transfer({ quantity: q("100"), plannedDispatch: "2026-11-02", plannedArrival: "2026-11-04" })] }),
    );
    const before = structuredClone(snapshot);
    const { plans, exceptions } = planMrp(snapshot, TODAY_T);
    const source = planAt(plans, "M1", "S");
    const destination = planAt(plans, "M1", "D");
    expect(bucketOf(source, "2026-11-02")).toMatchObject({ transferOut: q("60"), projectedBefore: 0n });
    expect(destination.buckets.at(-1)!.projectedBefore).toBe(q("60"));
    expect(sum(destination.transfersIn)).toBe(q("60"));
    expect(exceptions).toEqual([
      { kind: "insufficient-transfer-stock", transfer: "00000001", material: "M1", source: "S", destination: "D", date: "2026-11-02", planned: q("100"), available: q("60") },
    ]);
    expect(snapshot).toEqual(before);
  });

  it("projects nothing at either site for a Completed, Closed Early or Cancelled transfer", () => {
    const dates = { plannedDispatch: "2026-11-02", plannedArrival: "2026-11-04" };
    // Each keeps an undispatched remainder or stock in transit by arithmetic, so only the status filter keeps it out (lesson 2026-10-27).
    const transfers = [
      transfer({ ...dates, transfer: "00000001", quantity: q("100"), dispatched: q("40"), received: q("40"), abandoned: q("40"), status: "closed-early" }),
      transfer({ ...dates, transfer: "00000002", quantity: q("100"), dispatched: q("50"), received: q("20"), status: "completed" }),
      transfer({ ...dates, transfer: "00000003", quantity: q("100"), status: "cancelled" }),
    ];
    const result = planMrp(inputs({ stock: [stock("M1", "S", "100"), stock("M1", "D", "0")], transfers }), TODAY_T);
    expect(result.exceptions).toEqual([]);
    for (const plan of result.plans) {
      expect([plan.transfersOut, plan.transfersIn]).toEqual([[], []]);
      expect(plan.buckets.every(({ transferOut, transferIn }) => transferOut === 0n && transferIn === 0n)).toBe(true);
    }
  });

  it("projects a part-dispatched transfer in both stages, in transit less what was written off, then the rest", () => {
    const { plans } = planMrp(
      inputs({
        stock: [stock("M1", "S", "100")],
        transfers: [transfer({ quantity: q("100"), dispatched: q("30"), writtenOff: q("5"), plannedDispatch: "2026-10-30", plannedArrival: "2026-11-02" })],
      }),
      TODAY_T,
    );
    expect(planAt(plans, "M1", "S").transfersOut.map(({ quantity }) => quantity)).toEqual([q("70")]);
    expect(planAt(plans, "M1", "D").transfersIn.map(({ stage, quantity }) => [stage, quantity])).toEqual([
      ["in-transit", q("25")],
      ["planned", q("70")],
    ]);
  });

  it("checks a source short of stock as able to supply nothing: no movement, an exception, and no plan at the destination", () => {
    const { plans, exceptions } = planMrp(
      inputs({
        orderLines: [line({ location: "S", quantity: q("5"), requiredDate: "2026-10-30" })],
        transfers: [
          transfer({ transfer: "00000002", quantity: q("10"), plannedDispatch: "2026-11-02", plannedArrival: "2026-11-04" }),
          transfer({ transfer: "00000001", quantity: q("20"), plannedDispatch: "2026-11-02", plannedArrival: "2026-11-04" }),
        ],
      }),
      TODAY_T,
    );
    const source = only(plans);
    expect(source).toMatchObject({ location: "S", transfersOut: [] });
    expect(bucketOf(source, "2026-11-02")).toMatchObject({ transferOut: 0n, projectedBefore: -q("5") });
    expect(exceptions.map(({ transfer: id, planned, available }) => [id, planned, available])).toEqual([
      ["00000001", q("20"), 0n],
      ["00000002", q("10"), 0n],
    ]);
  });

  it("serves two same-day transfers from one source in ID order, the second seeing what the first took", () => {
    const dates = { plannedDispatch: "2026-11-02", plannedArrival: "2026-11-03" };
    const { plans, exceptions } = planMrp(
      inputs({
        stock: [stock("M1", "S", "50")],
        transfers: [transfer({ ...dates, transfer: "00000002", quantity: q("30") }), transfer({ ...dates, transfer: "00000001", destination: "E", quantity: q("30") })],
      }),
      TODAY_T,
    );
    expect(sum(planAt(plans, "M1", "E").transfersIn)).toBe(q("30"));
    expect(sum(planAt(plans, "M1", "D").transfersIn)).toBe(q("20"));
    expect(exceptions).toEqual([expect.objectContaining({ transfer: "00000002", planned: q("30"), available: q("20") })]);
  });

  it("serves an older overdue transfer before a newer one with a lower ID, both counted today", () => {
    const { exceptions } = planMrp(
      inputs({
        stock: [stock("M1", "S", "30")],
        transfers: [
          transfer({ transfer: "00000001", quantity: q("30"), plannedDispatch: "2026-10-25", plannedArrival: "2026-11-01" }),
          transfer({ transfer: "00000002", quantity: q("30"), plannedDispatch: "2026-10-20", plannedArrival: "2026-11-01" }),
        ],
      }),
      TODAY_T,
    );
    expect(exceptions.map(({ transfer: id, available }) => [id, available])).toEqual([["00000001", 0n]]);
  });

  it("counts a chain A → B → C across days: B can send on to C what arrives from A first", () => {
    const { plans, exceptions } = planMrp(
      inputs({
        stock: [stock("M1", "A", "50")],
        transfers: [
          transfer({ transfer: "00000002", source: "B", destination: "C", quantity: q("50"), plannedDispatch: "2026-11-05", plannedArrival: "2026-11-06" }),
          transfer({ transfer: "00000001", source: "A", destination: "B", quantity: q("50"), plannedDispatch: "2026-11-01", plannedArrival: "2026-11-03" }),
        ],
      }),
      TODAY_T,
    );
    expect(exceptions).toEqual([]);
    expect(planAt(plans, "M1", "B").buckets.at(-1)!.projectedBefore).toBe(0n);
    expect(bucketOf(planAt(plans, "M1", "C"), "2026-11-06").transferIn).toBe(q("50"));
  });

  it("subtracts a dispatch on day 89 whose arrival falls after the horizon, and ignores one dispatching after it", () => {
    const { plans } = planMrp(
      inputs({
        stock: [stock("M1", "S", "100")],
        transfers: [
          transfer({ transfer: "00000001", quantity: q("10"), plannedDispatch: "2027-01-25", plannedArrival: "2027-01-28" }),
          transfer({ transfer: "00000002", quantity: q("10"), plannedDispatch: "2027-01-26", plannedArrival: "2027-01-27" }),
        ],
      }),
      TODAY_T,
    );
    const source = only(plans);
    expect(source.transfersOut.map(({ transfer: id, date }) => [id, date])).toEqual([["00000001", "2027-01-25"]]);
    expect(source.buckets.at(-1)).toMatchObject({ date: "2027-01-25", projectedBefore: q("90") });
  });

  it("keeps every bucket's transfer figures equal to the items behind them, so no leg is counted twice", () => {
    const { plans } = planMrp(
      inputs({
        stock: [stock("M1", "S", "45"), stock("M2", "S", "10")],
        transfers: [
          transfer({ transfer: "00000001", quantity: q("30"), dispatched: q("10"), plannedDispatch: "2026-10-29", plannedArrival: "2026-10-30" }),
          transfer({ transfer: "00000002", quantity: q("30"), plannedDispatch: "2026-10-29", plannedArrival: "2026-10-30" }),
          transfer({ transfer: "00000003", material: "M2", quantity: q("5"), plannedDispatch: "2026-10-27", plannedArrival: "2026-10-29" }),
        ],
      }),
      TODAY_T,
    );
    for (const plan of plans) {
      for (const bucket of plan.buckets) {
        expect(bucket.transferOut).toBe(sum(plan.transfersOut.filter(({ date }) => date === bucket.date)));
        expect(bucket.transferIn).toBe(sum(plan.transfersIn.filter(({ date }) => date === bucket.date)));
      }
    }
    expect(sum(plans.flatMap(({ transfersOut }) => transfersOut))).toBe(q("50"));
  });

  it("gives an equal result for transfers in another order", () => {
    const transfers = [
      transfer({ transfer: "00000003", quantity: q("10"), dispatched: q("4"), plannedDispatch: "2026-11-02", plannedArrival: "2026-11-02" }),
      transfer({ transfer: "00000001", quantity: q("10"), plannedDispatch: "2026-11-02", plannedArrival: "2026-11-02" }),
      transfer({ transfer: "00000002", quantity: q("50"), plannedDispatch: "2026-11-02", plannedArrival: "2026-11-02" }),
    ];
    const forward = planMrp(inputs({ stock: [stock("M1", "S", "30")], transfers }), TODAY_T);
    expect(planMrp(inputs({ stock: [stock("M1", "S", "30")], transfers: [...transfers].reverse() }), TODAY_T)).toEqual(forward);
    expect(planAt(forward.plans, "M1", "D").transfersIn.map(({ transfer: id, stage }) => `${id}/${stage}`)).toEqual([
      "00000001/planned",
      "00000002/planned",
      "00000003/in-transit",
    ]);
  });
});

describe("planMrp: transfer feasibility against the forecast and purchasing seams (#275, #276, #277 Q2)", () => {
  it("checks a source's dispatch against purchase-order supply and forecast demand, never its requisitions", () => {
    const { plans, exceptions } = planMrp(
      inputs({
        stock: [stock("M1", "S", "20")],
        forecasts: [forecast("2026-11-01", "30", { location: "S" })],
        requisitions: [requisition({ location: "S", quantity: q("100"), requiredDate: "2026-11-01" })],
        purchaseOrderLines: [orderLine({ location: "S", quantity: q("50"), plannedDate: "2026-11-01" })],
        transfers: [transfer({ quantity: q("80"), plannedDispatch: "2026-11-02", plannedArrival: "2026-11-03" })],
      }),
      "2026-10-28",
    );
    // Dependable on 2 November: 20 on hand + 50 ordered − 30 forecast = 40. The 100 requisitioned would cover all 80.
    expect(exceptions).toEqual([
      { kind: "insufficient-transfer-stock", transfer: "00000001", material: "M1", source: "S", destination: "D", date: "2026-11-02", planned: q("80"), available: q("40") },
    ]);
    const source = planAt(plans, "M1", "S");
    expect(bucketOf(source, "2026-11-01")).toMatchObject({ forecastDemand: q("30"), tentativeSupply: q("100"), dependableSupply: q("50"), projectedBefore: q("140") });
    expect(bucketOf(source, "2026-11-02")).toMatchObject({ transferOut: q("40"), projectedBefore: q("100") });
    expect(bucketOf(planAt(plans, "M1", "D"), "2026-11-03")).toMatchObject({ transferIn: q("40"), projectedBefore: q("40") });
  });
});
