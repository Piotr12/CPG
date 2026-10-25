import { CustomerOrderLine, Forecast, Location, Material, MaterialConversion, StockMovement, StockReversal, type EntityManager } from "@cpg/db";
import { addDays, addMonths, demandWindow, monthStart, type DemandBucket, type DemandBucketFrame } from "../../domain/demand/demand-buckets";
import { DEMAND_FIGURES, tallyDemand, zeroFigures, type DemandCell, type DemandFigures, type DemandOrderLine, type IssuedLine } from "../../domain/demand/demand-tally";
import type { DemandForecast } from "../../domain/demand/forecast-netting";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";
import { parseSignedQuantity } from "../../domain/stock/signed-quantity";
import { fromBase, NO_STATISTICAL_FACTOR, reportFactor, reportUnits, resolveReportUnit, type ReportFactor, type ReportMaterial } from "../../domain/units/report-units";
import { ValidationError } from "../../http/errors";
import { parseInput } from "../../http/parse-input";
import { isStatisticalUnit } from "../../validators/units/unit-registry";
import { demandReviewQuerySchema, FINISHED_PRODUCTS_ONLY_MESSAGE } from "../../validators/reports/demand-review.schema";
import { GOODS_ISSUE_MOVEMENT } from "../goods-issues/goods-issue.service";
import { namedRecordNotFound } from "../named-records/find-named-record";
import { LOCATION_LOOKUP } from "../locations/find-location";
import { materialNotFound } from "../materials/find-material";

/** How many materials, or locations, one `$in` list holds, as `movementReversals` batches its links. */
const IN_CHUNK = 100;

/** One bucket's figures in the report unit, as six-decimal texts. */
export type DemandFiguresView = Record<keyof DemandFigures, string>;

/** Why a selected product has no row: it has no SU factor yet (#239). */
export interface DemandExclusion {
  material: string;
  code: typeof NO_STATISTICAL_FACTOR;
}

/** The demand review (#240), also the API body. Dates are ISO calendar dates, `window.to` exclusive. */
export interface DemandReviewView {
  today: string;
  bucket: DemandBucket;
  offset: number;
  window: { from: string; to: string };
  /** The unit the figures are in, and the units the selection offers. */
  unit: string;
  units: string[];
  /** With two or more products, the units they have that only one product at a time can be shown in. */
  disabledUnits: string[];
  /** The selection as asked (empty means all). */
  materials: string[];
  locations: string[];
  excluded: DemandExclusion[];
  buckets: DemandBucketFrame[];
  /** One per bucket. */
  total: DemandFiguresView[];
  /** Product rows by material ID, or location rows by location ID when exactly one product is chosen. */
  rows: { key: string; figures: DemandFiguresView[] }[];
  /** Candidate rows left out because they have no figure in the window. */
  omittedRows: number;
}

type Figures = DemandFigures[];

const chunks = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / IN_CHUNK) }, (_, index) => items.slice(index * IN_CHUNK, (index + 1) * IN_CHUNK));

const addFigures = (into: Figures, from: Figures) => {
  into.forEach((bucket, index) => {
    for (const figure of DEMAND_FIGURES) bucket[figure] += from[index][figure];
  });
};

const convert = (figures: Figures, factor: ReportFactor): Figures =>
  figures.map((bucket) => Object.fromEntries(DEMAND_FIGURES.map((figure) => [figure, fromBase(bucket[figure], factor)])) as unknown as DemandFigures);

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code);

const isEmpty = (figures: Figures) => figures.every((bucket) => DEMAND_FIGURES.every((figure) => bucket[figure] === 0n));

const view = (figures: Figures): DemandFiguresView[] =>
  figures.map((bucket) => Object.fromEntries(DEMAND_FIGURES.map((figure) => [figure, formatDecimal(bucket[figure], { fixed: true })])) as DemandFiguresView);

/**
 * What shipped and what is still to ship per day, week or month (#240): goods issued, open
 * customer-order lines and forecast not yet ordered (D08), per finished product or, for one product,
 * per location, in a report unit (#239). Read at request time and written nowhere.
 */
export class DemandReviewService {
  private readonly em: EntityManager;
  constructor({ em }: { em: EntityManager }) {
    this.em = em;
  }

  /**
   * `raw` is the query as sent (`demandReviewQuerySchema`). A product or location this tenant doesn't
   * have is `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND` (R05); a product that isn't finished is refused
   * on the `material` field.
   */
  async read(raw: Record<string, unknown>): Promise<DemandReviewView> {
    const query = parseInput(demandReviewQuerySchema, raw);
    const today = new Date().toISOString().slice(0, 10);
    const window = demandWindow(query.bucket, today, query.offset);
    const selected = await this.selectedProducts(query.material);
    const products = selected.length > 0 ? selected : await this.em.find(Material, { type: "finished" }, { orderBy: { code: "asc" } });
    const selectedLocations = await this.selectedLocations(query.location);
    const reportMaterials = await this.reportMaterials(products);
    const chosen = reportMaterials.filter(({ code }) => selected.some((material) => material.code === code));
    const unit = resolveReportUnit(query.unit, chosen);
    const factors = new Map<string, ReportFactor>();
    const excluded: DemandExclusion[] = [];
    for (const material of reportMaterials) {
      const factor = reportFactor(material, unit);
      if (factor) factors.set(material.code, factor);
      else excluded.push({ material: material.code, code: NO_STATISTICAL_FACTOR });
    }
    const included = products.filter(({ code }) => factors.has(code));
    const locations = selectedLocations ?? (await this.em.find(Location, {}, { orderBy: { code: "asc" } }));
    const cells = included.length === 0 ? [] : await this.cells(window, included, locations, selectedLocations !== undefined);
    // One product always has a factor for its unit: `resolveReportUnit` offers only units it converts to.
    const { rows, total, omittedRows } =
      selected.length === 1
        ? this.locationRows(cells, locations, factors.get(selected[0].code)!, window.buckets.length)
        : this.productRows(cells, included, factors, window.buckets.length);
    return {
      today,
      bucket: query.bucket,
      offset: query.offset,
      window: { from: window.from, to: window.to },
      unit,
      units: reportUnits(chosen).units,
      disabledUnits: selected.length === 1 ? [] : physicalUnits(reportMaterials),
      materials: query.material,
      locations: query.location,
      excluded,
      buckets: window.buckets,
      total: view(total),
      rows,
      omittedRows,
    };
  }

  /** The selected products, refusing an unknown one and one that isn't finished. */
  private async selectedProducts(codes: readonly string[]): Promise<Material[]> {
    const found = new Map<string, Material>();
    for (const chunk of chunks(codes)) for (const material of await this.em.find(Material, { code: { $in: chunk } })) found.set(material.code, material);
    return codes.map((code) => {
      const material = found.get(code);
      if (!material) throw materialNotFound(code);
      if (material.type !== "finished") throw new ValidationError({ material: [FINISHED_PRODUCTS_ONLY_MESSAGE] }, { material: code });
      return material;
    }).sort(byCode);
  }

  /** The selected locations, refusing an unknown one, or `undefined` for all of them. */
  private async selectedLocations(codes: readonly string[]): Promise<Location[] | undefined> {
    if (codes.length === 0) return undefined;
    const found = new Map<string, Location>();
    for (const chunk of chunks(codes)) for (const location of await this.em.find(Location, { code: { $in: chunk } })) found.set(location.code, location);
    return codes.map((code) => {
      const location = found.get(code);
      if (!location) throw namedRecordNotFound(LOCATION_LOOKUP, code);
      return location;
    }).sort(byCode);
  }

  /** The products with their conversions, as the report-unit helpers read them. */
  private async reportMaterials(products: readonly Material[]): Promise<ReportMaterial[]> {
    const conversions = new Map<string, ReportMaterial["conversions"]>(products.map(({ id }) => [id, []]));
    for (const chunk of chunks(products)) {
      for (const conversion of await this.em.find(MaterialConversion, { material: { $in: chunk } }, { orderBy: { unit: "asc" } })) {
        conversions.get(conversion.material.id)!.push({ unit: conversion.unit, numerator: conversion.numerator, denominator: conversion.denominator });
      }
    }
    return products.map(({ id, code, baseUnit }) => ({ code, baseUnit, conversions: conversions.get(id)! }));
  }

  /** The base figures of `products` at `locations` (all of them unless `filtered`), read for the window only. */
  private async cells(window: ReturnType<typeof demandWindow>, products: readonly Material[], locations: readonly Location[], filtered: boolean): Promise<DemandCell[]> {
    const { today } = window;
    const materialCode = new Map(products.map(({ id, code }) => [id, code]));
    const locationCode = new Map(locations.map(({ id, code }) => [id, code]));
    // Forecasts count from today's month on (earlier ones expired), and only from the window's first month:
    // an earlier month's residual lands before the window. Orders are read from the window's start, or that
    // month if earlier, to the end of the window's last month, so every read forecast sees its whole month.
    const forecastsFrom = monthStart(today) > monthStart(window.from) ? monthStart(today) : monthStart(window.from);
    const ordersFrom = window.from < forecastsFrom ? window.from : forecastsFrom;
    const ordersBefore = addMonths(addDays(window.to, -1), 1);
    const issued: IssuedLine[] = [];
    const orderLines: DemandOrderLine[] = [];
    const forecasts: DemandForecast[] = [];
    const reversed = await this.reversedIssues(window);
    // Partial loads throughout: a window holds thousands of rows, and hydrating whole entities costs more than reading them.
    for (const productChunk of chunks(products)) {
      for (const locationChunk of filtered ? chunks(locations) : [undefined]) {
        const at = locationChunk && { location: { $in: locationChunk } };
        // Shipped from the ledger: each goods-issue line posted one movement of its base quantity, out of
        // its order's location (SAL-004), on the issue's business date (INV-010), so nothing joins back to the documents.
        const movements = await this.em.find(
          StockMovement,
          { type: GOODS_ISSUE_MOVEMENT, businessDate: { $gte: window.from, $lt: window.to }, material: { $in: productChunk }, ...at },
          { fields: ["material", "location", "businessDate", "quantity"], disableIdentityMap: true },
        );
        for (const { id, material, location, businessDate, quantity } of movements) {
          issued.push({
            material: materialCode.get(material.id)!,
            location: locationCode.get(location.id)!,
            businessDate,
            quantity: -parseSignedQuantity(quantity)!,
            reversed: reversed.has(id),
          });
        }
        const lines = await this.em.find(
          CustomerOrderLine,
          {
            removed: false,
            material: { $in: productChunk },
            ...(at && { order: at }),
            $or: [{ requiredDate: { $gte: ordersFrom, $lt: ordersBefore } }, { status: "open", requiredDate: { $lt: today } }],
          },
          { populate: ["order"], fields: ["requiredDate", "quantity", "fulfilled", "abandoned", "status", "material", "order.location"], disableIdentityMap: true },
        );
        for (const line of lines) {
          const { requiredDate, quantity, fulfilled, abandoned, status } = line;
          orderLines.push({ material: materialCode.get(line.material.id)!, location: locationCode.get(line.order.location.id)!, requiredDate, quantity, fulfilled, abandoned, status });
        }
        const read = await this.em.find(
          Forecast,
          { material: { $in: productChunk }, ...at, date: { $gte: forecastsFrom, $lt: window.to } },
          { fields: ["material", "location", "date", "quantity"], disableIdentityMap: true },
        );
        for (const forecast of read) {
          forecasts.push({ material: materialCode.get(forecast.material.id)!, location: locationCode.get(forecast.location.id)!, date: forecast.date, quantity: parseDecimal(forecast.quantity)! });
        }
      }
    }
    return tallyDemand(window, { issued, orderLines, forecasts });
  }

  /**
   * The goods-issue movements of the window that were reversed, by ID. A reversal always takes the whole
   * movement, and reversals are few, so this reads only the reversed ones.
   */
  private async reversedIssues(window: ReturnType<typeof demandWindow>): Promise<Set<string>> {
    const links = await this.em.find(
      StockReversal,
      { original: { type: GOODS_ISSUE_MOVEMENT, businessDate: { $gte: window.from, $lt: window.to } } },
      { fields: ["original"], disableIdentityMap: true },
    );
    return new Set(links.map(({ original }) => original.id));
  }

  /** One row per product, each converted with its own factor; the total adds the converted rows. */
  private productRows(cells: readonly DemandCell[], products: readonly Material[], factors: ReadonlyMap<string, ReportFactor>, buckets: number) {
    const total: Figures = Array.from({ length: buckets }, zeroFigures);
    const rows: DemandReviewView["rows"] = [];
    let omittedRows = 0;
    for (const { code } of products) {
      const base: Figures = Array.from({ length: buckets }, zeroFigures);
      for (const cell of cells) if (cell.material === code) addFigures(base, cell.figures);
      if (isEmpty(base)) {
        omittedRows += 1;
        continue;
      }
      const converted = convert(base, factors.get(code)!);
      addFigures(total, converted);
      rows.push({ key: code, figures: view(converted) });
    }
    return { rows, total, omittedRows };
  }

  /** One row per location for the one product; each cell and the total convert their summed base figure once. */
  private locationRows(cells: readonly DemandCell[], locations: readonly Location[], factor: ReportFactor, buckets: number) {
    const sum = (code?: string) => {
      const base: Figures = Array.from({ length: buckets }, zeroFigures);
      for (const cell of cells) if (code === undefined || cell.location === code) addFigures(base, cell.figures);
      return base;
    };
    const total = convert(sum(), factor);
    const rows: DemandReviewView["rows"] = [];
    let omittedRows = 0;
    for (const { code } of locations) {
      const base = sum(code);
      if (isEmpty(base)) {
        omittedRows += 1;
        continue;
      }
      rows.push({ key: code, figures: view(convert(base, factor)) });
    }
    return { rows, total, omittedRows };
  }
}

/** The base and non-SU conversion units of `materials`, once each, in alphabetical order. */
function physicalUnits(materials: readonly ReportMaterial[]): string[] {
  const units = new Set<string>();
  for (const { baseUnit, conversions } of materials) {
    units.add(baseUnit);
    for (const { unit } of conversions) units.add(unit);
  }
  return [...units].filter((unit) => !isStatisticalUnit(unit)).sort();
}
