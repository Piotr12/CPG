import { describe, expect, it } from "vitest";
import { formatDecimal, parseDecimal } from "../quantities/decimal";
import type { MrpInputs, MrpOrderLine, MrpProductionOrder, MrpStock } from "./mrp-inputs";
import type { MrpPlan } from "./mrp-result";
import { planMrp } from "./plan-mrp";

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

const inputs = (overrides: Partial<MrpInputs> = {}): MrpInputs => ({ stock: [], orderLines: [], productionOrders: [], ...overrides });

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
const planOf = (plans: readonly MrpPlan[], material: string, location = "L1") => plans.find((plan) => plan.material === material && plan.location === location)!;
const bucketOn = (plan: MrpPlan, date: string) => plan.buckets.find((bucket) => bucket.date === date)!;

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

  it("leaves the figures later stories fill at zero, so the balance after proposals equals the one before", () => {
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

describe("planMrp: open production orders (#277)", () => {
  // Wednesday 28 October 2026; 1 November is a Sunday, 2 November a Monday, 6 November a Friday.
  const TODAY_PO = "2026-10-28";

  it("MRP-017: expects a 5-day order's output on Friday 6 November and its inputs on Sunday 1 November, calendar days", () => {
    const { plans } = planMrp(inputs({ productionOrders: [production({ plannedStart: "2026-11-01", plannedFinish: "2026-11-06" })] }), TODAY_PO);
    const output = planOf(plans, "P");
    const input = planOf(plans, "A");
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
    const input = planOf(planMrp(inputs({ stock: [stock("A", "L1", "100")], productionOrders: [order] }), TODAY_PO).plans, "A");
    expect(bucketOn(input, "2026-11-01").projectedBefore).toBe(q("100"));
    expect(bucketOn(input, "2026-11-02")).toMatchObject({ dependentDemand: q("80"), projectedBefore: q("20") });
    expect(bucketOn(input, "2026-11-06").projectedBefore).toBe(q("20"));
  });

  it("MRP-019: keeps the physical 100 while the projection after the start day is 20, writing nothing", () => {
    const snapshot = deepFreeze(
      inputs({ stock: [stock("A", "L1", "100")], productionOrders: [production({ quantity: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" })] }),
    );
    const before = structuredClone(snapshot);
    const input = planOf(planMrp(snapshot, TODAY_PO).plans, "A");
    expect(input.physical).toBe(q("100"));
    expect(input.buckets.at(-1)!.projectedBefore).toBe(q("20"));
    expect(snapshot).toEqual(before);
  });

  it("PRD-009: shows the shortage of unavailable components on the future order's start day, physical unchanged", () => {
    const input = planOf(
      planMrp(inputs({ stock: [stock("A", "L1", "0")], productionOrders: [production({ quantity: q("10"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" })] }), TODAY_PO).plans,
      "A",
    );
    expect(input.physical).toBe(0n);
    expect(bucketOn(input, "2026-11-01").shortage).toBe(0n);
    expect(bucketOn(input, "2026-11-02")).toMatchObject({ dependentDemand: q("20"), shortage: q("20") });
  });

  it("MRP-023: Friday's output doesn't cover Wednesday's demand: Wednesday is short and the output lands Friday", () => {
    const { plans } = planMrp(
      inputs({
        orderLines: [line({ material: "P", quantity: q("50"), requiredDate: "2026-11-04" })],
        productionOrders: [production({ quantity: q("50"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" })],
      }),
      TODAY_PO,
    );
    const product = planOf(plans, "P");
    expect(bucketOn(product, "2026-11-04")).toMatchObject({ projectedBefore: -q("50"), shortage: q("50") });
    expect(bucketOn(product, "2026-11-05").shortage).toBe(q("50"));
    expect(bucketOn(product, "2026-11-06")).toMatchObject({ dependableSupply: q("50"), projectedBefore: 0n, shortage: 0n });
  });

  it("MRP-011, MRP-021: projects only the unproduced 60 as output and 120 kg of A for it, the produced 40 being physical", () => {
    const order = production({ produced: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const { plans } = planMrp(inputs({ stock: [stock("P", "L1", "40")], productionOrders: [order] }), TODAY_PO);
    const product = planOf(plans, "P");
    expect(product.physical).toBe(q("40"));
    expect(bucketOn(product, "2026-11-06")).toMatchObject({ dependableSupply: q("60"), projectedBefore: q("100") });
    expect(bucketOn(planOf(plans, "A"), "2026-11-02").dependentDemand).toBe(q("120"));
  });

  it("PRD-028: plans the remaining 60 by the recipe, whatever the completion of 40 actually consumed", () => {
    // The completion used 160 kg of A instead of 80, which is already out of A's physical 40.
    const order = production({ produced: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const input = planOf(planMrp(inputs({ stock: [stock("A", "L1", "40")], productionOrders: [order] }), TODAY_PO).plans, "A");
    expect(bucketOn(input, "2026-11-02")).toMatchObject({ dependentDemand: q("120"), projectedBefore: -q("80") });
  });

  it("PRD-025: after a target raised to 120 with 40 produced, projects 80 of output and components for 80", () => {
    const order = production({ quantity: q("120"), produced: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const { plans } = planMrp(inputs({ productionOrders: [order] }), TODAY_PO);
    expect(planOf(plans, "P").productionOutput.map(({ quantity }) => quantity)).toEqual([q("80")]);
    expect(planOf(plans, "A").componentDemand.map(({ quantity }) => quantity)).toEqual([q("160")]);
  });

  it("PRD-027: after a finish moved to 13 November, projects output then and components on the recalculated start", () => {
    const order = production({ produced: q("40"), plannedStart: "2026-11-08", plannedFinish: "2026-11-13" });
    const { plans } = planMrp(inputs({ productionOrders: [order] }), TODAY_PO);
    expect(planOf(plans, "P").productionOutput.map(({ date }) => date)).toEqual(["2026-11-13"]);
    expect(planOf(plans, "A").componentDemand.map(({ date }) => date)).toEqual(["2026-11-08"]);
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
    const product = planOf(plans, "P");
    expect(product.physical).toBe(0n);
    expect(product.buckets[0]).toMatchObject({ date: TODAY_PO, dependableSupply: q("20") });
    expect(product.productionOutput).toEqual([expect.objectContaining({ plannedFinish: "2026-10-27", date: TODAY_PO, quantity: q("20"), overdue: true })]);
  });

  it("MRP-022: projects a Monday start's remaining need on Wednesday, today, keeping the original start day", () => {
    const order = production({ produced: q("40"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const input = planOf(planMrp(inputs({ productionOrders: [order] }), "2026-11-04").plans, "A");
    expect(input.buckets[0]).toMatchObject({ date: "2026-11-04", dependentDemand: q("120") });
    expect(input.componentDemand).toEqual([expect.objectContaining({ plannedStart: "2026-11-02", date: "2026-11-04", overdue: true })]);
  });

  it("UX-024: projects two overlapping orders at one site in full, with no capacity check", () => {
    const productionOrders = [
      production({ order: "00000001", quantity: q("30"), plannedStart: "2026-11-02", plannedFinish: "2026-11-06" }),
      production({ order: "00000002", quantity: q("20"), plannedStart: "2026-11-03", plannedFinish: "2026-11-05" }),
    ];
    const { plans } = planMrp(inputs({ productionOrders }), TODAY_PO);
    expect(planOf(plans, "P").buckets.at(-1)!.projectedBefore).toBe(q("50"));
    expect(planOf(plans, "A").buckets.at(-1)!.projectedBefore).toBe(-q("100"));
  });

  it("UX-026: shows a 10 kg shortage on the start day after a goods issue of 10 kg left 90 of the 100 needed", () => {
    const order = production({ quantity: q("100"), components: [{ material: "A", perOutput: q("1") }], plannedStart: "2026-11-02", plannedFinish: "2026-11-06" });
    const input = planOf(planMrp(inputs({ stock: [stock("A", "L1", "90")], productionOrders: [order] }), TODAY_PO).plans, "A");
    expect(bucketOn(input, "2026-11-02").shortage).toBe(q("10"));
  });

  it("counts an in-horizon start without the output finishing after day 89, and rounds a sub-micro need upward", () => {
    const productionOrders = [
      production({ order: "00000001", plannedStart: "2027-01-20", plannedFinish: "2027-02-01" }),
      production({ order: "00000002", quantity: q("0.5"), components: [{ material: "B", perOutput: q("0.000001") }], plannedStart: "2026-11-02", plannedFinish: "2026-11-06" }),
    ];
    const { plans } = planMrp(inputs({ productionOrders }), TODAY_PO);
    expect(planOf(plans, "P").productionOutput.map(({ order }) => order)).toEqual(["00000002"]);
    expect(planOf(plans, "A").componentDemand).toEqual([expect.objectContaining({ order: "00000001", date: "2027-01-20", quantity: q("200") })]);
    expect(planOf(plans, "B").componentDemand.map(({ quantity }) => quantity)).toEqual([1n]);
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
    expect(planOf(forward.plans, "A").componentDemand.map(({ order }) => order)).toEqual(["00000001", "00000003"]);
  });
});
