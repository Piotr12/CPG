import { describe, expect, it } from "vitest";
import { formatDecimal, parseDecimal } from "../quantities/decimal";
import type { MrpInputs, MrpOrderLine, MrpPurchaseOrderLine, MrpRequisition, MrpStock } from "./mrp-inputs";
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

const inputs = (overrides: Partial<MrpInputs> = {}): MrpInputs => ({ stock: [], orderLines: [], requisitions: [], purchaseOrderLines: [], ...overrides });

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

// The status filter itself is pinned with fixtures that keep a remainder in `supply/purchasing-supply.test.ts`
// ("counts no closed document…"); these tests assert each scenario's outcome through the whole plan.
describe("planMrp: purchasing supply (#276)", () => {
  const supplyOn = (plan: MrpPlan, date: string) => {
    const { tentativeSupply, dependableSupply } = plan.buckets.find((bucket) => bucket.date === date)!;
    return { tentativeSupply, dependableSupply };
  };
  const totals = (plan: MrpPlan) =>
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
    expect(totals(plan)).toEqual({ tentativeSupply: 0n, dependableSupply: q("100") });
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
    expect(totals(plan).dependableSupply).toBe(q("60"));
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
    expect(totals(plan)).toEqual({ tentativeSupply: 0n, dependableSupply: q("100") });
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
    expect(totals(plan)).toEqual({ tentativeSupply: 0n, dependableSupply: 0n });
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
    expect(totals(plan).dependableSupply).toBe(0n);
    expect(plan.buckets.at(-1)!.projectedBefore).toBe(q("60"));
  });

  it("LFC-024: neither a Completed line nor a Closed Early line with 20 abandoned projects incoming supply", () => {
    const purchaseOrderLines = [
      orderLine({ quantity: q("50"), received: q("50"), status: "completed", plannedDate: "2026-10-20" }),
      orderLine({ quantity: q("100"), received: q("80"), abandoned: q("20"), status: "closed-early", plannedDate: "2026-10-20" }),
    ];
    const plan = only(planMrp(inputs({ stock: [stock("M1", "L1", "130")], purchaseOrderLines }), TODAY).plans);
    expect(totals(plan).dependableSupply).toBe(0n);
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
    expect(totals(plan).dependableSupply).toBe(0n);
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

