import {
  Forecast,
  Location,
  Material,
  OptimisticLockError,
  UniqueConstraintViolationException,
  type EntityManager,
  type FilterQuery,
  type OrderDefinition,
} from "@cpg/db";
import type { DemoForecast } from "../../domain/demo/generate-dataset";
import { listOrderBy, searchWhere } from "../../domain/lists/list-query";
import { ConflictError, NotFoundError, ValidationError, versionConflict } from "../../http/errors";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit, type AuditEntry } from "../audit/audit-recorder";
import { findActiveLocation, findLocation } from "../locations/find-location";
import { convertToBaseQuantity } from "../materials/base-quantity";
import { conversionFieldError } from "../materials/conversion-field-error";
import { findActiveMaterial, findMaterial } from "../materials/find-material";
import { isScopeReadOnly } from "../tenants/tenant.service";
import type { ForecastSort } from "../../validators/forecasts/forecast-list.schema";
import type { ListOptions } from "../../validators/lists/list-query.schema";
import { DOCUMENT_PAGE_SIZE } from "../../validators/shipments/shipment.schema";

/**
 * One forecast, as the screens and the API show it: material and location business IDs, the ISO
 * date it is for, and a six-decimal base-unit quantity (R03). It names no customer (DEM-001).
 */
export interface ForecastView {
  material: string;
  location: string;
  date: string;
  quantity: string;
  /** The optimistic-lock version an edit must carry back (AUD-024, API-029). */
  version: number;
}

/** A quantity as entered: in `unit`, which is the material's base unit when left out. */
export interface EnteredQuantity {
  quantity: string;
  unit?: string;
}

export interface NewForecast extends EnteredQuantity {
  material: string;
  location: string;
  date: string;
}

/** A forecast's key: its material, location and original date (DEM-007). */
export interface ForecastKey {
  material: string;
  location: string;
  date: string;
}

/** Narrows the list to one material and/or one location, by business ID; an unknown ID matches nothing. */
export interface ForecastFilter {
  material?: string;
  location?: string;
}

interface Deps {
  em: EntityManager;
}

/** A filter's query: the material and/or location it narrows to. */
interface ForecastWhere {
  material?: Material;
  location?: Location;
}

/**
 * What the Forecasts search matches: the material's ID and description and the location's ID and
 * name (#217). Each sort key orders by a business ID or the date, then by the list's own key.
 */
const FORECAST_SEARCH_FIELDS = ["material.code", "material.description", "location.code", "location.name"];
const FORECAST_SORT_PATHS: Record<ForecastSort, string> = { material: "material.code", location: "location.code", date: "date" };

/** After the sorted column, a forecast's key in the default order: material ID, location ID, then date. */
const FORECAST_KEY_ORDER = [{ location: { code: "asc" } }, { date: "asc" }];

/**
 * The tenant's forecasts (E08-S03): the demand expected per material, location and day, with no
 * customer (DEM-001). At most one per day (DEM-007, D04), the input the slice 3 MRP run nets orders
 * against. Resolved from a tenant scope (R05); callers check the admin with `assertAdmin`. A new
 * forecast can't reference an inactive material or location (MAT-029, LFC-019), and its quantity is
 * converted into the material's base unit (MAT-019…024). Every change records its tenant audit entry
 * in the same transaction (R08); a removal's entry keeps what was removed (AUD-005). A change or
 * removal carries the version the caller loaded.
 */
export class ForecastService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /**
   * A page of the tenant's forecasts, `DOCUMENT_PAGE_SIZE` to a page, by material ID, location ID, then
   * date unless `sort` says otherwise (equal values keep that order, #217); `filter` and `q` narrow
   * them before paging, and a page past the last is empty.
   */
  async list(filter: ForecastFilter = {}, { page = 1, q = "", sort = "material", dir = "asc" }: ListOptions<ForecastSort> = {}): Promise<ForecastView[]> {
    const where = await this.where(filter, q);
    if (!where) return [];
    const forecasts = await this.em.find(Forecast, where, {
      populate: ["material", "location"],
      orderBy: [...listOrderBy(FORECAST_SORT_PATHS[sort], dir, "material.code"), ...FORECAST_KEY_ORDER] as OrderDefinition<Forecast>,
      limit: DOCUMENT_PAGE_SIZE,
      offset: (page - 1) * DOCUMENT_PAGE_SIZE,
    });
    return forecasts.map(toView);
  }

  /** How many forecasts `filter` and `q` match, for the pages of `list`. */
  async count(filter: ForecastFilter = {}, { q = "" }: Pick<ListOptions<ForecastSort>, "q"> = {}): Promise<number> {
    const where = await this.where(filter, q);
    return where ? this.em.count(Forecast, where) : 0;
  }

  /** A forecast for a day that has none yet for this material and location (DEM-001, DEM-007). */
  async create(input: NewForecast, actor: AuditActor): Promise<ForecastView> {
    try {
      return await this.em.transactional(async (em) => {
        const material = await findActiveMaterial(em, input.material);
        const location = await findActiveLocation(em, input.location);
        const { date } = input;
        if ((await em.count(Forecast, { material, location, date })) > 0) throw forecastExists(input);
        const quantity = await toBaseQuantity(em, material, input);
        const forecast = em.create(Forecast, { material, location, date, quantity });
        recordTenantAudit(em, actor, entry("created", forecast, null, snapshot(forecast)));
        await em.flush();
        return toView(forecast);
      });
    } catch (error) {
      // A racing create normally surfaces as a stale snapshot, which the request wrappers retry;
      // the unique index only catches what slips past that.
      if (error instanceof UniqueConstraintViolationException) throw forecastExists(input);
      throw error;
    }
  }

  /** A new quantity at `version`; the same quantity is no change and records nothing. */
  async update(key: ForecastKey, entered: EnteredQuantity, version: number, actor: AuditActor): Promise<ForecastView> {
    return this.versioned(async (em) => {
      const forecast = await this.findForecast(em, key, version);
      const quantity = await toBaseQuantity(em, forecast.material, entered);
      if (forecast.quantity === quantity) return toView(forecast);
      const before = { quantity: forecast.quantity };
      forecast.quantity = quantity;
      recordTenantAudit(em, actor, entry("updated", forecast, before, { quantity }));
      await em.flush();
      return toView(forecast);
    });
  }

  /** Removes a forecast at `version`; its audit entry is the tombstone, with what it held (AUD-005). */
  async remove(key: ForecastKey, version: number, actor: AuditActor): Promise<ForecastKey> {
    return this.versioned(async (em) => {
      const forecast = await this.findForecast(em, key, version);
      recordTenantAudit(em, actor, entry("removed", forecast, snapshot(forecast), null));
      em.remove(forecast);
      await em.flush();
      return { material: key.material, location: key.location, date: key.date };
    });
  }

  /**
   * Creates the generated dataset's forecasts `rows` when the tenant has none, and returns how many.
   * Seeds nothing into a read-only tenant (R05). A row whose material or location is missing or
   * inactive refuses the whole seed, as a save would. Not audited, like the other demo records.
   */
  async seedDemo(rows: readonly DemoForecast[]): Promise<number> {
    return this.em.transactional(async (em) => {
      if ((await em.count(Forecast, {})) > 0 || (await isScopeReadOnly(em))) return 0;
      for (const { date, quantity, ...demo } of rows) {
        const material = await findActiveMaterial(em, demo.material);
        const location = await findActiveLocation(em, demo.location);
        em.create(Forecast, { material, location, date, quantity });
      }
      await em.flush();
      return rows.length;
    });
  }

  /**
   * The query `filter` and the search `q` make, or null when the filter names a material or location
   * the tenant doesn't have: it matches nothing.
   */
  private async where(filter: ForecastFilter, q: string): Promise<FilterQuery<Forecast> | null> {
    const material = filter.material === undefined ? undefined : await this.em.findOne(Material, { code: filter.material });
    const location = filter.location === undefined ? undefined : await this.em.findOne(Location, { code: filter.location });
    if (material === null || location === null) return null;
    const narrowed: ForecastWhere = { ...(material && { material }), ...(location && { location }) };
    return { ...narrowed, ...searchWhere(q, FORECAST_SEARCH_FIELDS) } as FilterQuery<Forecast>;
  }

  /** Runs an edit in one transaction; a write landing before its flush is `VERSION_CONFLICT`. */
  private async versioned<T>(edit: (em: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.em.transactional(edit);
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }

  /** The forecast at `version`, compared with a fresh read; the material and location may be inactive. */
  private async findForecast(em: EntityManager, key: ForecastKey, version: number): Promise<Forecast> {
    const material = await findMaterial(em, key.material);
    const location = await findLocation(em, key.location);
    const forecast = await em.findOne(Forecast, { material, location, date: key.date }, { refresh: true });
    if (!forecast) {
      throw new NotFoundError(
        "FORECAST_NOT_FOUND",
        `Material ${key.material} has no forecast at location ${key.location} on ${key.date}.`,
      );
    }
    if (forecast.version !== version) throw versionConflict();
    return forecast;
  }
}

const forecastExists = ({ material, location, date }: ForecastKey) =>
  new ConflictError(
    `Material ${material} already has a forecast at location ${location} on ${date}.`,
    "FORECAST_EXISTS",
  );

/**
 * `entered` in the material's base unit, six decimals (R03). A unit without a conversion, or a
 * quantity that rounds to nothing or overflows, is a field error on `unit` or `quantity`.
 */
async function toBaseQuantity(em: EntityManager, material: Material, { quantity, unit }: EnteredQuantity): Promise<string> {
  try {
    return (await convertToBaseQuantity(em, material, { quantity, unit: unit ?? material.baseUnit })).baseQuantity;
  } catch (error) {
    const [field, message] = conversionFieldError(error);
    throw new ValidationError({ [field]: [message] });
  }
}

/** The fields of a forecast the audit may show: an allowlist (R08). */
function snapshot(forecast: Forecast) {
  const { material, location, date, quantity } = forecast;
  return { material: material.code, location: location.code, date, quantity };
}

function entry(action: string, forecast: Forecast, before: AuditEntry["before"], after: AuditEntry["after"]): AuditEntry {
  const { material, location, date } = forecast;
  return {
    action: `forecasts.forecast.${action}`,
    subject: {
      type: "Forecast",
      id: `${material.code}/${location.code}/${date}`,
      label: `${material.code} — ${material.description} at ${location.code} — ${location.name} on ${date}`,
    },
    before,
    after,
  };
}

function toView(forecast: Forecast): ForecastView {
  const { material, location, date, quantity, version } = forecast;
  return { material: material.code, location: location.code, date, quantity, version };
}
