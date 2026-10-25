import { z } from "zod";
import { businessIdSchema } from "../../validators/business-ids/business-id.schema";
import { descriptionSchema, factorSchema, materialTypeSchema, unitSchema } from "../../validators/materials/material-fields.schema";
import { isStatisticalUnit } from "../../validators/units/unit-registry";
import { findCycle, type RecipeEdge } from "../boms/find-cycle";
import { canBeBomComponent, canBeBomOutput } from "../boms/recipe-rules";
import { formatSequentialId } from "../business-ids/sequential-id";
import { ONE, parseDecimal } from "../quantities/decimal";
import { isCalendarDate } from "../../validators/dates/calendar-date.schema";
import { remainderShare } from "./customer-shares";
import rawConfig from "./test-tenant-config.json";

/*
 * The Test tenant's demonstration dataset is stated in one file, `test-tenant-config.json` (spec
 * `2026-10-21--0718UTC-test-tenant-dataset`, Q1, reshaped by `2026-10-25--0848UTC-single-site-daily-dataset`):
 * the shape the owner set (counts and horizons), the daily demand and weekly supply parameters, the
 * limits, and the catalogue that gives the shape its names. This schema parses it and cross-checks the
 * catalogue against the shape, so the numbers stay the one statement of the shape and a catalogue that
 * disagrees fails the unit tests. Decimals are strings (R03); counts, days and months are whole JSON numbers.
 */

/** Months in a year: a seasonality profile has one multiplier per calendar month, January first. */
export const MONTHS_PER_YEAR = 12;
/** Monday to Friday: a weekday profile has one multiplier per working day, and delivery days are numbered 1–5. */
export const WEEKDAYS = 5;
/** The least share of every SKU the remainder customers keep, up to the end of the forecast horizon (spec "Customers"). */
const REMAINDER_FLOOR = 0.2;
/**
 * The generator runs demand this many weekdays past the anchor month, so an order created in the
 * month (its lead time ahead) holds its whole delivery period or project; the schema checks the
 * customers fit.
 */
export const DEMAND_WEEKDAYS_PAST_MONTH = 25;

const DECIMAL_MESSAGE = "Use a decimal string of at least 0 with at most 12 digits before the point and 6 after it.";
const POSITIVE_DECIMAL_MESSAGE = "Use a decimal string greater than 0.";

const decimalSchema = z.string().refine((text) => parseDecimal(text) !== null, DECIMAL_MESSAGE);
const positiveDecimalSchema = z.string().refine((text) => (parseDecimal(text) ?? 0n) > 0n, POSITIVE_DECIMAL_MESSAGE);
/** A growth rate, which may be negative (a customer that shrinks) but above −1, which would leave it nothing. */
const RATE_MESSAGE = "Use a decimal string above -1, such as 0.1 or -0.015.";
const rateSchema = z.string().refine((text) => /^-?\d{1,3}(\.\d{1,6})?$/.test(text) && Number(text) > -1, RATE_MESSAGE);
const countSchema = z.number().int().positive();
const wholeSchema = z.number().int().nonnegative();
const weekdaySchema = z.number().int().min(1).max(WEEKDAYS);
/** A day of the year, `MM-DD`, that exists in every year: 29 February doesn't. */
const dayOfYearSchema = z.string().refine((text) => /^\d{2}-\d{2}$/.test(text) && isCalendarDate(`2025-${text}`), "Use a day of the year written MM-DD.");
const nameSchema = descriptionSchema;

const buySchema = z.strictObject({
  leadTimeDays: z.number().int().nonnegative(),
  minimumQuantity: positiveDecimalSchema,
  lotMultiple: positiveDecimalSchema,
  supplier: businessIdSchema,
});

const materialSchema = z.strictObject({
  type: materialTypeSchema,
  description: descriptionSchema,
  baseUnit: unitSchema,
  conversions: z.array(z.strictObject({ unit: unitSchema, numerator: factorSchema, denominator: factorSchema })),
  buy: buySchema.optional(),
});

const lineSchema = z.strictObject({ material: businessIdSchema, quantity: positiveDecimalSchema, unit: unitSchema });

const configSchema = z.strictObject({
  randomSeed: z.number().int().nonnegative(),
  horizon: z.strictObject({ historyMonths: countSchema, forecastMonths: countSchema }),
  shape: z.strictObject({
    locations: countSchema,
    customers: countSchema,
    suppliers: countSchema,
    rawMaterials: countSchema,
    intermediates: countSchema,
    finishedProducts: z.strictObject({ types: countSchema, skus: countSchema }),
    alternateBoms: z.strictObject({ product: businessIdSchema, count: countSchema }),
  }),
  limits: z.strictObject({ documents: countSchema, movements: countSchema }),
  demand: z.strictObject({
    growthPerYear: decimalSchema,
    noise: decimalSchema,
    drift: z.strictObject({ weeks: countSchema, decay: decimalSchema, amplitude: decimalSchema }),
    weekday: z.array(positiveDecimalSchema).length(WEEKDAYS),
    seasonality: z.record(z.string(), z.array(positiveDecimalSchema).length(MONTHS_PER_YEAR)),
    types: z.array(z.strictObject({ name: nameSchema, baseDaily: positiveDecimalSchema, profile: z.string() })),
    products: z.array(z.strictObject({ material: businessIdSchema, type: nameSchema, mix: positiveDecimalSchema, enteredIn: unitSchema })),
    customers: z.array(
      z.strictObject({
        customer: businessIdSchema,
        deliveryDays: z.array(weekdaySchema).min(1),
        leadWorkingDays: countSchema,
        wholePacks: z.boolean(),
        trend: z.union([
          z.strictObject({ quarterlyGrowth: rateSchema, shares: z.record(businessIdSchema, positiveDecimalSchema) }),
          z.strictObject({ remainderWeights: z.record(businessIdSchema, positiveDecimalSchema) }),
        ]),
      }),
    ),
    projects: z.array(z.strictObject({ customer: businessIdSchema, material: businessIdSchema, date: dayOfYearSchema, days: countSchema })),
  }),
  supply: z.strictObject({
    planningWeekday: weekdaySchema,
    partialShipmentEvery: countSchema,
    varianceEvery: countSchema,
    underConsumptionEvery: countSchema,
    overConsumption: decimalSchema,
    underConsumption: decimalSchema,
    safetyStock: z.strictObject({
      finishedDays: wholeSchema,
      intermediateDays: wholeSchema,
      rawLeadTimeFactor: decimalSchema,
      laterIncreases: z.array(
        z.strictObject({ material: businessIdSchema, location: businessIdSchema, monthsAfterAnchor: wholeSchema, factor: positiveDecimalSchema }),
      ),
    }),
    waste: z.strictObject({
      monthsBeforeAnchor: countSchema,
      orders: z.array(z.strictObject({ location: businessIdSchema, output: businessIdSchema, sheet: businessIdSchema })),
    }),
    requisitions: z.strictObject({
      open: z.array(lineSchema.extend({ location: businessIdSchema })),
      converted: z.array(z.strictObject({ material: businessIdSchema, location: businessIdSchema })),
    }),
    topUps: z.array(z.strictObject({ location: businessIdSchema, material: businessIdSchema })),
  }),
  catalogue: z.strictObject({
    locations: z.array(nameSchema),
    customers: z.array(nameSchema),
    suppliers: z.array(nameSchema),
    materials: z.array(materialSchema),
    boms: z.array(z.strictObject({ output: businessIdSchema, priority: countSchema, components: z.array(lineSchema).min(1) })),
    production: z.array(
      z.strictObject({
        material: businessIdSchema,
        location: businessIdSchema,
        leadTimeDays: z.number().int().nonnegative(),
        minimumQuantity: positiveDecimalSchema,
        lotMultiple: positiveDecimalSchema,
      }),
    ),
  }),
});

/** The parsed configuration. Materials, locations, customers and suppliers are referenced by business ID, their index + 1. */
export type TestTenantConfig = z.infer<typeof configSchema>;
export type CatalogueMaterial = TestTenantConfig["catalogue"]["materials"][number];
export type CatalogueBom = TestTenantConfig["catalogue"]["boms"][number];
export type DemandCustomer = TestTenantConfig["demand"]["customers"][number];

/** The catalogue entry a business ID names: IDs are the entry's index + 1 (R01). */
export function byId<T>(entries: readonly T[], id: string): T | undefined {
  return entries[Number(id) - 1];
}

/** The business IDs of a catalogue list, in order. */
export function idsOf(entries: readonly unknown[]): string[] {
  return entries.map((_, index) => formatSequentialId(index + 1));
}

/** The finished products, in ID order: the SKUs customers buy. */
export function finishedProducts(config: TestTenantConfig): string[] {
  return idsOf(config.catalogue.materials).filter((id) => byId(config.catalogue.materials, id)!.type === "finished");
}

/** The SKUs a customer buys: the ones it has a share or a remainder weight of. */
export function productsBoughtBy({ trend }: DemandCustomer): string[] {
  return Object.keys("shares" in trend ? trend.shares : trend.remainderWeights);
}

/** The units a material may be entered in: its base unit and every conversion's unit but the report-only SU (#239). */
export function unitsOf(material: CatalogueMaterial): string[] {
  return [material.baseUnit, ...material.conversions.map(({ unit }) => unit).filter((unit) => !isStatisticalUnit(unit))];
}

type Issue = (path: (string | number)[], message: string) => void;

/** Every catalogue list has exactly the length the shape states. */
function checkCatalogueSizes(config: TestTenantConfig, issue: Issue): void {
  const { shape, catalogue } = config;
  for (const kind of ["locations", "customers", "suppliers"] as const) {
    if (catalogue[kind].length !== shape[kind]) issue(["catalogue", kind], `The shape says ${shape[kind]} ${kind}; the catalogue lists ${catalogue[kind].length}.`);
  }
}

/** The catalogue's materials have the shape's counts per type, and the demand lists the shape's furniture types. */
function checkMaterialCounts(config: TestTenantConfig, issue: Issue): void {
  const { shape, catalogue } = config;
  const counts = {
    rawMaterials: catalogue.materials.filter(({ type }) => type === "raw").length,
    intermediates: catalogue.materials.filter(({ type }) => type === "intermediate").length,
    types: config.demand.types.length,
    skus: finishedProducts(config).length,
  };
  const expected = { rawMaterials: shape.rawMaterials, intermediates: shape.intermediates, ...shape.finishedProducts };
  for (const kind of Object.keys(counts) as (keyof typeof counts)[]) {
    if (counts[kind] !== expected[kind]) issue(["catalogue", "materials"], `The shape says ${expected[kind]} ${kind}; the catalogue has ${counts[kind]}.`);
  }
}

/** Every business ID the file mentions names a record of its kind in the catalogue. */
function checkReferences(config: TestTenantConfig, issue: Issue): void {
  const { catalogue, demand, supply, shape } = config;
  const lists = { material: catalogue.materials, location: catalogue.locations, customer: catalogue.customers, supplier: catalogue.suppliers };
  const refer = (kind: keyof typeof lists, id: string, path: (string | number)[]) => {
    if (byId<unknown>(lists[kind], id) === undefined) issue(path, `There is no ${kind} ${id} in the catalogue.`);
  };
  refer("material", shape.alternateBoms.product, ["shape", "alternateBoms", "product"]);
  catalogue.materials.forEach(({ buy }, index) => {
    if (buy) refer("supplier", buy.supplier, ["catalogue", "materials", index, "buy", "supplier"]);
  });
  catalogue.boms.forEach(({ output, components }, index) => {
    refer("material", output, ["catalogue", "boms", index, "output"]);
    components.forEach(({ material }, at) => refer("material", material, ["catalogue", "boms", index, "components", at, "material"]));
  });
  const pairs = [
    ...catalogue.production.map((pair, index) => ({ ...pair, path: ["catalogue", "production", index] })),
    ...supply.safetyStock.laterIncreases.map((pair, index) => ({ ...pair, path: ["supply", "safetyStock", "laterIncreases", index] })),
    ...supply.waste.orders.map((order, index) => ({ material: order.output, location: order.location, path: ["supply", "waste", "orders", index] })),
    ...supply.requisitions.open.map((pair, index) => ({ ...pair, path: ["supply", "requisitions", "open", index] })),
    ...supply.requisitions.converted.map((pair, index) => ({ ...pair, path: ["supply", "requisitions", "converted", index] })),
    ...supply.topUps.map((pair, index) => ({ ...pair, path: ["supply", "topUps", index] })),
  ];
  for (const { material, location, path } of pairs) {
    refer("material", material, [...path, "material"]);
    refer("location", location, [...path, "location"]);
  }
  demand.products.forEach(({ material }, index) => refer("material", material, ["demand", "products", index, "material"]));
  demand.customers.forEach((entry, index) => {
    refer("customer", entry.customer, ["demand", "customers", index, "customer"]);
    for (const product of productsBoughtBy(entry)) refer("material", product, ["demand", "customers", index, "trend", product]);
  });
  demand.projects.forEach(({ customer, material }, index) => {
    refer("customer", customer, ["demand", "projects", index, "customer"]);
    refer("material", material, ["demand", "projects", index, "material"]);
  });
}

/** Recipes follow the type rules (R02): intermediate or finished outputs, raw or intermediate components, in units the component has. */
function checkRecipes(config: TestTenantConfig, issue: Issue): void {
  const { materials, boms } = config.catalogue;
  boms.forEach(({ output, components }, index) => {
    if (!canBeBomOutput(byId(materials, output)!.type)) issue(["catalogue", "boms", index, "output"], `Material ${output} is raw: it can't be a BOM's output.`);
    components.forEach(({ material, unit }, at) => {
      const component = byId(materials, material)!;
      const path = ["catalogue", "boms", index, "components", at];
      if (!canBeBomComponent(component.type)) issue([...path, "material"], `Material ${material} is finished: it can't be a component.`);
      if (!unitsOf(component).includes(unit)) issue([...path, "unit"], `Material ${material} has no unit ${unit}.`);
    });
  });
}

/** No recipe uses its own output, directly or through other recipes (R04). */
function checkNoCycles(config: TestTenantConfig, issue: Issue): void {
  const { boms } = config.catalogue;
  const edges: RecipeEdge[] = boms.flatMap(({ output, components }, index) =>
    components.map(({ material }) => ({ bom: formatSequentialId(index + 1), output, component: material })),
  );
  boms.forEach(({ output, components }, index) => {
    const cycle = findCycle(edges, { bom: formatSequentialId(index + 1), output, components: components.map(({ material }) => material) });
    if (cycle) issue(["catalogue", "boms", index], `BOM ${index + 1} closes a cycle through ${cycle.map(({ to }) => to).join(" → ")}.`);
  });
}

/**
 * One BOM, at priority 1, per made material, except the shape's alternate-BOM product: a finished
 * product with exactly `count` BOMs at priorities 1…count (spec Q6, single-site spec Q13).
 */
function checkBomCounts(config: TestTenantConfig, issue: Issue): void {
  const { shape, catalogue } = config;
  const { product, count } = shape.alternateBoms;
  const made = new Set([...catalogue.production.map(({ material }) => material), ...catalogue.boms.map(({ output }) => output)]);
  for (const material of made) {
    const priorities = catalogue.boms.filter(({ output }) => output === material).map(({ priority }) => priority);
    const expected = material === product ? Array.from({ length: count }, (_, index) => index + 1) : [1];
    if (priorities.join() !== expected.join()) {
      issue(["catalogue", "boms"], `Material ${material} needs BOMs at priorities ${expected.join(", ")}; the catalogue has ${priorities.join(", ") || "none"}.`);
    }
  }
  if (byId(catalogue.materials, product)!.type !== "finished") issue(["shape", "alternateBoms", "product"], `Material ${product} is not a finished product.`);
}

/** Made pairs are intermediate or finished, once each; every finished product is made at exactly one plant (spec Q7). */
function checkProduction(config: TestTenantConfig, issue: Issue): void {
  const { materials, production } = config.catalogue;
  const seen = new Set<string>();
  production.forEach(({ material, location }, index) => {
    if (byId(materials, material)!.type === "raw") issue(["catalogue", "production", index, "material"], `Material ${material} is raw: it is bought, never made.`);
    const pair = `${material}@${location}`;
    if (seen.has(pair)) issue(["catalogue", "production", index], `Material ${material} is made at location ${location} twice.`);
    seen.add(pair);
  });
  idsOf(materials)
    .filter((id) => byId(materials, id)!.type === "finished")
    .forEach((id) => {
      const plants = production.filter(({ material }) => material === id).length;
      if (plants !== 1) issue(["catalogue", "production"], `Finished material ${id} must be made at exactly one plant; it is made at ${plants}.`);
    });
}

/** Raw materials, and only they, are bought, each from exactly one supplier (spec Q4). */
function checkBuying(config: TestTenantConfig, issue: Issue): void {
  config.catalogue.materials.forEach(({ type, buy }, index) => {
    if (type === "raw" && !buy) issue(["catalogue", "materials", index, "buy"], `Raw material ${formatSequentialId(index + 1)} needs buy parameters and a supplier.`);
    if (type !== "raw" && buy) issue(["catalogue", "materials", index, "buy"], `Only a raw material is bought; ${formatSequentialId(index + 1)} is ${type}.`);
  });
}

/**
 * Every finished product has one demand entry, of a type that exists and in a unit it has; every type
 * has a profile that exists, and the colour mixes of its SKUs sum to exactly 1.
 */
function checkDemand(config: TestTenantConfig, issue: Issue): void {
  const { demand, catalogue } = config;
  finishedProducts(config).forEach((id) => {
    const entries = demand.products.filter(({ material }) => material === id).length;
    if (entries !== 1) issue(["demand", "products"], `Finished material ${id} needs exactly one demand entry; it has ${entries}.`);
  });
  const mixes = new Map<string, bigint>(demand.types.map(({ name }) => [name, 0n]));
  demand.types.forEach(({ profile }, index) => {
    if (!(profile in demand.seasonality)) issue(["demand", "types", index, "profile"], `There is no seasonality profile ${profile}.`);
  });
  demand.products.forEach(({ material, type, mix, enteredIn }, index) => {
    const product = byId(catalogue.materials, material)!;
    const path = ["demand", "products", index];
    if (product.type !== "finished") issue([...path, "material"], `Material ${material} is not a finished product.`);
    if (!unitsOf(product).includes(enteredIn)) issue([...path, "enteredIn"], `Material ${material} has no unit ${enteredIn}.`);
    const sum = mixes.get(type);
    if (sum === undefined) issue([...path, "type"], `There is no furniture type ${type}.`);
    else mixes.set(type, sum + parseDecimal(mix)!);
  });
  for (const [type, sum] of mixes) {
    if (sum !== ONE) issue(["demand", "types"], `The colour mixes of ${type} must sum to 1.`);
  }
}

/**
 * The customers (spec "Customers"): exactly one buys every SKU; every SKU has at least one remainder
 * customer, whose weights for it sum to exactly 1; delivery days are distinct; and the trending
 * customers leave the remainder customers at least `REMAINDER_FLOOR` of every SKU from the history
 * start to the end of the forecast horizon. Shares move exponentially, so the remainder is concave in
 * time and least at one of the two ends.
 */
function checkCustomers(config: TestTenantConfig, issue: Issue): void {
  const { demand, horizon } = config;
  const skus = finishedProducts(config);
  const everything = demand.customers.filter((entry) => skus.every((sku) => productsBoughtBy(entry).includes(sku)));
  if (everything.length !== 1) issue(["demand", "customers"], `Exactly one customer must buy every SKU; ${everything.length} do.`);
  demand.customers.forEach(({ deliveryDays }, index) => {
    if (new Set(deliveryDays).size !== deliveryDays.length) issue(["demand", "customers", index, "deliveryDays"], "A delivery day is listed twice.");
  });
  const weights = new Map<string, bigint>(skus.map((sku) => [sku, 0n]));
  demand.customers.forEach(({ trend }, index) => {
    const listed = "shares" in trend ? trend.shares : trend.remainderWeights;
    for (const product of Object.keys(listed)) {
      const sum = weights.get(product);
      if (sum === undefined) issue(["demand", "customers", index, "trend", product], `Material ${product} is not a finished product.`);
      else if (!("shares" in trend)) weights.set(product, sum + parseDecimal(trend.remainderWeights[product])!);
    }
  });
  const horizonQuarters = (horizon.historyMonths + 1 + horizon.forecastMonths) / 3;
  for (const [sku, sum] of weights) {
    if (sum !== ONE) issue(["demand", "customers"], `The remainder customers' weights for ${sku} must sum to 1.`);
    const least = Math.min(remainderShare(demand, sku, 0), remainderShare(demand, sku, horizonQuarters));
    if (least < REMAINDER_FLOOR) issue(["demand", "customers"], `The remainder customers keep ${least.toFixed(3)} of ${sku}; they need at least ${REMAINDER_FLOOR}.`);
  }
}

/** The most weekdays from one of a customer's delivery days to its next: a week less the span of its delivery days. */
function longestDeliveryGap(deliveryDays: readonly number[]): number {
  const days = [...deliveryDays].sort((a, b) => a - b);
  return Math.max(...days.map((day, index) => (days[index + 1] ?? days[0] + WEEKDAYS) - day));
}

/**
 * Every order created in a month fits the demand the generator plans past it: a customer's lead time
 * plus its longest delivery gap, and a project's lead time plus its days, are at most
 * `DEMAND_WEEKDAYS_PAST_MONTH` weekdays. Past that an open order would be missing until the next month.
 */
function checkHorizon(config: TestTenantConfig, issue: Issue): void {
  const { customers, projects } = config.demand;
  const reach = (weekdays: number, path: (string | number)[], what: string) => {
    if (weekdays > DEMAND_WEEKDAYS_PAST_MONTH) issue(path, `${what} reaches ${weekdays} weekdays past the month; the demand runs ${DEMAND_WEEKDAYS_PAST_MONTH}.`);
  };
  customers.forEach(({ customer, deliveryDays, leadWorkingDays }, index) =>
    reach(leadWorkingDays + longestDeliveryGap(deliveryDays), ["demand", "customers", index], `Customer ${customer}'s lead time and delivery gap`),
  );
  projects.forEach(({ customer, days }, index) => {
    const entry = customers.find((candidate) => candidate.customer === customer);
    if (entry) reach(entry.leadWorkingDays + days, ["demand", "projects", index], `Project ${index + 1}'s lead time and days`);
  });
}

/** A project is for a SKU its customer buys. */
function checkProjects(config: TestTenantConfig, issue: Issue): void {
  const { customers, projects } = config.demand;
  projects.forEach(({ customer, material }, index) => {
    const buyer = customers.find((entry) => entry.customer === customer);
    if (!buyer || !productsBoughtBy(buyer).includes(material)) issue(["demand", "projects", index], `Customer ${customer} doesn't buy ${material}.`);
  });
}

/** Each waste order names a made pair whose priority-1 recipe uses the sheet it wastes. */
function checkWaste(config: TestTenantConfig, issue: Issue): void {
  const { production, boms } = config.catalogue;
  config.supply.waste.orders.forEach(({ location, output, sheet }, index) => {
    const path = ["supply", "waste", "orders", index];
    if (!production.some((pair) => pair.material === output && pair.location === location)) issue(path, `Material ${output} is not made at location ${location}.`);
    const recipe = boms.find((bom) => bom.output === output && bom.priority === 1);
    if (!recipe?.components.some(({ material }) => material === sheet)) issue([...path, "sheet"], `Material ${output}'s priority-1 BOM doesn't use ${sheet}.`);
  });
}

/** Requisitions and top-up orders are for raw materials, which the plant buys. */
function checkPurchaseRequests(config: TestTenantConfig, issue: Issue): void {
  const { supply, catalogue } = config;
  const lists = { open: supply.requisitions.open, converted: supply.requisitions.converted, topUps: supply.topUps };
  for (const [kind, requests] of Object.entries(lists)) {
    requests.forEach(({ material }, index) => {
      if (byId(catalogue.materials, material)!.type !== "raw") issue(["supply", kind, index, "material"], `Material ${material} is not a raw material.`);
    });
  }
}

/** The checks that read the records a reference names: they run once every reference resolves. */
const CROSS_CHECKS = [
  checkCatalogueSizes,
  checkMaterialCounts,
  checkRecipes,
  checkNoCycles,
  checkBomCounts,
  checkProduction,
  checkBuying,
  checkDemand,
  checkCustomers,
  checkProjects,
  checkHorizon,
  checkWaste,
  checkPurchaseRequests,
];

/** The configuration file's schema with its cross-checks (spec Q1). */
export const testTenantConfigSchema = configSchema.superRefine((config, ctx) => {
  let referencesResolve = true;
  checkReferences(config, (path, message) => {
    referencesResolve = false;
    ctx.addIssue({ code: "custom", path, message });
  });
  if (!referencesResolve) return;
  for (const check of CROSS_CHECKS) check(config, (path, message) => ctx.addIssue({ code: "custom", path, message }));
});

/** The committed configuration, parsed and checked when this module loads. */
export const TEST_TENANT_CONFIG: TestTenantConfig = testTenantConfigSchema.parse(rawConfig);
