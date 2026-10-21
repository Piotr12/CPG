import { isCalendarDate } from "../../validators/dates/calendar-date.schema";
import { formatDecimal } from "../quantities/decimal";
import { monthOf, monthStart, type Month } from "./calendar";
import { planDemand, planForecasts } from "./demand-plan";
import { Ledger } from "./ledger";
import { planSupply } from "./supply-plan";
import type { MaterialType } from "../../validators/materials/material-fields.schema";
import type { TestTenantConfig } from "./test-tenant-config.schema";
import { buildTimeline, planEvents, type AnchorPlan, type TimelineEvent } from "./timeline";

/*
 * The Test tenant's demonstration dataset (spec `2026-10-21--0718UTC-test-tenant-dataset`): a pure,
 * deterministic function of the configuration and today's date. The seeder writes it through the
 * services; nothing here touches the database.
 */

export type { TimelineEvent } from "./timeline";

export interface TestTenantDataset {
  today: string;
  /** The first day of the current month. */
  anchor: string;
  /** The first day of the first history month: the anchor less `historyMonths`. */
  historyStart: string;
  /** The first day of the setup month before the history: the masters' creation and the opening balances. */
  setupDate: string;
  masters: {
    materials: { type: MaterialType; description: string; baseUnit: string; conversions: { unit: string; numerator: string; denominator: string }[] }[];
    locations: string[];
    customers: string[];
    suppliers: string[];
    boms: { output: string; priority: number; validFrom: string; validThrough: null; components: { material: string; quantity: string; unit: string }[] }[];
    planningParameters: { material: string; location: string; procurement: "make" | "buy"; leadTimeDays: number; minimumQuantity: string; lotMultiple: string }[];
    safetyStockTargets: { material: string; location: string; effectiveFrom: string; quantity: string }[];
  };
  forecasts: { material: string; location: string; date: string; quantity: string }[];
  /** Chronological by `at`, cut at today: the history and today's partial postings. */
  timeline: TimelineEvent[];
  summary: Record<
    "customerOrders" | "shipments" | "goodsIssues" | "requisitions" | "purchaseOrders" | "goodsReceipts" | "productionOrders" | "completions" | "openings" | "movements",
    number
  >;
}

/** The summary key counting each kind of timeline event. */
const SUMMARY_KEY = {
  opening: "openings",
  customerOrder: "customerOrders",
  shipment: "shipments",
  goodsIssue: "goodsIssues",
  requisition: "requisitions",
  purchaseOrder: "purchaseOrders",
  goodsReceipt: "goodsReceipts",
  productionOrder: "productionOrders",
  completion: "completions",
} as const satisfies Record<TimelineEvent["kind"], keyof TestTenantDataset["summary"]>;

/**
 * The plans of each anchor month already worked out, per configuration object: every day of a month
 * shares them, so generating many days of one month (the replay tests) plans the month once. A
 * configuration is treated as immutable once generated from.
 */
const PLANS = new WeakMap<TestTenantConfig, Map<Month, AnchorPlan>>();

function anchorPlan(config: TestTenantConfig, anchor: Month): AnchorPlan {
  const known = PLANS.get(config) ?? new Map<Month, AnchorPlan>();
  PLANS.set(config, known);
  const cached = known.get(anchor);
  if (cached) return cached;
  const demand = planDemand(config, anchor);
  const plan = planEvents(config, demand, planSupply(config, demand, anchor), anchor);
  known.set(anchor, plan);
  return plan;
}

/** The counts per kind, and the stock movements the timeline posts. */
function summarize(config: TestTenantConfig, timeline: readonly TimelineEvent[]): TestTenantDataset["summary"] {
  const summary = { customerOrders: 0, shipments: 0, goodsIssues: 0, requisitions: 0, purchaseOrders: 0, goodsReceipts: 0, productionOrders: 0, completions: 0, openings: 0, movements: 0 };
  const ledger = new Ledger(config);
  for (const event of timeline) {
    summary[SUMMARY_KEY[event.kind]] += 1;
    summary.movements += ledger.apply(event).length;
  }
  return summary;
}

/**
 * The dataset as of `today` (`YYYY-MM-DD`, UTC): the masters, the forecasts for the months after
 * this one, and the timeline of documents and postings up to today (spec "The dataset").
 */
export function generateTestTenantDataset(config: TestTenantConfig, today: string): TestTenantDataset {
  if (!isCalendarDate(today)) throw new RangeError(`Today must be a calendar date written YYYY-MM-DD; got ${today}.`);
  const anchor = monthOf(today);
  const historyStart = anchor - config.horizon.historyMonths;
  const plan = anchorPlan(config, anchor);
  const timeline = buildTimeline(config, plan, today);
  const { catalogue } = config;
  return {
    today,
    anchor: monthStart(anchor),
    historyStart: monthStart(historyStart),
    setupDate: monthStart(historyStart - 1),
    masters: {
      materials: catalogue.materials.map(({ type, description, baseUnit, conversions }) => ({ type, description, baseUnit, conversions: conversions.map((conversion) => ({ ...conversion })) })),
      locations: [...catalogue.locations],
      customers: [...catalogue.customers],
      suppliers: [...catalogue.suppliers],
      boms: catalogue.boms.map(({ output, priority, components }) => ({ output, priority, validFrom: monthStart(historyStart), validThrough: null, components: components.map((line) => ({ ...line })) })),
      planningParameters: plan.supply.pairs.map(({ material, location, procurement, leadTimeDays, minimum, multiple }) => ({
        material,
        location,
        procurement,
        leadTimeDays,
        minimumQuantity: formatDecimal(minimum),
        lotMultiple: formatDecimal(multiple),
      })),
      safetyStockTargets: plan.supply.safetyTargets.map(({ material, location, effectiveFrom, quantity }) => ({ material, location, effectiveFrom, quantity: formatDecimal(quantity) })),
    },
    forecasts: planForecasts(config, plan.demand, anchor),
    timeline,
    summary: summarize(config, timeline),
  };
}
