import {
  OptimisticLockError,
  SafetyStockTarget,
  UniqueConstraintViolationException,
  type EntityManager,
  type FilterQuery,
} from "@cpg/db";
import type { DemoSafetyStockTarget } from "../../domain/demo/generate-dataset";
import { searchWhere } from "../../domain/lists/list-query";
import { sortTargets } from "../../domain/safety-stock/target-order";
import { ConflictError, NotFoundError, versionConflict } from "../../http/errors";
import type { ListOptions } from "../../validators/lists/list-query.schema";
import type { SafetyStockSort } from "../../validators/safety-stock/safety-stock-list.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit, type AuditEntry } from "../audit/audit-recorder";
import { findActiveLocation, findLocation } from "../locations/find-location";
import { findActiveMaterial, findMaterial } from "../materials/find-material";
import { isScopeReadOnly } from "../tenants/tenant.service";

/**
 * One safety-stock target, as the screens and the API show it: material and location business IDs,
 * the ISO date it applies from, and a six-decimal base-unit quantity (R03).
 */
export interface SafetyStockTargetView {
  material: string;
  location: string;
  effectiveFrom: string;
  quantity: string;
  /** The optimistic-lock version an edit must carry back (AUD-024, API-029). */
  version: number;
}

export interface NewSafetyStockTarget {
  material: string;
  location: string;
  effectiveFrom: string;
  quantity: string;
}

/** A target's key: its material, location and effective date (DEM-017). */
export interface SafetyStockTargetKey {
  material: string;
  location: string;
  effectiveFrom: string;
}

/** What the safety stock search matches: the material's ID and description, the location's ID and name (#217). */
const SEARCH_FIELDS = ["material.code", "material.description", "location.code", "location.name"];

/** The safety stock list's search and sort; `today` (`YYYY-MM-DD`, UTC by default) is the day the status sort is about. */
export type SafetyStockListOptions = Omit<ListOptions<SafetyStockSort>, "page"> & { today?: string };

interface Deps {
  em: EntityManager;
}

/**
 * The tenant's safety-stock targets (E03-S03): per material and location, a quantity that applies
 * from its date until the next target, zero with none (DEM-014…016, `domain/safety-stock`). At most
 * one per date (DEM-017). Resolved from a tenant scope (R05); callers check the admin with
 * `assertAdmin`. A new target can't reference an inactive material or location (MAT-029, LFC-019).
 * Every change records its tenant audit entry in the same transaction (R08), and a change or
 * removal carries the version the caller loaded.
 */
export class SafetyStockTargetService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /**
   * Every target of the tenant, by material ID, location ID, then date, unless `sort` says otherwise;
   * `q` keeps those whose material's ID or description or location's ID or name contains every word
   * (#217), so a material and location's targets are kept or dropped together.
   */
  async list({ q = "", sort = "material", dir = "asc", today = new Date().toISOString().slice(0, 10) }: SafetyStockListOptions = {}): Promise<
    SafetyStockTargetView[]
  > {
    const where = searchWhere(q, SEARCH_FIELDS) as FilterQuery<SafetyStockTarget>;
    const targets = await this.em.find(SafetyStockTarget, where, { populate: ["material", "location"] });
    return sortTargets(targets.map(toView), sort, dir, today);
  }

  /** A target from a date that has none yet for this material and location (DEM-015, DEM-017). */
  async create(input: NewSafetyStockTarget, actor: AuditActor): Promise<SafetyStockTargetView> {
    try {
      return await this.em.transactional(async (em) => {
        const material = await findActiveMaterial(em, input.material);
        const location = await findActiveLocation(em, input.location);
        const { effectiveFrom, quantity } = input;
        if ((await em.count(SafetyStockTarget, { material, location, effectiveFrom })) > 0) throw targetExists(input);
        const target = em.create(SafetyStockTarget, { material, location, effectiveFrom, quantity });
        recordTenantAudit(em, actor, entry("created", target, null, snapshot(target)));
        await em.flush();
        return toView(target);
      });
    } catch (error) {
      // A racing create normally surfaces as a stale snapshot, which the request wrappers retry;
      // the unique index only catches what slips past that.
      if (error instanceof UniqueConstraintViolationException) throw targetExists(input);
      throw error;
    }
  }

  /** A new quantity at `version`; the same quantity is no change and records nothing. */
  async update(key: SafetyStockTargetKey, quantity: string, version: number, actor: AuditActor): Promise<SafetyStockTargetView> {
    return this.versioned(async (em) => {
      const target = await this.findTarget(em, key, version);
      if (target.quantity === quantity) return toView(target);
      const before = { quantity: target.quantity };
      target.quantity = quantity;
      recordTenantAudit(em, actor, entry("updated", target, before, { quantity }));
      await em.flush();
      return toView(target);
    });
  }

  /** Removes a target at `version`; the one before it then applies until the next. */
  async remove(key: SafetyStockTargetKey, version: number, actor: AuditActor): Promise<SafetyStockTargetKey> {
    return this.versioned(async (em) => {
      const target = await this.findTarget(em, key, version);
      recordTenantAudit(em, actor, entry("removed", target, snapshot(target), null));
      em.remove(target);
      await em.flush();
      return { material: key.material, location: key.location, effectiveFrom: key.effectiveFrom };
    });
  }

  /**
   * Creates the generated dataset's targets `rows` when the tenant has none, and returns how many.
   * Seeds nothing into a read-only tenant (R05). A row whose material or location is missing or
   * inactive refuses the whole seed, as a save would. Not audited, like the other demo records.
   */
  async seedDemo(rows: readonly DemoSafetyStockTarget[]): Promise<number> {
    return this.em.transactional(async (em) => {
      if ((await em.count(SafetyStockTarget, {})) > 0 || (await isScopeReadOnly(em))) return 0;
      for (const { effectiveFrom, quantity, ...demo } of rows) {
        const material = await findActiveMaterial(em, demo.material);
        const location = await findActiveLocation(em, demo.location);
        em.create(SafetyStockTarget, { material, location, effectiveFrom, quantity });
      }
      await em.flush();
      return rows.length;
    });
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

  /** The target at `version`, compared with a fresh read; the material and location may be inactive. */
  private async findTarget(em: EntityManager, key: SafetyStockTargetKey, version: number): Promise<SafetyStockTarget> {
    const material = await findMaterial(em, key.material);
    const location = await findLocation(em, key.location);
    const target = await em.findOne(SafetyStockTarget, { material, location, effectiveFrom: key.effectiveFrom }, { refresh: true });
    if (!target) {
      throw new NotFoundError(
        "SAFETY_STOCK_TARGET_NOT_FOUND",
        `Material ${key.material} has no safety-stock target at location ${key.location} from ${key.effectiveFrom}.`,
      );
    }
    if (target.version !== version) throw versionConflict();
    return target;
  }
}

const targetExists = ({ material, location, effectiveFrom }: SafetyStockTargetKey) =>
  new ConflictError(
    `Material ${material} already has a safety-stock target at location ${location} from ${effectiveFrom}.`,
    "SAFETY_STOCK_TARGET_EXISTS",
  );

/** The fields of a target the audit may show: an allowlist (R08). */
function snapshot(target: SafetyStockTarget) {
  const { material, location, effectiveFrom, quantity } = target;
  return { material: material.code, location: location.code, effectiveFrom, quantity };
}

function entry(action: string, target: SafetyStockTarget, before: AuditEntry["before"], after: AuditEntry["after"]): AuditEntry {
  const { material, location, effectiveFrom } = target;
  return {
    action: `safety-stock.safety-stock-target.${action}`,
    subject: {
      type: "SafetyStockTarget",
      id: `${material.code}/${location.code}/${effectiveFrom}`,
      label: `${material.code} — ${material.description} at ${location.code} — ${location.name} from ${effectiveFrom}`,
    },
    before,
    after,
  };
}

function toView(target: SafetyStockTarget): SafetyStockTargetView {
  const { material, location, effectiveFrom, quantity, version } = target;
  return { material: material.code, location: location.code, effectiveFrom, quantity, version };
}
