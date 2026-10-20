import {
  OptimisticLockError,
  PlanningParameterSet,
  UniqueConstraintViolationException,
  type EntityManager,
  type Location,
  type Material,
  type ProcurementMode,
} from "@cpg/db";
import { DEMO_PLANNING_PARAMETERS } from "../../domain/planning-parameters/demo-planning-parameters";
import { isProcurementAllowed } from "../../domain/planning-parameters/procurement";
import { ConflictError, NotFoundError, ValidationError, versionConflict } from "../../http/errors";
import { RAW_MATERIAL_BUY_ONLY_MESSAGE } from "../../validators/planning-parameters/planning-parameter-fields.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit, type AuditEntry } from "../audit/audit-recorder";
import { activeDemoReferences, isUntouchedKind } from "../demo/demo-references";
import { findActiveLocation, findLocation } from "../locations/find-location";
import { findActiveMaterial, findMaterial } from "../materials/find-material";

/**
 * How one material is planned at one location, as the screens and the API show it. `material` and
 * `location` are business IDs; the quantities are six-decimal base-unit strings (R03).
 */
export interface PlanningParameterView {
  material: string;
  location: string;
  procurement: ProcurementMode;
  leadTimeDays: number;
  minimumQuantity: string;
  lotMultiple: string;
  /** The optimistic-lock version an edit must carry back (AUD-024, API-029). */
  version: number;
}

/** The four values of a set, as the validators normalize them. */
export interface PlanningParameterValues {
  procurement: ProcurementMode;
  leadTimeDays: number;
  minimumQuantity: string;
  lotMultiple: string;
}

export interface NewPlanningParameters extends PlanningParameterValues {
  material: string;
  location: string;
}

/** The values a change may set; absent ones stay as they are. */
export type PlanningParameterChanges = Partial<PlanningParameterValues>;

const VALUE_KEYS = ["procurement", "leadTimeDays", "minimumQuantity", "lotMultiple"] as const;

interface Deps {
  em: EntityManager;
}

/**
 * The tenant's planning parameters (E03-S03): per material and location, Make or Buy, a lead time
 * in whole calendar days, a minimum lot and a lot multiple. Resolved from a tenant scope, so every
 * read and write is that tenant's only (R05); callers check the admin with `assertAdmin`. A raw
 * material is never Make (R02, MAT-014). A new set can't reference an inactive material or location
 * (MAT-029, LFC-019), but existing sets stay editable. Every change records its tenant audit entry
 * in the same transaction (R08), and a change or removal carries the version the caller loaded.
 */
export class PlanningParameterService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /** Every set of the tenant, by material ID, then location ID. */
  async list(): Promise<PlanningParameterView[]> {
    const sets = await this.em.find(PlanningParameterSet, {}, { populate: ["material", "location"] });
    // Sorted here by business IDs: the populated material and location carry them, and an
    // `orderBy` on relation fields would add query joins the tenant lint rules don't vet.
    return sets.map(toView).sort((a, b) => a.material.localeCompare(b.material) || a.location.localeCompare(b.location));
  }

  /** A set for a material at a location that has none yet (MAT-015, MAT-016). */
  async create(input: NewPlanningParameters, actor: AuditActor): Promise<PlanningParameterView> {
    try {
      return await this.em.transactional(async (em) => {
        const material = await findActiveMaterial(em, input.material);
        const location = await findActiveLocation(em, input.location);
        assertProcurement(material, input.procurement);
        if ((await em.count(PlanningParameterSet, { material, location })) > 0) throw setExists(input.material, input.location);
        const set = em.create(PlanningParameterSet, { material, location, ...pickValues(input) });
        recordTenantAudit(em, actor, entry("created", set, null, snapshot(set)));
        await em.flush();
        return toView(set);
      });
    } catch (error) {
      // A racing create normally surfaces as a stale snapshot, which the request wrappers retry;
      // the unique index only catches what slips past that.
      if (error instanceof UniqueConstraintViolationException) throw setExists(input.material, input.location);
      throw error;
    }
  }

  /**
   * Applies the given values at `version`. A value counts only when it differs from the stored one;
   * with nothing changed, nothing is written or recorded. Make stays refused for a raw material.
   */
  async update(
    materialId: string,
    locationId: string,
    changes: PlanningParameterChanges,
    version: number,
    actor: AuditActor,
  ): Promise<PlanningParameterView> {
    return this.versioned(async (em) => {
      const set = await this.findSet(em, materialId, locationId, version);
      const changed = VALUE_KEYS.filter((key) => changes[key] !== undefined && changes[key] !== set[key]);
      if (changed.length === 0) return toView(set);
      if (changes.procurement !== undefined) assertProcurement(set.material, changes.procurement);
      const before = pickKeys(snapshot(set), changed);
      em.assign(set, Object.fromEntries(changed.map((key) => [key, changes[key]])));
      recordTenantAudit(em, actor, entry("updated", set, before, pickKeys(snapshot(set), changed)));
      await em.flush();
      return toView(set);
    });
  }

  /** Removes a set at `version`; MRP then reports this material's parameters missing here (MAT-017). */
  async remove(materialId: string, locationId: string, version: number, actor: AuditActor): Promise<{ material: string; location: string }> {
    return this.versioned(async (em) => {
      const set = await this.findSet(em, materialId, locationId, version);
      recordTenantAudit(em, actor, entry("removed", set, snapshot(set), null));
      em.remove(set);
      await em.flush();
      return { material: materialId, location: locationId };
    });
  }

  /**
   * Creates the demonstration sets (D06) while the tenant's sets are untouched (none, and none ever
   * audited), and returns how many. A set whose material or location is missing or inactive, or that
   * would make a raw material, is skipped: production's Test tenant may have been edited since its
   * masters were seeded. Not audited, like the other demo records.
   */
  async seedDemo(): Promise<number> {
    return this.em.transactional(async (em) => {
      if (!(await isUntouchedKind(em, await em.count(PlanningParameterSet, {}), "planning-parameters"))) return 0;
      const references = await activeDemoReferences(em, DEMO_PLANNING_PARAMETERS);
      let created = 0;
      for (const demo of DEMO_PLANNING_PARAMETERS) {
        const material = references.material.get(demo.material);
        const location = references.location.get(demo.location);
        if (!material || !location || !isProcurementAllowed(material.type, demo.procurement)) continue;
        em.create(PlanningParameterSet, { material, location, ...pickValues(demo) });
        created += 1;
      }
      await em.flush();
      return created;
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

  /** The set at `version`, compared with a fresh read; the material and location may be inactive. */
  private async findSet(em: EntityManager, materialId: string, locationId: string, version: number): Promise<PlanningParameterSet> {
    const material = await findMaterial(em, materialId);
    const location = await findLocation(em, locationId);
    const set = await em.findOne(PlanningParameterSet, { material, location }, { refresh: true });
    if (!set) {
      throw new NotFoundError(
        "PLANNING_PARAMETERS_NOT_FOUND",
        `Material ${materialId} has no planning parameters at location ${locationId}.`,
      );
    }
    if (set.version !== version) throw versionConflict();
    return set;
  }
}

/** Refuses Make for a raw material (R02, MAT-014), next to the Make/Buy field. */
function assertProcurement(material: Material, procurement: ProcurementMode): void {
  if (!isProcurementAllowed(material.type, procurement)) {
    throw new ValidationError({ procurement: [RAW_MATERIAL_BUY_ONLY_MESSAGE] });
  }
}

const setExists = (materialId: string, locationId: string) =>
  new ConflictError(
    `Material ${materialId} already has planning parameters at location ${locationId}.`,
    "PLANNING_PARAMETERS_EXIST",
  );

function pickValues(values: PlanningParameterValues): PlanningParameterValues {
  const { procurement, leadTimeDays, minimumQuantity, lotMultiple } = values;
  return { procurement, leadTimeDays, minimumQuantity, lotMultiple };
}

/** The fields of a set the audit may show: an allowlist (R08). */
function snapshot(set: PlanningParameterSet) {
  return { material: set.material.code, location: set.location.code, ...pickValues(set) };
}

function pickKeys(values: Record<string, string | number>, keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

function entry(action: string, set: PlanningParameterSet, before: AuditEntry["before"], after: AuditEntry["after"]): AuditEntry {
  return {
    action: `planning-parameters.planning-parameter-set.${action}`,
    subject: { type: "PlanningParameterSet", id: `${set.material.code}/${set.location.code}`, label: pairLabel(set.material, set.location) },
    before,
    after,
  };
}

/** The audit label of a material at a location, in the `code — name` style of the other subjects. */
function pairLabel(material: Material, location: Location): string {
  return `${material.code} — ${material.description} at ${location.code} — ${location.name}`;
}

function toView(set: PlanningParameterSet): PlanningParameterView {
  return { material: set.material.code, location: set.location.code, ...pickValues(set), version: set.version };
}
