import { describe, expect, it } from "vitest";
import { scaledRequirement } from "../production-orders/production-planning";
import { formatDecimal, ONE } from "../quantities/decimal";
import { addWeekdays, monthOf, monthStart, nthWeekday, weekdaysOf } from "./calendar";
import { planDemand } from "./demand-plan";
import { largerOf, lotFor, pairKey, smallerOf, planningPairs, planSupply, recipeOf, roundUpToMultiple, toBase, varied, type SupplyPlan } from "./supply-plan";
import { byId, TEST_TENANT_CONFIG, type TestTenantConfig } from "./test-tenant-config.schema";

const config = TEST_TENANT_CONFIG;
const anchor = monthOf("2026-10-01");
const historyStart = anchor - 24;
const demand = planDemand(config, anchor);
const plan = planSupply(config, demand, anchor);
const units = (micro: bigint) => Number(micro) / Number(ONE);
const weekdayOf = (date: string) => weekdaysOf(monthOf(date)).indexOf(date) + 1;

function changed(change: (copy: TestTenantConfig) => void): TestTenantConfig {
  const copy = structuredClone(config);
  change(copy);
  return copy;
}

const targetOf = (supply: SupplyPlan, material: string, location: string) =>
  supply.safetyTargets.find((target) => target.material === material && target.location === location)!.quantity;

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
    expect(recipeOf(config, "00000004")).toEqual({
      bom: "00000001",
      components: [
        { material: "00000001", perOutput: 4_500_000n },
        { material: "00000003", perOutput: 250_000n },
      ],
    });
    expect(recipeOf(config, "00000026").bom).toBe("00000014");
  });
});

describe("planningPairs", () => {
  it("plans the 15 made pairs and, per plant, every raw material its recipes use, alternates included, plus Poznań's bought shelves: 48 pairs", () => {
    const pairs = planningPairs(config);
    expect(pairs).toHaveLength(48);
    expect(pairs.filter(({ procurement }) => procurement === "make")).toHaveLength(15);
    const boughtAt = (location: string) =>
      pairs.filter((pair) => pair.procurement === "buy" && pair.location === location).map(({ material }) => Number(material));
    expect(boughtAt("00000001")).toEqual([1, 2, 3, 6, 7, 8, 9, 10, 11, 12]);
    expect(boughtAt("00000002")).toEqual([2, 6, 7, 8, 9, 10, 11, 14, 17]);
    expect(boughtAt("00000003")).toEqual([2, 6, 7, 9, 11, 12, 13]);
    expect(boughtAt("00000004")).toEqual([1, 6, 7, 8, 9, 10, 11]);
    expect(pairs.find((pair) => pair.material === "00000017" && pair.location === "00000002")).toMatchObject({ leadTimeDays: 10, minimum: 100n * ONE, multiple: 50n * ONE, suppliers: ["00000005"] });
  });
});

describe("safety targets", () => {
  it("gives every planned pair a target from the history start, and the two later increases three months after the anchor (DEM-016)", () => {
    expect(plan.safetyTargets).toHaveLength(50);
    expect(plan.safetyTargets.slice(0, 48).every(({ effectiveFrom }) => effectiveFrom === monthStart(historyStart))).toBe(true);
    const later = plan.safetyTargets.slice(48);
    expect(later.map(({ material, location, effectiveFrom }) => [material, location, effectiveFrom])).toEqual([
      ["00000019", "00000002", "2027-01-01"],
      ["00000023", "00000003", "2027-01-01"],
    ]);
    expect(later[0].quantity).toBe(roundUpToMultiple((targetOf(plan, "00000019", "00000002") * 125n) / 100n, 10n * ONE));
  });

  it("covers a finished product's half month of demand, rounded up to its lot multiple", () => {
    let total = 0n;
    for (let month = historyStart; month < anchor; month += 1) total += demand.ordered.get("00000025")!.get(month)!;
    expect(targetOf(plan, "00000025", "00000004")).toBe(roundUpToMultiple(total / 24n / 2n, 50n * ONE));
  });

  it("covers a raw material's lead-time consumption with a 1.2 margin, and keeps one lot multiple when nothing is used", () => {
    let consumed = 0n;
    for (const order of plan.productionOrders.filter(({ location, month }) => location === "00000003" && month < anchor)) {
      consumed += order.completions.at(-1)!.components.find(({ material }) => material === "00000013")?.base ?? 0n;
    }
    const leadTimeUse = (consumed / 24n) * 21n / 30n;
    const target = targetOf(plan, "00000013", "00000003");
    expect(target).toBeGreaterThanOrEqual(leadTimeUse);
    expect(units(target)).toBeCloseTo(Math.ceil((units(leadTimeUse) * 1.2) / 100) * 100, -2);
    expect(targetOf(plan, "00000001", "00000004")).toBe(100n * ONE);
  });
});

describe("opening balances", () => {
  it("start each of the 48 pairs at its safety target plus one minimum lot, per plant", () => {
    const lines = [...plan.openings.values()].flat();
    expect(lines).toHaveLength(48);
    expect(plan.openings.get("00000004")!.map(({ material }) => material)).toEqual(["00000025", "00000026", "00000001", "00000006", "00000007", "00000008", "00000009", "00000010", "00000011"]);
    for (const pair of plan.pairs) {
      const line = plan.openings.get(pair.location)!.find(({ material }) => material === pair.material)!;
      expect(line.base).toBe(targetOf(plan, pair.material, pair.location) + pair.minimum);
    }
  });
});

describe("production", () => {
  it("plans one order per made pair and month with a need, created on weekday 8 of the month before, finishing in its completion band", () => {
    expect(plan.productionOrders).toHaveLength(15 * 26);
    for (const order of plan.productionOrders) {
      const pair = plan.pairs.find((candidate) => candidate.procurement === "make" && candidate.pairIndex === order.pairIndex)!;
      const isFinished = byId(config.catalogue.materials, order.output)!.type === "finished";
      expect(order.createdOn).toBe(nthWeekday(order.month - 1, 8));
      expect(weekdayOf(order.plannedFinish)).toBe((isFinished ? 7 : 4) + (order.pairIndex % 3));
      expect(order.plannedStart).toBe(new Date(Date.parse(`${order.plannedFinish}T00:00:00Z`) - pair.leadTimeDays * 86_400_000).toISOString().slice(0, 10));
      expect(order.quantity % pair.multiple === 0n || order.quantity === pair.minimum).toBe(true);
      expect(order.quantity).toBeGreaterThanOrEqual(pair.minimum);
      const full = order.completions.at(-1)!;
      expect(full).toMatchObject({ date: order.plannedFinish, output: order.quantity });
      expect(full.components.map(({ material }) => material)).toEqual(recipeOf(config, order.output).components.map(({ material }) => material));
      expect(order.bom).toBe(recipeOf(config, order.output).bom);
    }
  });

  it("makes as much of an intermediate as its users' production at the plant explodes to, plus safety, less stock", () => {
    for (const month of [historyStart, anchor - 7, anchor + 1]) {
      const doors = plan.productionOrders.find((order) => order.month === month && order.output === "00000015" && order.location === "00000002")!;
      const users = plan.productionOrders.filter((order) => order.month === month && order.location === "00000002" && ["00000019", "00000020"].includes(order.output));
      const explosion = users.reduce((sum, order) => sum + order.completions.at(-1)!.components.find(({ material }) => material === "00000015")!.base, 0n);
      const before = month === historyStart ? targetOf(plan, "00000015", "00000002") + 40n * ONE : plan.closing.get(pairKey("00000015", "00000002"))!.get(month - 1)!;
      expect(doors.quantity).toBe(lotFor(explosion + targetOf(plan, "00000015", "00000002") - before, 40n * ONE, 10n * ONE));
    }
  });

  it("never makes an intermediate that nothing at its plant uses", () => {
    const idle = changed((copy) => copy.catalogue.production.push({ material: "00000015", location: "00000004", leadTimeDays: 3, minimumQuantity: "40", lotMultiple: "10" }));
    const supply = planSupply(idle, planDemand(idle, anchor), anchor);
    expect(supply.productionOrders.filter(({ output, location }) => output === "00000015" && location === "00000004")).toEqual([]);
    expect(targetOf(supply, "00000015", "00000004")).toBe(0n);
    expect([...supply.closing.get(pairKey("00000015", "00000004"))!.values()].every((balance) => balance === 40n * ONE)).toBe(true);
  });

  it("varies every 7th eligible completion per plant up by 3 % and every 11th down by 2 % on its first kg or l raw component", () => {
    const completions = plan.productionOrders
      .filter(({ location }) => location === "00000003")
      .map((order) => ({ order, completion: order.completions.at(-1)! }));
    completions.forEach(({ order, completion }, index) => {
      const sequence = index + 1;
      const expected = recipeOf(config, order.output).components.map(({ perOutput }) => scaledRequirement(formatDecimal(perOutput), formatDecimal(order.quantity)));
      const sheet = completion.components[0].base;
      if (sequence % 11 === 0) expect(sheet).toBe(expected[0] - roundUpToMultiple((expected[0] * 2n) / 100n, ONE / 10n));
      else if (sequence % 7 === 0) expect(sheet).toBe(expected[0] + roundUpToMultiple((expected[0] * 3n) / 100n, ONE / 10n));
      else expect(sheet).toBe(expected[0]);
      expect(completion.components.slice(1).map(({ base }) => base)).toEqual(expected.slice(1));
    });
  });

  it("leaves completions with no kg or l component out of the variance count", () => {
    const lockers = plan.productionOrders.filter(({ output }) => output === "00000019");
    for (const order of lockers) {
      const expected = recipeOf(config, "00000019").components.map(({ perOutput }) => scaledRequirement(formatDecimal(perOutput), formatDecimal(order.quantity)));
      expect(order.completions[0].components.map(({ base }) => base)).toEqual(expected);
    }
  });

  it("posts one zero-output waste completion per plant seven months before the anchor, the weekday before the order's full completion (PRD-018)", () => {
    const wasted = plan.productionOrders.filter(({ completions }) => completions.length > 1);
    const byLocation = wasted.map(({ output, location, month }) => [location, output, month - anchor]).sort((x, y) => String(x[0]).localeCompare(String(y[0])));
    expect(byLocation).toEqual([
      ["00000001", "00000021", -7],
      ["00000002", "00000016", -7],
      ["00000003", "00000022", -7],
      ["00000004", "00000025", -7],
    ]);
    for (const order of wasted) {
      const [waste] = order.completions;
      const sheet = config.supply.waste.orders.find(({ output }) => output === order.output)!.sheet;
      expect(waste.date).toBe(addWeekdays(order.plannedFinish, -1));
      expect(waste.output).toBe(0n);
      expect(waste.components.map(({ material, base }) => [material, base === 0n])).toEqual(recipeOf(config, order.output).components.map(({ material }) => [material, material !== sheet]));
      expect(waste.components.find(({ material }) => material === sheet)!.base).toBe(plan.pairs.find((pair) => pair.material === sheet && pair.location === order.location)!.multiple);
    }
  });
});

describe("purchases", () => {
  it("groups each month's lines into one order per supplier and plant, created on weekday 2 of the month before and planned in the receipt band", () => {
    for (const order of plan.purchaseOrders) {
      expect(order.createdOn).toBe(nthWeekday(order.month - 1, 2));
      expect(weekdayOf(order.plannedDate)).toBe(1 + ((Number(order.supplier) - 1) % 3));
      expect(order.lines.length).toBeGreaterThan(0);
      expect(order.lines.every(({ base }) => base > 0n)).toBe(true);
    }
    const keys = plan.purchaseOrders.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("alternates hinges and locks between suppliers 00000002 and 00000006 by month", () => {
    const supplierOf = (month: number) =>
      plan.purchaseOrders.filter((order) => order.month === month && order.lines.some(({ material }) => material === "00000010")).map(({ supplier }) => supplier);
    expect(new Set(supplierOf(anchor - 2))).toEqual(new Set([anchor % 2 === 0 ? "00000002" : "00000006"]));
    expect(new Set(supplierOf(anchor - 1))).toEqual(new Set([anchor % 2 === 0 ? "00000006" : "00000002"]));
  });

  it("buys Poznań's shelves from Metal Components Nord", () => {
    const shelves = plan.purchaseOrders.filter(({ location, lines }) => location === "00000002" && lines.some(({ material }) => material === "00000017"));
    expect(shelves.length).toBeGreaterThan(20);
    expect(new Set(shelves.map(({ supplier }) => supplier))).toEqual(new Set(["00000005"]));
  });

  it("keeps every balance at or above its safety target at every month end", () => {
    for (const pair of plan.pairs) {
      const key = pairKey(pair.material, pair.location);
      for (const balance of plan.closing.get(key)!.values()) expect(balance).toBeGreaterThanOrEqual(targetOf(plan, pair.material, pair.location));
    }
  });

  it("raises next month's line to at least one lot multiple for each converted requisition, which takes exactly its quantity (BUY-003)", () => {
    expect(plan.requisitions.map(({ material, location, createdOn }) => [material, location, createdOn])).toEqual([
      ["00000001", "00000001", nthWeekday(anchor, 1)],
      ["00000009", "00000002", nthWeekday(anchor, 1)],
    ]);
    for (const requisition of plan.requisitions) {
      const order = plan.purchaseOrders.find(({ lines }) => lines.some((line) => line.requisition === requisition.key))!;
      const line = order.lines.find((candidate) => candidate.requisition === requisition.key)!;
      expect(order).toMatchObject({ month: anchor + 1, location: requisition.location });
      expect(line.base).toBe(requisition.base);
      expect(requisition.requiredDate).toBe(order.plannedDate);
    }
    const unused = changed((copy) => (copy.supply.requisitions.converted = [{ material: "00000001", location: "00000004" }]));
    const supply = planSupply(unused, planDemand(unused, anchor), anchor);
    expect(supply.requisitions).toMatchObject([{ material: "00000001", location: "00000004", base: 100n * ONE }]);
  });

  it("plans next month to a later safety increase once it is in force", () => {
    const sooner = changed((copy) => (copy.supply.safetyStock.laterIncreases[0].monthsAfterAnchor = 1));
    const supply = planSupply(sooner, planDemand(sooner, anchor), anchor);
    const raised = supply.safetyTargets.at(-2)!;
    expect(raised.effectiveFrom).toBe(monthStart(anchor + 1));
    expect(supply.closing.get(pairKey("00000019", "00000002"))!.get(anchor + 1)).toBeGreaterThanOrEqual(raised.quantity);
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
