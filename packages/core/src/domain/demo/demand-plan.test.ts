import { describe, expect, it } from "vitest";
import { ONE, parseDecimal } from "../quantities/decimal";
import { addWeekdays, monthOf, nthWeekday, weekdaysOf } from "./calendar";
import { monthlyDemand, planDemand, planForecasts, plantOf, roundToWhole, shipmentsOf, splitByWeights, unitSize } from "./demand-plan";
import { byId, TEST_TENANT_CONFIG, type TestTenantConfig } from "./test-tenant-config.schema";

const config = TEST_TENANT_CONFIG;
const anchor = monthOf("2026-10-01");
const historyStart = anchor - 24;
const plan = planDemand(config, anchor);
const units = (micro: bigint) => Number(micro / ONE);

/** The committed configuration, changed by `change`. */
function changed(change: (copy: TestTenantConfig) => void): TestTenantConfig {
  const copy = structuredClone(config);
  change(copy);
  return copy;
}

describe("monthlyDemand", () => {
  it("keeps a flat product's 24 history months within ±12 % noise of base × growth", () => {
    for (let month = historyStart; month < anchor; month += 1) {
      const trend = 60 * (1 + (0.04 * (month - historyStart)) / 12);
      const demand = units(monthlyDemand(config, "00000005", month, historyStart));
      expect(demand).toBeGreaterThanOrEqual(Math.floor(trend * 0.88));
      expect(demand).toBeLessThanOrEqual(Math.ceil(trend * 1.12));
    }
  });

  it("is the same for a calendar month whichever history start it is counted from, but for growth", () => {
    const noGrowth = changed((copy) => (copy.demand.growthPerYear = "0"));
    expect(monthlyDemand(noGrowth, "00000022", anchor - 3, historyStart)).toBe(monthlyDemand(noGrowth, "00000022", anchor - 3, historyStart + 7));
  });

  it("follows the season: the shelf unit sells more in spring than in winter", () => {
    const noNoise = changed((copy) => (copy.demand.noise = "0"));
    expect(units(monthlyDemand(noNoise, "00000022", monthOf("2025-04-01"), monthOf("2025-01-01")))).toBe(158);
    expect(units(monthlyDemand(noNoise, "00000022", monthOf("2025-01-01"), monthOf("2025-01-01")))).toBe(96);
  });

  it("never asks for less than one unit", () => {
    const tiny = changed((copy) => (copy.demand.products[0].monthlyBase = "0.1"));
    expect(monthlyDemand(tiny, "00000005", anchor, historyStart)).toBe(ONE);
  });
});

describe("splitByWeights", () => {
  it("splits a total into whole units that sum to it exactly, the leftovers to the largest remainders", () => {
    const weights = ["0.35", "0.3", "0.2", "0.15"].map((weight) => parseDecimal(weight)!);
    expect(splitByWeights(101n * ONE, weights).map(units)).toEqual([36, 30, 20, 15]);
    expect(splitByWeights(99n * ONE, weights).map(units)).toEqual([34, 30, 20, 15]);
    expect(splitByWeights(7n * ONE, [ONE / 2n, ONE / 2n]).map(units)).toEqual([4, 3]);
    for (let total = 1n; total < 300n; total += 7n) {
      expect(splitByWeights(total * ONE, weights).reduce((sum, share) => sum + share, 0n)).toBe(total * ONE);
    }
  });
});

describe("planDemand", () => {
  it("places 23 orders with 38 lines a month, from the history start to next month", () => {
    expect(plan.orders).toHaveLength(26 * 23);
    expect(plan.orders.reduce((sum, { lines }) => sum + lines.length, 0)).toBeGreaterThanOrEqual(26 * 38 - 10);
    expect(plan.orders.filter(({ month }) => month === anchor)).toHaveLength(23);
    expect(new Set(plan.orders.map(({ key }) => key)).size).toBe(plan.orders.length);
    expect(plan.orders.map(({ sequence }) => sequence)).toEqual(plan.orders.map((_, index) => index + 1));
  });

  it("splits each product's month over its buyers exactly, for customers who order in base units", () => {
    const month = anchor - 5;
    const lines = plan.orders.filter((order) => order.month === month).flatMap(({ lines: orderLines }) => orderLines);
    const total = lines.filter(({ material }) => material === "00000005").reduce((sum, { base }) => sum + base, 0n);
    expect(total).toBe(monthlyDemand(config, "00000005", month, historyStart));
    expect(plan.ordered.get("00000005")!.get(month)).toBe(total);
  });

  it("has the export distributors order in whole pallets or cases, entered in that unit (MAT-019)", () => {
    const distributors = plan.orders.filter(({ customer }) => customer === "00000004" || customer === "00000010");
    for (const line of distributors.flatMap(({ lines }) => lines)) {
      const size = unitSize(byId(config.catalogue.materials, line.material)!, line.unit);
      expect(["pallet", "case"]).toContain(line.unit);
      expect(BigInt(line.quantity) * size).toBe(line.base);
    }
    const others = plan.orders.filter(({ customer }) => customer === "00000001");
    expect(others.flatMap(({ lines }) => lines).every(({ unit, quantity, base }) => unit === "each" && BigInt(quantity) * ONE === base)).toBe(true);
  });

  it("puts each order's lines at the plant that makes them", () => {
    for (const order of plan.orders) for (const { material } of order.lines) expect(plantOf(config, material)).toBe(order.location);
  });

  it("creates orders in the second half of the month before and requires them in the shipping band", () => {
    for (const order of plan.orders) {
      const customerIndex = Number(order.customer) - 1;
      expect(order.createdOn).toBe(nthWeekday(order.month - 1, 12 + (customerIndex % 5)));
      const weekday = weekdaysOf(order.month).indexOf(order.requiredDate) + 1;
      expect(weekday).toBe(10 + ((customerIndex + 3 * order.month) % 11));
    }
    expect(plan.orders.slice(1).every((order, index) => order.createdOn >= plan.orders[index].createdOn)).toBe(true);
  });

  it("ships every ninth order in two, 60 % first, and every other one in full on its required date", () => {
    for (const order of plan.orders) {
      const isSplit = order.sequence % 9 === 0;
      expect(order.shipments).toHaveLength(isSplit ? 2 : 1);
      expect(order.shipments[0].plannedDate).toBe(order.requiredDate);
      for (const shipment of order.shipments) expect(shipment.createdOn).toBe(addWeekdays(shipment.plannedDate, -2));
      order.lines.forEach(({ base }, line) => {
        const shipped = order.shipments.flatMap(({ lines }) => lines).filter(({ orderLine }) => orderLine === line);
        expect(shipped.reduce((sum, part) => sum + part.base, 0n)).toBe(base);
        if (isSplit) expect(shipped[0].base).toBe(BigInt(Math.max(1, Math.floor(units(base) * 0.6))) * ONE);
      });
    }
  });

  it("keeps lines of at least one unit, and whole packs of at least one, when demand is tiny", () => {
    const tiny = changed((copy) => {
      copy.demand.products[1].monthlyBase = "0.1";
      copy.demand.noise = "0";
    });
    const lines = planDemand(tiny, anchor).orders.flatMap(({ lines: orderLines }) => orderLines).filter(({ material }) => material === "00000018");
    expect(lines.every(({ base }) => base >= ONE)).toBe(true);
    expect(lines.filter(({ unit }) => unit === "pallet").every(({ quantity }) => quantity === "1")).toBe(true);
  });

  it("enters a pack customer's line in base units when the product's entered unit is its base unit", () => {
    const inBase = changed((copy) => (copy.demand.products[1].enteredIn = "each"));
    const line = planDemand(inBase, anchor).orders.find(({ customer }) => customer === "00000004")!.lines[0];
    expect(line).toMatchObject({ material: "00000018", unit: "each" });
    expect(BigInt(line.quantity) * ONE).toBe(line.base);
  });
});

describe("shipmentsOf", () => {
  const order = {
    key: "order",
    sequence: 9,
    month: anchor,
    customer: "00000001",
    location: "00000003",
    createdOn: "2026-09-16",
    requiredDate: nthWeekday(anchor, 20),
    lines: [
      { material: "00000022", base: 10n * ONE, quantity: "10", unit: "each" },
      { material: "00000023", base: ONE, quantity: "1", unit: "each" },
    ],
  };

  it("caps the second shipment at the month's last weekday and leaves out lines the first shipped in full", () => {
    const [first, second] = shipmentsOf(order, true);
    expect(first.lines).toEqual([
      { orderLine: 0, base: 6n * ONE },
      { orderLine: 1, base: ONE },
    ]);
    expect(second).toMatchObject({ plannedDate: "2026-10-30", lines: [{ orderLine: 0, base: 4n * ONE }] });
  });

  it("plans no second shipment when the first takes every line in full", () => {
    expect(shipmentsOf({ ...order, lines: [order.lines[1]] }, true)).toHaveLength(1);
  });
});

describe("roundToWhole", () => {
  it("rounds half-up to whole units", () => {
    expect([roundToWhole(1_499_999n), roundToWhole(1_500_000n)]).toEqual([ONE, 2n * ONE]);
  });
});

describe("planForecasts", () => {
  const forecasts = planForecasts(config, plan, anchor);

  it("gives each finished product twelve monthly buckets at its plant, on the first of each month after this one (Q11)", () => {
    expect(forecasts).toHaveLength(120);
    expect(forecasts.filter(({ material }) => material === "00000019").map(({ date }) => date)).toEqual(
      Array.from({ length: 12 }, (_, index) => `${index < 2 ? 2026 : 2027}-${String(((10 + index) % 12) + 1).padStart(2, "0")}-01`),
    );
    expect(forecasts.every(({ material, location }) => plantOf(config, material) === location)).toBe(true);
  });

  it("forecasts the last year's mean × season × growth, in multiples of five", () => {
    const history = Array.from({ length: 12 }, (_, index) => units(plan.ordered.get("00000019")!.get(anchor - 12 + index)!));
    const mean = history.reduce((sum, value) => sum + value, 0) / 12;
    const august = forecasts.find(({ material, date }) => material === "00000019" && date === "2027-08-01")!;
    expect(Number(august.quantity) % 5).toBe(0);
    expect(Math.abs(Number(august.quantity) - mean * 1.4 * 1.04)).toBeLessThanOrEqual(2.5);
  });

  it("averages every history month when the history is shorter than a year", () => {
    const short = changed((copy) => { copy.horizon.historyMonths = 2; });
    const shortPlan = planDemand(short, anchor);
    const history = [1, 2].map((back) => units(shortPlan.ordered.get("00000005")!.get(anchor - back)!));
    const january = planForecasts(short, shortPlan, anchor).find(({ material, date }) => material === "00000005" && date === "2027-01-01")!;
    expect(Math.abs(Number(january.quantity) - ((history[0] + history[1]) / 2) * 1.04)).toBeLessThanOrEqual(2.5);
  });
});
