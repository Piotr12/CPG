import { z } from "zod";
import { businessIdSchema } from "../../validators/business-ids/business-id.schema";
import { descriptionSchema, factorSchema, materialTypeSchema, unitSchema } from "../../validators/materials/material-fields.schema";
import { isStatisticalUnit } from "../../validators/units/unit-registry";
import { findCycle, type RecipeEdge } from "../boms/find-cycle";
import { canBeBomComponent, canBeBomOutput } from "../boms/recipe-rules";
import { formatSequentialId } from "../business-ids/sequential-id";
import { ONE, parseDecimal } from "../quantities/decimal";
import rawConfig from "./test-tenant-config.json";

/*
 * The Test tenant's demonstration dataset is stated in one file, `test-tenant-config.json` (spec
 * `2026-10-21--0718UTC-test-tenant-dataset`, Q1): the shape the owner set (counts and horizons, every
 * period in months), the demand and supply parameters, the limits, and the catalogue that gives the
 * shape its names. This schema parses it and cross-checks the catalogue against the shape, so the
 * numbers stay the one statement of the shape and a catalogue that disagrees fails the unit tests.
 * Decimals are strings (R03); counts, days and months are whole JSON numbers.
 */

/** Months in a year: a seasonality profile has one multiplier per calendar month, January first. */
export const MONTHS_PER_YEAR = 12;

const DECIMAL_MESSAGE = "Use a decimal string of at least 0 with at most 12 digits before the point and 6 after it.";
const POSITIVE_DECIMAL_MESSAGE = "Use a decimal string greater than 0.";

const decimalSchema = z.string().refine((text) => parseDecimal(text) !== null, DECIMAL_MESSAGE);
const positiveDecimalSchema = z.string().refine((text) => (parseDecimal(text) ?? 0n) > 0n, POSITIVE_DECIMAL_MESSAGE);
const countSchema = z.number().int().positive();
const monthsSchema = z.number().int().nonnegative();
const nameSchema = descriptionSchema;

const buySchema = z.strictObject({
  leadTimeDays: z.number().int().nonnegative(),
  minimumQuantity: positiveDecimalSchema,
  lotMultiple: positiveDecimalSchema,
  suppliers: z.array(businessIdSchema).min(1),
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
    finishedProducts: z.strictObject({ simple: countSchema, composed: countSchema }),
    alternateBoms: z.strictObject({ product: businessIdSchema, count: countSchema }),
  }),
  limits: z.strictObject({ documents: countSchema, movements: countSchema }),
  demand: z.strictObject({
    growthPerYear: decimalSchema,
    noise: decimalSchema,
    seasonality: z.record(z.string(), z.array(positiveDecimalSchema).length(MONTHS_PER_YEAR)),
    products: z.array(
      z.strictObject({ material: businessIdSchema, monthlyBase: positiveDecimalSchema, profile: z.string(), enteredIn: unitSchema }),
    ),
    customers: z.array(
      z.strictObject({
        customer: businessIdSchema,
        wholePacks: z.boolean(),
        shares: z.record(businessIdSchema, positiveDecimalSchema),
      }),
    ),
  }),
  supply: z.strictObject({
    partialShipmentEvery: countSchema,
    varianceEvery: countSchema,
    underConsumptionEvery: countSchema,
    overConsumption: decimalSchema,
    underConsumption: decimalSchema,
    safetyStock: z.strictObject({
      finishedMonths: decimalSchema,
      intermediateMonths: decimalSchema,
      rawLeadTimeFactor: decimalSchema,
      laterIncreases: z.array(
        z.strictObject({ material: businessIdSchema, location: businessIdSchema, monthsAfterAnchor: monthsSchema, factor: positiveDecimalSchema }),
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
    purchasedIntermediates: z.array(z.strictObject({ material: businessIdSchema, location: businessIdSchema, buy: buySchema })),
  }),
});

/** The parsed configuration. Materials, locations, customers and suppliers are referenced by business ID, their index + 1. */
export type TestTenantConfig = z.infer<typeof configSchema>;
export type CatalogueMaterial = TestTenantConfig["catalogue"]["materials"][number];
export type CatalogueBom = TestTenantConfig["catalogue"]["boms"][number];
export type BuyParameters = z.infer<typeof buySchema>;

/** The catalogue entry a business ID names: IDs are the entry's index + 1 (R01). */
export function byId<T>(entries: readonly T[], id: string): T | undefined {
  return entries[Number(id) - 1];
}

/** The business IDs of a catalogue list, in order. */
export function idsOf(entries: readonly unknown[]): string[] {
  return entries.map((_, index) => formatSequentialId(index + 1));
}

/** Whether a finished material is simple: every recipe for it uses raw materials only. */
export function isSimpleProduct(config: TestTenantConfig, product: string): boolean {
  const { materials, boms } = config.catalogue;
  return boms
    .filter(({ output }) => output === product)
    .every(({ components }) => components.every(({ material }) => byId(materials, material)?.type === "raw"));
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

/** The catalogue's materials have the shape's counts per type, finished products split into simple and composed. */
function checkMaterialCounts(config: TestTenantConfig, issue: Issue): void {
  const { shape, catalogue } = config;
  const ids = idsOf(catalogue.materials);
  const finished = ids.filter((id) => byId(catalogue.materials, id)!.type === "finished");
  const simple = finished.filter((id) => isSimpleProduct(config, id)).length;
  const counts = {
    rawMaterials: catalogue.materials.filter(({ type }) => type === "raw").length,
    intermediates: catalogue.materials.filter(({ type }) => type === "intermediate").length,
    simple,
    composed: finished.length - simple,
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
  catalogue.materials.forEach(({ buy }, index) =>
    buy?.suppliers.forEach((supplier, at) => refer("supplier", supplier, ["catalogue", "materials", index, "buy", "suppliers", at])),
  );
  catalogue.boms.forEach(({ output, components }, index) => {
    refer("material", output, ["catalogue", "boms", index, "output"]);
    components.forEach(({ material }, at) => refer("material", material, ["catalogue", "boms", index, "components", at, "material"]));
  });
  const pairs = [
    ...catalogue.production.map((pair, index) => ({ ...pair, path: ["catalogue", "production", index] })),
    ...catalogue.purchasedIntermediates.map((pair, index) => ({ ...pair, path: ["catalogue", "purchasedIntermediates", index] })),
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
  catalogue.purchasedIntermediates.forEach(({ buy }, index) =>
    buy.suppliers.forEach((supplier, at) => refer("supplier", supplier, ["catalogue", "purchasedIntermediates", index, "buy", "suppliers", at])),
  );
  demand.products.forEach(({ material }, index) => refer("material", material, ["demand", "products", index, "material"]));
  demand.customers.forEach(({ customer }, index) => refer("customer", customer, ["demand", "customers", index, "customer"]));
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
 * One BOM, at priority 1, per made material, except the shape's alternate-BOM product: a simple
 * finished product with exactly `count` BOMs at priorities 1…count (spec Q6).
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
  if (byId(catalogue.materials, product)!.type !== "finished" || !isSimpleProduct(config, product)) {
    issue(["shape", "alternateBoms", "product"], `Material ${product} is not a simple finished product.`);
  }
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

/** Raw materials, and only they, carry buy parameters with a supplier; bought intermediates are intermediates. */
function checkBuying(config: TestTenantConfig, issue: Issue): void {
  const { materials, purchasedIntermediates } = config.catalogue;
  materials.forEach(({ type, buy }, index) => {
    if (type === "raw" && !buy) issue(["catalogue", "materials", index, "buy"], `Raw material ${formatSequentialId(index + 1)} needs buy parameters and a supplier.`);
    if (type !== "raw" && buy) issue(["catalogue", "materials", index, "buy"], `Only a raw material is bought everywhere; ${formatSequentialId(index + 1)} is ${type}.`);
  });
  purchasedIntermediates.forEach(({ material }, index) => {
    if (byId(materials, material)!.type !== "intermediate") issue(["catalogue", "purchasedIntermediates", index, "material"], `Material ${material} is not an intermediate.`);
  });
}

/**
 * Every finished product has one demand entry, in a profile that exists and a unit it has; the
 * customers' weights for each product sum to exactly 1.
 */
function checkDemand(config: TestTenantConfig, issue: Issue): void {
  const { demand, catalogue } = config;
  idsOf(catalogue.materials)
    .filter((id) => byId(catalogue.materials, id)!.type === "finished")
    .forEach((id) => {
      const entries = demand.products.filter(({ material }) => material === id).length;
      if (entries !== 1) issue(["demand", "products"], `Finished material ${id} needs exactly one demand entry; it has ${entries}.`);
    });
  demand.products.forEach(({ material, profile, enteredIn }, index) => {
    const product = byId(catalogue.materials, material)!;
    const path = ["demand", "products", index];
    if (product.type !== "finished") issue([...path, "material"], `Material ${material} is not a finished product.`);
    if (!(profile in demand.seasonality)) issue([...path, "profile"], `There is no seasonality profile ${profile}.`);
    if (!unitsOf(product).includes(enteredIn)) issue([...path, "enteredIn"], `Material ${material} has no unit ${enteredIn}.`);
  });
  const sums = new Map<string, bigint>(demand.products.map(({ material }) => [material, 0n]));
  demand.customers.forEach(({ shares }, index) => {
    for (const [product, weight] of Object.entries(shares)) {
      const sum = sums.get(product);
      if (sum === undefined) issue(["demand", "customers", index, "shares", product], `Material ${product} has no demand entry.`);
      else sums.set(product, sum + parseDecimal(weight)!);
    }
  });
  for (const [product, sum] of sums) {
    if (sum !== ONE) issue(["demand", "customers"], `The customers' weights for ${product} must sum to 1.`);
  }
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

/** Requisitions and top-up orders are for raw materials, which every plant buys. */
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
