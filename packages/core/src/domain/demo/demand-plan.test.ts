import { describe, expect, it } from "vitest";
import { ONE } from "../quantities/decimal";
import { addDays, addWeekdays, isoWeekday, isWeekday, monthOf, weekdaysFrom } from "./calendar";
import { sharesOf } from "./customer-shares";
import {
  dailyDemandOn,
  driftOf,
  expectedDemandOn,
  forecastWindow,
  planDemand,
  planForecasts,
  plantOf,
  seasonOn,
  shipmentsOf,
  splitIntoStreams,
  unitSize,
  yearsSince,
  type DemandPlan,
} from "./demand-plan";
import { byId, finishedProducts, TEST_TENANT_CONFIG, type TestTenantConfig } from "./test-tenant-config.schema";

const config = TEST_TENANT_CONFIG;
const anchor = monthOf("2026-10-01");
const plan = planDemand(config, anchor);
const units = (micro: bigint) => Number(micro / ONE);
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** The committed configuration, changed by `change`. */
function changed(change: (copy: TestTenantConfig) => void): TestTenantConfig {
  const copy = structuredClone(config);
  change(copy);
  return copy;
}

/** A series' total over the plan's days that `keep` accepts. */
function totalOver(series: readonly number[], keep: (day: string) => boolean): number {
  return series.reduce((total, value, index) => total + (keep(plan.days[index]) ? value : 0), 0);
}

/** Every customer stream of a SKU, by customer. */
function streamsOf(sku: string, of: DemandPlan = plan): Map<string, number[]> {
  return new Map([...of.streams].flatMap(([customer, streams]) => (streams.has(sku) ? [[customer, streams.get(sku)!] as const] : [])));
}

/** A customer's whole-history volume per quarter since the history start, over the 8 full quarters. */
function quarterlyVolume(customer: string): number[] {
  const quarters = new Array<number>(8).fill(0);
  for (const series of plan.streams.get(customer)!.values()) {
    series.forEach((value, index) => {
      const quarter = Math.floor(yearsSince(plan.historyStart, plan.days[index]) * 4);
      if (plan.days[index] < "2026-10-01" && quarter < 8) quarters[quarter] += value;
    });
  }
  return quarters;
}

describe("the daily demand model", () => {
  it("covers every weekday from the history start to five weeks past the anchor month", () => {
    expect(plan.historyStart).toBe("2024-10-01");
    expect(plan.days[0]).toBe("2024-10-01");
    expect(plan.days.at(-1)).toBe(addWeekdays("2026-10-31", 25));
    expect(plan.days).toEqual(weekdaysFrom("2024-10-01", plan.days.at(-1)!));
    expect([...plan.demand.keys()]).toEqual(finishedProducts(config));
    for (const series of plan.demand.values()) expect(series).toHaveLength(plan.days.length);
  });

  it("starts near 60 units a weekday and grows by 10 % ± 2 points a year (spec Q8)", () => {
    const all = [...plan.demand.values()];
    const year = (from: string, to: string) => sum(all.map((series) => totalOver(series, (day) => from <= day && day < to)));
    const first = year("2024-10-01", "2025-10-01");
    const second = year("2025-10-01", "2026-10-01");
    expect(first / weekdaysFrom("2024-10-01", "2025-09-30").length).toBeGreaterThan(55);
    expect(first / weekdaysFrom("2024-10-01", "2025-09-30").length).toBeLessThan(68);
    expect(second / first).toBeGreaterThan(1.08);
    expect(second / first).toBeLessThan(1.12);
  });

  it("shows each type's season in its monthly totals: August and December dips, lockers before September, office budgets in March and October", () => {
    const monthly = (sku: string, month: string) => totalOver(plan.demand.get(sku)!, (day) => day.startsWith(month)) / weekdaysFrom(`${month}-01`, `${month}-31`).length;
    // Cabinet red: flat but for its holidays.
    expect(monthly("00000005", "2025-08")).toBeLessThan(monthly("00000005", "2025-06") * 0.95);
    expect(monthly("00000005", "2025-12")).toBeLessThan(monthly("00000005", "2025-10") * 0.9);
    // Office cabinet grey: budget peaks.
    expect(monthly("00000018", "2026-03")).toBeGreaterThan(monthly("00000018", "2026-01") * 1.15);
    expect(monthly("00000018", "2025-10")).toBeGreaterThan(monthly("00000018", "2025-12") * 1.4);
    // Locker 2 grey: back to school, then the August holidays.
    expect(monthly("00000019", "2026-07")).toBeGreaterThan(monthly("00000019", "2026-01") * 1.4);
    expect(monthly("00000019", "2026-08")).toBeLessThan(monthly("00000019", "2026-07") * 0.8);
    // Workshop cabinet grey: spring.
    expect(monthly("00000021", "2026-04")).toBeGreaterThan(monthly("00000021", "2025-11") * 1.35);
  });

  it("is noisy: adjacent days mostly differ, and no two consecutive weeks are identical", () => {
    for (const series of plan.demand.values()) {
      const changes = series.slice(1).filter((value, index) => value !== series[index]).length;
      // A SKU selling one or two a day repeats itself more often than one selling ten.
      expect(changes / series.length).toBeGreaterThan(sum(series) / series.length >= 5 ? 0.65 : 0.35);
    }
    const weekly = new Map<string, number[]>();
    plan.days.forEach((day, index) => {
      const week = addDays(day, 1 - isoWeekday(day));
      weekly.set(week, [...(weekly.get(week) ?? []), ...[...plan.demand.values()].map((series) => series[index])]);
    });
    const weeks = [...weekly.values()].map((values) => values.join());
    expect(weeks.slice(1).every((week, index) => week !== weeks[index])).toBe(true);
  });

  it("gives the same day the same figure whatever month the dataset is generated in, but for the trend", () => {
    const noGrowth = changed((copy) => (copy.demand.growthPerYear = "0"));
    expect(dailyDemandOn(noGrowth, "2025-06-11", "2024-10-01")).toEqual(dailyDemandOn(noGrowth, "2025-06-11", "2025-01-01"));
    expect(planDemand(config, anchor)).toEqual(plan);
  });

  it("is the expected demand × drift × noise, rounded: within 25 % noise and 6 % drift of base × mix × season × weekday × trend", () => {
    for (const [index, day] of plan.days.entries()) {
      const expected = expectedDemandOn(config, day, plan.historyStart);
      for (const [sku, series] of plan.demand) {
        expect(series[index]).toBeGreaterThanOrEqual(Math.round(expected.get(sku)! * 0.94 * 0.75) - 1);
        expect(series[index]).toBeLessThanOrEqual(Math.round(expected.get(sku)! * 1.06 * 1.25) + 1);
      }
    }
    // Cabinet red on a Monday in mid-June, a year and a half in: 16 × 0.5 × 1 × 1.10 × 1.10^(1.7…).
    const expected = expectedDemandOn(config, "2026-06-15", plan.historyStart).get("00000005")!;
    expect(expected).toBeCloseTo(16 * 0.5 * 1.1 * 1.1 ** yearsSince(plan.historyStart, "2026-06-15"), 10);
  });
});

describe("seasonOn", () => {
  const profile = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it("holds each month's value at its mid-point and interpolates linearly between mid-points, across year ends too", () => {
    // Mid-June is the 15th's end (15.5 of 30 days); mid-July the 16th's middle.
    expect(seasonOn(profile, "2026-06-15")).toBeCloseTo(6, 1);
    expect(seasonOn(profile, "2026-07-16")).toBeCloseTo(7, 10);
    expect(seasonOn(profile, "2026-06-30")).toBeGreaterThan(6.4);
    expect(seasonOn(profile, "2026-07-01")).toBeLessThan(6.6);
    expect(seasonOn(profile, "2026-07-01") - seasonOn(profile, "2026-06-30")).toBeCloseTo(1 / 30.5, 10);
    expect(seasonOn(profile, "2027-01-01")).toBeCloseTo(12 - 11 * (16 / 31), 10);
    expect(seasonOn(profile, "2026-12-31")).toBeCloseTo(12 - 11 * (15 / 31) * (15 / 15.5) * (15.5 / 15), 1);
  });
});

describe("driftOf", () => {
  it("is the same for every day of a week, keyed by week and type, and stays within ±6 %", () => {
    expect(new Set(["2026-06-15", "2026-06-17", "2026-06-19"].map((day) => driftOf(config, 2, day))).size).toBe(1);
    expect(driftOf(config, 2, "2026-06-22")).not.toBe(driftOf(config, 2, "2026-06-15"));
    expect(driftOf(config, 3, "2026-06-15")).not.toBe(driftOf(config, 2, "2026-06-15"));
    const drifts = weekdaysFrom("2024-01-01", "2026-12-31").map((day) => driftOf(config, 0, day));
    expect(drifts.every((drift) => drift >= 0.94 && drift <= 1.06)).toBe(true);
    expect(Math.max(...drifts) - Math.min(...drifts)).toBeGreaterThan(0.03);
  });

  it("moves slowly: a week's drift is closer to the last week's than to one a quarter away, on average", () => {
    const weeks = Array.from({ length: 150 }, (_, week) => driftOf(config, 1, addDays("2024-01-01", 7 * week)));
    const step = (lag: number) => sum(weeks.slice(lag).map((drift, index) => Math.abs(drift - weeks[index]))) / (weeks.length - lag);
    expect(step(1)).toBeLessThan(step(13) * 0.7);
  });
});

describe("splitIntoStreams", () => {
  it("splits each day's total over the buyers in whole units that sum to it, each buyer's running total within a unit of its share", () => {
    const totals = [3, 1, 0, 2, 7, 1, 1, 1, 5];
    const shares = [0.5, 0.3, 0.2];
    const streams = splitIntoStreams(totals, () => shares);
    totals.forEach((total, day) => expect(sum(streams.map((stream) => stream[day]))).toBe(total));
    let running = 0;
    totals.forEach((total, day) => {
      running += total;
      streams.forEach((stream, buyer) => expect(Math.abs(sum(stream.slice(0, day + 1)) - running * shares[buyer])).toBeLessThan(1));
    });
    expect(streams.map((stream) => sum(stream))).toEqual([11, 6, 4]);
  });

  it("follows shares that move from day to day", () => {
    const streams = splitIntoStreams([10, 10, 10], (day) => [day / 2, 1 - day / 2]);
    expect(streams).toEqual([
      [0, 5, 10],
      [10, 5, 0],
    ]);
  });
});

describe("customer streams", () => {
  it("sum to D for every SKU on every day, and keep every buyer within a unit of its exact running share (spec 'Customer streams')", () => {
    for (const [sku, totals] of plan.demand) {
      const streams = streamsOf(sku);
      expect([...streams.keys()]).toEqual(sharesOf(config.demand, sku, 0).map(({ customer }) => customer));
      totals.forEach((total, index) => expect(sum([...streams.values()].map((stream) => stream[index]))).toBe(total));
      const exact = new Map([...streams.keys()].map((customer) => [customer, 0]));
      const allotted = new Map([...streams.keys()].map((customer) => [customer, 0]));
      totals.forEach((total, index) => {
        const quarters = yearsSince(plan.historyStart, plan.days[index]) * 4;
        for (const { customer, share } of sharesOf(config.demand, sku, quarters)) {
          exact.set(customer, exact.get(customer)! + total * share);
          allotted.set(customer, allotted.get(customer)! + streams.get(customer)![index]);
          expect(Math.abs(allotted.get(customer)! - exact.get(customer)!)).toBeLessThan(1);
        }
      });
    }
  });

  it("grow the online shop's volume by 10 % ± 2 points a quarter, and shrink the hardware chain's by 0.5 % to 3 % (spec Q5)", () => {
    const online = quarterlyVolume("00000003");
    const hardware = quarterlyVolume("00000001");
    // Year over year, quarter by quarter, so the seasons cancel: (Q5…Q8) / (Q1…Q4), a fourth root per quarter.
    const perQuarter = (quarters: number[]) => (sum(quarters.slice(4)) / sum(quarters.slice(0, 4))) ** (1 / 4);
    expect(perQuarter(online)).toBeGreaterThan(1.08);
    expect(perQuarter(online)).toBeLessThan(1.12);
    expect(perQuarter(hardware)).toBeGreaterThan(0.97);
    expect(perQuarter(hardware)).toBeLessThan(0.995);
    for (let quarter = 4; quarter < 8; quarter += 1) expect(online[quarter]).toBeGreaterThan(online[quarter - 4] * 1.3);
  });
});

describe("customer orders", () => {
  const ordersOf = (customer: string) => plan.orders.filter((order) => order.customer === customer && !order.key.includes(":project:"));

  it("number every order in creation sequence, with unique keys, at the plant that makes its lines", () => {
    expect(plan.orders.map(({ sequence }) => sequence)).toEqual(plan.orders.map((_, index) => index + 1));
    expect(plan.orders.slice(1).every((order, index) => order.createdOn >= plan.orders[index].createdOn)).toBe(true);
    expect(new Set(plan.orders.map(({ key }) => key)).size).toBe(plan.orders.length);
    for (const order of plan.orders) {
      expect(order.lines.length).toBeGreaterThan(0);
      for (const { material, base } of order.lines) {
        expect(plantOf(config, material)).toBe(order.location);
        expect(base).toBeGreaterThan(0n);
      }
    }
  });

  it("have the online shop order its stream every weekday, required that day and created two weekdays earlier", () => {
    const online = ordersOf("00000003");
    expect(online.length).toBeGreaterThan(plan.days.length - 3);
    for (const order of online) {
      expect(order.createdOn).toBe(addWeekdays(order.requiredDate, -2));
      const index = plan.days.indexOf(order.requiredDate);
      expect(order.lines.map(({ material, base, unit }) => [material, units(base), unit])).toEqual(
        [...plan.streams.get("00000003")!].filter(([, stream]) => stream[index] > 0).map(([material, stream]) => [material, stream[index], "each"]),
      );
    }
    expect(online.at(-1)!.requiredDate < plan.days.at(-1)!).toBe(true);
  });

  it("have each B2B customer order on its delivery days, its lead time ahead, its stream up to its next delivery (spec Q6)", () => {
    for (const { customer, deliveryDays, leadWorkingDays, wholePacks } of config.demand.customers.filter(({ customer: id }) => id !== "00000003")) {
      const orders = ordersOf(customer);
      expect(orders.length).toBeGreaterThan(80);
      const deliveries = plan.days.filter((day) => deliveryDays.includes(isoWeekday(day)));
      for (const order of orders) {
        expect(deliveryDays).toContain(isoWeekday(order.requiredDate));
        expect(order.createdOn).toBe(addWeekdays(order.requiredDate, -leadWorkingDays));
        if (wholePacks) continue;
        const from = plan.days.indexOf(order.requiredDate);
        const to = plan.days.indexOf(deliveries[deliveries.indexOf(order.requiredDate) + 1]);
        for (const { material, base } of order.lines) expect(units(base)).toBe(sum(plan.streams.get(customer)!.get(material)!.slice(from, to)));
      }
    }
    expect(new Set(ordersOf("00000001").map(({ requiredDate }) => isoWeekday(requiredDate)))).toEqual(new Set([2, 4]));
  });

  it("have the export distributor order whole pallets, entered in pallets, staying within half a pallet of its streams (MAT-019)", () => {
    const orders = ordersOf("00000004");
    const firstMonday = plan.days.findIndex((day) => isoWeekday(day) === 1);
    for (const [sku, stream] of plan.streams.get("00000004")!) {
      const pallet = unitSize(byId(config.catalogue.materials, sku)!, "pallet");
      let ordered = 0n;
      for (const order of orders) {
        const line = order.lines.find(({ material }) => material === sku);
        if (line) {
          expect(line.unit).toBe("pallet");
          expect(BigInt(line.quantity) * pallet).toBe(line.base);
          ordered += line.base;
        }
        // Each Monday's order holds the stream up to the next Monday.
        const streamed = BigInt(sum(stream.slice(firstMonday, plan.days.indexOf(addWeekdays(order.requiredDate, 5))))) * ONE;
        expect(ordered - streamed <= pallet / 2n && streamed - ordered <= pallet / 2n).toBe(true);
      }
    }
  });

  it("add each project once a year on top of the streams: its days of demand, delivered on or after its day, in pallets for the exporter", () => {
    const projects = plan.orders.filter(({ key }) => key.includes(":project:"));
    expect(projects.map(({ customer, requiredDate, lines }) => [customer, requiredDate, lines[0].material, lines[0].unit])).toEqual([
      ["00000002", "2025-03-17", "00000026", "each"],
      ["00000004", "2025-05-19", "00000021", "pallet"],
      ["00000002", "2025-08-25", "00000020", "each"],
      ["00000002", "2026-03-16", "00000026", "each"],
      ["00000004", "2026-05-18", "00000021", "pallet"],
      ["00000002", "2026-08-24", "00000020", "each"],
    ]);
    const march = projects[0];
    const start = plan.days.indexOf(march.requiredDate);
    expect(units(march.lines[0].base)).toBe(sum(plan.demand.get("00000026")!.slice(start, start + 6)));
    expect(march.createdOn).toBe(addWeekdays(march.requiredDate, -10));
    const may = projects[1];
    const mayStart = plan.days.indexOf(may.requiredDate);
    expect(Math.abs(units(may.lines[0].base) - sum(plan.demand.get("00000021")!.slice(mayStart, mayStart + 10)))).toBeLessThanOrEqual(5);
  });

  it("enter a project of less than half a pallet as one pallet, and leave out a project whose days the demand doesn't cover", () => {
    const small = changed((copy) => {
      copy.demand.projects[1].days = 1;
      copy.demand.projects.push({ customer: "00000002", material: "00000018", date: "11-27", days: 30 });
    });
    const projects = planDemand(small, anchor).orders.filter(({ key }) => key.includes(":project:"));
    expect(projects.filter(({ customer }) => customer === "00000004").map(({ lines }) => lines[0].quantity)).toEqual(["1", "1"]);
    // 2024-11-27 and 2025-11-27 have their 30 days; 2026-11-27 would run past the demand.
    expect(projects.filter(({ lines }) => lines[0].material === "00000018").map(({ requiredDate }) => requiredDate)).toEqual(["2024-11-27", "2025-11-27"]);
  });

  it("skip a delivery with nothing to order", () => {
    const quiet = changed((copy) => (copy.demand.types[4].baseDaily = "0.01"));
    const quietPlan = planDemand(quiet, anchor);
    expect(quietPlan.orders.some(({ lines }) => lines.some(({ material }) => material === "00000030"))).toBe(false);
    expect(quietPlan.orders.every(({ lines }) => lines.length > 0)).toBe(true);
  });

  it("ship every ninth order in two, 60 % first, and every other one in full on its required date", () => {
    for (const order of plan.orders) {
      const isSplit = order.sequence % 9 === 0;
      expect(order.shipments.length).toBe(isSplit && order.lines.some(({ base }) => base > ONE) ? 2 : 1);
      expect(order.shipments[0].plannedDate).toBe(order.requiredDate);
      for (const shipment of order.shipments) expect(shipment.createdOn).toBe(addWeekdays(shipment.plannedDate, -2));
      order.lines.forEach(({ base }, line) => {
        const shipped = order.shipments.flatMap(({ lines }) => lines).filter(({ orderLine }) => orderLine === line);
        expect(shipped.reduce((total, part) => total + part.base, 0n)).toBe(base);
        if (isSplit) expect(shipped[0].base).toBe(BigInt(Math.max(1, Math.floor(units(base) * 0.6))) * ONE);
      });
    }
  });
});

describe("shipmentsOf", () => {
  const order = {
    key: "order",
    customer: "00000001",
    location: "00000001",
    createdOn: "2026-10-22",
    requiredDate: "2026-10-29",
    lines: [
      { material: "00000005", base: 10n * ONE, quantity: "10", unit: "each" },
      { material: "00000024", base: ONE, quantity: "1", unit: "each" },
    ],
  };

  it("ships the rest of a split order three weekdays later and leaves out lines the first shipped in full", () => {
    const [first, second] = shipmentsOf(order, true);
    expect(first.lines).toEqual([
      { orderLine: 0, base: 6n * ONE },
      { orderLine: 1, base: ONE },
    ]);
    expect(second).toMatchObject({ plannedDate: "2026-11-03", createdOn: "2026-10-30", lines: [{ orderLine: 0, base: 4n * ONE }] });
  });

  it("plans no second shipment when the first takes every line in full", () => {
    expect(shipmentsOf({ ...order, lines: [order.lines[1]] }, true)).toHaveLength(1);
  });
});

describe("unitSize", () => {
  it("converts one entered unit to base micro-units, a base unit being one", () => {
    const cabinet = byId(config.catalogue.materials, "00000005")!;
    expect([unitSize(cabinet, "pallet"), unitSize(cabinet, "each")]).toEqual([20n * ONE, ONE]);
  });
});

describe("forecasts", () => {
  it("cover the weekdays from tomorrow through the same date a year on", () => {
    expect(forecastWindow(config, "2026-10-21")).toEqual({ first: "2026-10-22", last: "2027-10-21" });
  });

  it("give each SKU at its plant one row per weekday of the window, holding the rounded expected demand, with no noise (spec Q9)", () => {
    const { first, last } = forecastWindow(config, "2026-10-21");
    const forecasts = planForecasts(config, first, last, plan.historyStart);
    const weekdays = weekdaysFrom(first, last);
    expect(forecasts).toHaveLength(12 * weekdays.length);
    expect(forecasts.filter(({ material }) => material === "00000030").map(({ date }) => date)).toEqual(weekdays);
    expect(forecasts.every(({ date, location }) => isWeekday(date) && location === "00000001")).toBe(true);
    for (const { material, date, quantity } of forecasts.filter((_, index) => index % 97 === 0)) {
      expect(Number(quantity)).toBe(Math.round(expectedDemandOn(config, date, plan.historyStart).get(material)!));
    }
  });

  it("leave out the days that round to nothing", () => {
    const sparse = changed((copy) => (copy.demand.types[4].baseDaily = "1.6"));
    const forecasts = planForecasts(sparse, "2026-11-02", "2026-11-06", "2024-10-01").filter(({ material }) => material === "00000030");
    // 1.6 × 0.25 = 0.4 a day before the season, weekday and trend: Mondays and Tuesdays round up, the rest down.
    expect(forecasts.map(({ date }) => date)).toEqual(["2026-11-02", "2026-11-03"].filter((date) => Math.round(expectedDemandOn(sparse, date, "2024-10-01").get("00000030")!) > 0));
    expect(forecasts.length).toBeLessThan(5);
  });
});
