import { describe, expect, it } from "vitest";
import { plannedStart, scaledRequirement } from "../production-orders/production-planning";
import { formatDecimal, ONE } from "../quantities/decimal";
import { addDays, addWeekdays, isoWeekday, monthEnd, monthOf, monthStart } from "./calendar";
import { planDemand } from "./demand-plan";
import { Ledger } from "./ledger";
import { largerOf, lotFor, pairKey, planningPairs, planSupply, recipeOf, roundUpToMultiple, smallerOf, toBase, varied, type SupplyPlan } from "./supply-plan";
import { byId, TEST_TENANT_CONFIG, type TestTenantConfig } from "./test-tenant-config.schema";
import { planEvents } from "./timeline";

const config = TEST_TENANT_CONFIG;
const anchor = monthOf("2026-10-01");
const demand = planDemand(config, anchor);
const plan = planSupply(config, demand, anchor);
const historyDays = demand.days.filter((day) => day < "2026-10-01").length;

function changed(change: (copy: TestTenantConfig) => void): TestTenantConfig {
  const copy = structuredClone(config);
  change(copy);
  return copy;
}

const targetOf = (supply: SupplyPlan, material: string, location = "00000001") =>
  supply.safetyTargets.find((target) => target.material === material && target.location === location)!.quantity;
const pairOf = (supply: SupplyPlan, material: string) => supply.pairs.find((pair) => pair.material === material)!;
const isFinished = (material: string) => byId(config.catalogue.materials, material)!.type === "finished";
/** The average D of a SKU per history weekday, in micro-units. */
const averageDemand = (sku: string) => (BigInt(demand.demand.get(sku)!.slice(0, historyDays).reduce((sum, units) => sum + units, 0)) * ONE) / BigInt(historyDays);

/**
 * The lowest balance each pair reaches over the plan's own events (no partial documents of today) up
 * to the anchor month's end, the last day a timeline of the month holds, by pair key. Past it the
 * plan's shipments run on without the weeks that would replenish them.
 */
function lowestBalances(supply: SupplyPlan): Map<string, bigint> {
  const ledger = new Ledger(config);
  const lowest = new Map<string, bigint>();
  for (const { date, event } of planEvents(config, demand, supply, anchor).events) {
    if (date > monthEnd(anchor)) break;
    for (const { material, location } of ledger.apply(event)) {
      const key = pairKey(material, location);
      const balance = ledger.balance(material, location);
      lowest.set(key, smallerOf(lowest.get(key) ?? balance, balance));
    }
  }
  return lowest;
}

describe("lot rounding", () => {
  it("rounds a need up to the lot multiple, at least the minimum, and orders nothing for no need", () => {
    expect(roundUpToMultiple(101n * ONE, 50n * ONE)).toBe(150n * ONE);
    expect(roundUpToMultiple(100n * ONE, 50n * ONE)).toBe(100n * ONE);
    expect(lotFor(101n * ONE, 500n * ONE, 100n * ONE)).toBe(500n * ONE);
    expect(lotFor(501n * ONE, 500n * ONE, 100n * ONE)).toBe(600n * ONE);
    expect(lotFor(0n, 500n * ONE, 100n * ONE)).toBe(0n);
    expect(lotFor(-3n * ONE, 500n * ONE, 100n * ONE)).toBe(0n);
  });

  it("picks the larger or smaller of two quantities", () => {
    expect([largerOf(ONE, 2n * ONE), largerOf(2n * ONE, ONE), smallerOf(ONE, 2n * ONE), smallerOf(2n * ONE, ONE)]).toEqual([2n * ONE, 2n * ONE, ONE, ONE]);
  });

  it("converts entered recipe quantities to base units as the services do (MAT-019)", () => {
    const bolts = byId(config.catalogue.materials, "00000002")!;
    expect(toBase(bolts, 2n * ONE, "case")).toBe(24n * ONE);
    expect(toBase(bolts, 16n * ONE, "each")).toBe(16n * ONE);
    expect(recipeOf(config, "00000004")).toEqual({ bom: "00000001", components: [{ material: "00000001", perOutput: 4_500_000n }] });
    expect(recipeOf(config, "00000005").components.find(({ material }) => material === "00000003")).toEqual({ material: "00000003", perOutput: 1_150_000n });
    expect(recipeOf(config, "00000018").bom).toBe("00000006");
    expect(recipeOf(config, "00000030").bom).toBe("00000016");
  });
});

describe("planningPairs", () => {
  it("plans the 16 made pairs and every raw material the recipes use, alternates included, each from its one supplier: 30 pairs at one plant", () => {
    const pairs = planningPairs(config);
    expect(pairs).toHaveLength(30);
    expect(pairs.filter(({ procurement }) => procurement === "make").map(({ material }) => material)).toEqual(config.catalogue.production.map(({ material }) => material));
    const bought = pairs.filter(({ procurement }) => procurement === "buy");
    expect(bought.map(({ material }) => Number(material))).toEqual([1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 22, 23]);
    expect(new Set(pairs.map(({ location }) => location))).toEqual(new Set(["00000001"]));
    expect(bought.filter(({ supplier }) => supplier === "00000001").map(({ material }) => material)).toEqual(["00000001", "00000007", "00000014"]);
    expect(pairs.find(({ material }) => material === "00000013")).toMatchObject({ leadTimeDays: 10, minimum: 20n * ONE, multiple: 5n * ONE, supplier: "00000002", pairIndex: -1 });
  });
});

describe("safety targets", () => {
  it("gives every pair a target from the history start, and the two later increases three months after the anchor (DEM-016)", () => {
    expect(plan.safetyTargets).toHaveLength(32);
    expect(plan.safetyTargets.slice(0, 30).every(({ effectiveFrom }) => effectiveFrom === "2024-10-01")).toBe(true);
    const later = plan.safetyTargets.slice(30);
    expect(later.map(({ material, location, effectiveFrom }) => [material, location, effectiveFrom])).toEqual([
      ["00000019", "00000001", "2027-01-01"],
      ["00000024", "00000001", "2027-01-01"],
    ]);
    expect(later[0].quantity).toBe(roundUpToMultiple((targetOf(plan, "00000019") * 125n) / 100n, 10n * ONE));
  });

  it("covers a finished product's three weekdays of average demand, rounded up to its lot multiple and at least one", () => {
    expect(targetOf(plan, "00000005")).toBe(largerOf(roundUpToMultiple(averageDemand("00000005") * 3n, 10n * ONE), 10n * ONE));
    expect(targetOf(plan, "00000019")).toBe(roundUpToMultiple(averageDemand("00000019") * 3n, 10n * ONE));
    expect(targetOf(plan, "00000019")).toBeGreaterThan(10n * ONE);
  });

  it("covers an intermediate's two days of average use, exploded through the SKUs' recipes", () => {
    const frames = ["00000019", "00000020", "00000028", "00000029"].reduce((sum, sku) => sum + averageDemand(sku), 0n);
    expect(targetOf(plan, "00000016")).toBe(roundUpToMultiple(frames * 2n, 10n * ONE));
  });

  it("covers a raw material's lead time of use, five working days in seven, with a 1.2 margin", () => {
    // Blue paint: 1,150 ml a blue cabinet, 300 ml a blue locker 2, 600 ml a blue locker 4.
    const perDay = (averageDemand("00000024") * 1_150_000n + averageDemand("00000028") * 300_000n + averageDemand("00000029") * 600_000n) / ONE;
    expect(targetOf(plan, "00000013")).toBe(roundUpToMultiple((perDay * 10n * 1_200_000n * 5n) / (7n * ONE), 5n * ONE));
  });
});

describe("opening balances", () => {
  it("open each of the 30 pairs at its target plus a minimum lot plus what leaves before its first replenishment", () => {
    const lines = plan.openings.get("00000001")!;
    expect(lines.map(({ material }) => material)).toEqual(plan.pairs.map(({ material }) => material));
    for (const pair of plan.pairs) expect(lines.find(({ material }) => material === pair.material)!.base).toBeGreaterThanOrEqual(targetOf(plan, pair.material) + pair.minimum);
    // The first planned week starts on Monday 2024-10-07; cabinet red ships from the opening until its Wednesday completion.
    const shipped = demand.orders.flatMap(({ shipments, lines: orderLines }) =>
      shipments.filter(({ plannedDate }) => plannedDate < "2024-10-09").flatMap(({ lines: shipped }) => shipped.filter(({ orderLine }) => orderLines[orderLine].material === "00000005")),
    );
    const opening = lines.find(({ material }) => material === "00000005")!.base;
    expect(opening).toBe(targetOf(plan, "00000005") + 20n * ONE + shipped.reduce((sum, { base }) => sum + base, 0n));
  });
});

describe("production", () => {
  it("plans weekly orders at Thursday's planning run, intermediates finishing Monday or Tuesday and SKUs Wednesday or Thursday", () => {
    expect(plan.productionOrders.length).toBeGreaterThan(1200);
    expect(plan.productionOrders[0].week).toBe("2024-10-07");
    for (const order of plan.productionOrders) {
      const pair = pairOf(plan, order.output);
      expect(isoWeekday(order.week)).toBe(1);
      expect(order.createdOn).toBe(addDays(order.week, -4));
      expect(order.plannedFinish).toBe(addDays(order.week, (isFinished(order.output) ? 2 : 0) + (order.pairIndex % 2)));
      expect(order.plannedStart).toBe(plannedStart(order.plannedFinish, pair.leadTimeDays));
      expect(order.quantity % pair.multiple === 0n || order.quantity === pair.minimum).toBe(true);
      expect(order.quantity).toBeGreaterThanOrEqual(pair.minimum);
      expect(order.key).toBe(`production-order:${order.week}:${order.output}:00000001`);
      const full = order.completions.at(-1)!;
      expect(full).toMatchObject({ date: order.plannedFinish, output: order.quantity });
      expect(full.components.map(({ material }) => material)).toEqual(recipeOf(config, order.output).components.map(({ material }) => material));
      expect(order.bom).toBe(recipeOf(config, order.output).bom);
    }
    expect(new Set(plan.productionOrders.map(({ key }) => key)).size).toBe(plan.productionOrders.length);
  });

  it("makes a high-volume SKU every week and a low-volume colour about every other week", () => {
    const weeksOf = (sku: string) => plan.productionOrders.filter(({ output, week }) => output === sku && week < "2026-10-01").length;
    const weeks = new Set(plan.productionOrders.filter(({ week }) => week < "2026-10-01").map(({ week }) => week)).size;
    expect(weeksOf("00000019")).toBeGreaterThan(weeks * 0.9);
    expect(weeksOf("00000027")).toBeLessThan(weeks * 0.7);
  });

  it("makes as much of a door as the week's SKU completions take in the seven days from it, plus safety, less stock", () => {
    const week = "2026-03-02";
    const doors = plan.productionOrders.find((order) => order.week === week && order.output === "00000015")!;
    const taken = plan.productionOrders
      .filter((order) => order.week === week && isFinished(order.output))
      .reduce((sum, order) => sum + order.completions.at(-1)!.components.find(({ material }) => material === "00000015")!.base, 0n);
    const ledger = new Ledger(config);
    for (const { date, event } of planEvents(config, demand, plan, anchor).events) {
      if (date >= doors.plannedFinish) break;
      ledger.apply(event);
    }
    expect(doors.quantity).toBe(lotFor(taken + targetOf(plan, "00000015") - ledger.balance("00000015", "00000001"), 40n * ONE, 10n * ONE));
  });

  it("keeps every balance at or above its safety target over the whole plan (R09)", () => {
    for (const [key, lowest] of lowestBalances(plan)) {
      const [material] = key.split("@");
      expect(lowest, key).toBeGreaterThanOrEqual(targetOf(plan, material));
    }
  });

  it("varies every 7th eligible completion up by 3 % and every 11th down by 2 % on its first kg or l raw component", () => {
    const eligible = plan.productionOrders.map((order) => ({ order, completion: order.completions.at(-1)! }));
    eligible.forEach(({ order, completion }, index) => {
      const sequence = index + 1;
      const expected = recipeOf(config, order.output).components.map(({ perOutput }) => scaledRequirement(formatDecimal(perOutput), formatDecimal(order.quantity)));
      const at = recipeOf(config, order.output).components.findIndex(({ material }) => ["kg", "l"].includes(byId(config.catalogue.materials, material)!.baseUnit));
      const used = completion.components.map(({ base }) => base);
      if (sequence % 11 === 0) expected[at] -= roundUpToMultiple((expected[at] * 2n) / 100n, ONE / 10n);
      else if (sequence % 7 === 0) expected[at] += roundUpToMultiple((expected[at] * 3n) / 100n, ONE / 10n);
      expect(used).toEqual(expected);
    });
  });

  it("posts one zero-output waste completion seven months before the anchor, the weekday before the order's full completion (PRD-018)", () => {
    const wasted = plan.productionOrders.filter(({ completions }) => completions.length > 1);
    expect(wasted.map(({ output, plannedFinish }) => [output, monthOf(plannedFinish) - anchor])).toEqual([["00000021", -7]]);
    const [order] = wasted;
    const [waste] = order.completions;
    expect(waste.date).toBe(addWeekdays(order.plannedFinish, -1));
    expect(waste.output).toBe(0n);
    expect(waste.components.map(({ material, base }) => [material, base])).toEqual(
      recipeOf(config, "00000021").components.map(({ material }) => [material, material === "00000001" ? 100n * ONE : 0n]),
    );
  });

  it("posts no waste when the history doesn't reach its month", () => {
    const short = changed((copy) => (copy.horizon.historyMonths = 2));
    expect(planSupply(short, planDemand(short, anchor), anchor).productionOrders.every(({ completions }) => completions.length === 1)).toBe(true);
  });
});

describe("purchases", () => {
  it("place one order per supplier and week at Thursday's planning run, received on Monday (steel) or Tuesday (supplies)", () => {
    for (const order of plan.purchaseOrders) {
      expect(order.createdOn).toBe(addDays(order.week, -4));
      expect(order.plannedDate).toBe(addDays(order.week, order.supplier === "00000001" ? 0 : 1));
      expect(order.lines.length).toBeGreaterThan(0);
      expect(order.lines.every(({ base }) => base > 0n)).toBe(true);
      expect(order.lines.map(({ material }) => material)).toEqual([...order.lines.map(({ material }) => material)].sort());
      for (const { material } of order.lines) expect(byId(config.catalogue.materials, material)!.buy!.supplier).toBe(order.supplier);
    }
    const keys = plan.purchaseOrders.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(plan.purchaseOrders.map(({ supplier }) => supplier))).toEqual(new Set(["00000001", "00000002"]));
    const weeks = new Set(plan.purchaseOrders.map(({ week }) => week)).size;
    expect(plan.purchaseOrders.length).toBeGreaterThan(weeks * 1.9);
  });

  it("raise the converted requisitions' line in the anchor month's first purchasing run to at least a lot multiple (BUY-003)", () => {
    const run = plan.purchaseOrders.find(({ createdOn }) => createdOn >= "2026-10-01")!;
    expect(run.createdOn).toBe("2026-10-01");
    expect(plan.requisitions.map(({ material, location, createdOn }) => [material, location, createdOn])).toEqual([
      ["00000001", "00000001", "2026-09-30"],
      ["00000009", "00000001", "2026-09-30"],
    ]);
    for (const requisition of plan.requisitions) {
      const order = plan.purchaseOrders.find(({ lines }) => lines.some((line) => line.requisition === requisition.key))!;
      const line = order.lines.find((candidate) => candidate.requisition === requisition.key)!;
      expect(order).toMatchObject({ week: "2026-10-05", location: requisition.location });
      expect(line.base).toBe(requisition.base);
      expect(requisition.requiredDate).toBe(order.plannedDate);
      expect(requisition.base).toBeGreaterThanOrEqual(pairOf(plan, requisition.material).multiple);
    }
    // Anthracite paint is bought every few weeks; a converted requisition forces a line in a week that wouldn't have one.
    const quiet = changed((copy) => (copy.supply.requisitions.converted = [{ material: "00000023", location: "00000001" }]));
    const supply = planSupply(quiet, planDemand(quiet, anchor), anchor);
    expect(supply.requisitions).toMatchObject([{ material: "00000023", location: "00000001" }]);
    expect(supply.requisitions[0].base).toBeGreaterThanOrEqual(5n * ONE);
  });

  it("plan to a later safety increase once it is in force", () => {
    const sooner = changed((copy) => (copy.supply.safetyStock.laterIncreases[0].monthsAfterAnchor = 0));
    const supply = planSupply(sooner, planDemand(sooner, anchor), anchor);
    const raised = supply.safetyTargets.at(-2)!;
    expect(raised.effectiveFrom).toBe(monthStart(anchor));
    // From the first completion planned under the raised target on, to the month's end.
    const from = supply.productionOrders.find(({ output, plannedFinish }) => output === "00000019" && plannedFinish >= monthStart(anchor))!.plannedFinish;
    const ledger = new Ledger(sooner);
    let lowestAfter: bigint | undefined;
    for (const { date, event } of planEvents(sooner, demand, supply, anchor).events) {
      for (const { material } of ledger.apply(event)) {
        const balance = ledger.balance(material, "00000001");
        if (material === "00000019" && date >= from && date <= monthEnd(anchor)) lowestAfter = smallerOf(lowestAfter ?? balance, balance);
      }
    }
    expect(lowestAfter).toBeGreaterThanOrEqual(raised.quantity);
  });
});

describe("varied", () => {
  const expected = [
    { material: "00000002", base: 16n * ONE },
    { material: "00000007", base: ONE / 20n },
  ];

  it("leaves a completion that neither rule picks unchanged", () => {
    expect(varied(config, expected, 6)).toEqual(expected);
  });

  it("never takes a component below zero", () => {
    expect(varied(config, expected, 11)).toEqual([expected[0], { material: "00000007", base: 0n }]);
    expect(varied(config, expected, 77)[1].base).toBe(0n);
    expect(varied(config, expected, 14)[1].base).toBe(ONE / 20n + ONE / 10n);
  });
});
