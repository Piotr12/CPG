import { isCalendarDate } from "../../validators/dates/calendar-date.schema";
import { formatDecimal } from "../quantities/decimal";
import { monthOf, monthStart, type Month } from "./calendar";
import { planDemand, planForecasts } from "./demand-plan";
import { replayTimeline, type DatasetSummary } from "./replay";
import { planSupply } from "./supply-plan";
import type { MaterialType } from "../../validators/materials/material-fields.schema";
import type { ProcurementMode } from "../planning-parameters/procurement";
import type { TestTenantConfig } from "./test-tenant-config.schema";
import { buildTimeline, planEvents, type AnchorPlan, type TimelineEvent } from "./timeline";

/*
 * The Test tenant's demonstration dataset (spec `2026-10-21--0718UTC-test-tenant-dataset`): a pure,
 * deterministic function of the configuration and today's date. The seeder writes it through the
 * services; nothing here touches the database.
 */

export type { TimelineEvent } from "./timeline";

/** One demonstration material and its conversions, as the material seed creates it. */
export interface DemoMaterial {
  type: MaterialType;
  description: string;
  baseUnit: string;
  conversions: { unit: string; numerator: string; denominator: string }[];
}

/** One demonstration BOM, as the BOM seed creates it: its output, recipe and lines as entered, by business ID. */
export interface DemoBom {
  output: string;
  priority: number;
  validFrom: string;
  validThrough: string | null;
  components: { material: string; quantity: string; unit: string }[];
}

/** One demonstration parameter set, by material and location ID; quantities in the material's base unit. */
export interface DemoPlanningParameters {
  material: string;
  location: string;
  procurement: ProcurementMode;
  leadTimeDays: number;
  minimumQuantity: string;
  lotMultiple: string;
}

/** One demonstration safety-stock target, by material and location ID. */
export interface DemoSafetyStockTarget {
  material: string;
  location: string;
  effectiveFrom: string;
  quantity: string;
}

/** One demonstration forecast, by material and location ID. */
export interface DemoForecast {
  material: string;
  location: string;
  date: string;
  quantity: string;
}

export interface TestTenantDataset {
  today: string;
  /** The first day of the current month. */
  anchor: string;
  /** The first day of the first history month: the anchor less `historyMonths`. */
  historyStart: string;
  /** The first day of the setup month before the history: the masters' creation and the opening balances. */
  setupDate: string;
  masters: {
    materials: DemoMaterial[];
    locations: string[];
    customers: string[];
    suppliers: string[];
    boms: DemoBom[];
    planningParameters: DemoPlanningParameters[];
    safetyStockTargets: DemoSafetyStockTarget[];
  };
  forecasts: DemoForecast[];
  /** Chronological by `at`, cut at today: the history and today's partial postings. */
  timeline: TimelineEvent[];
  summary: DatasetSummary;
}

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

/**
 * The dataset as of `today` (`YYYY-MM-DD`, UTC): the masters, the forecasts for the months after
 * this one, and the timeline of documents and postings up to today (spec "The dataset"). It refuses,
 * by throwing, a configuration whose timeline would drive a balance negative or exceed its limits.
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
    summary: replayTimeline(config, timeline),
  };
}
