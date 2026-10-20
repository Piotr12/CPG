import {
  Material,
  MaterialConversion,
  OptimisticLockError,
  UniqueConstraintViolationException,
  type EntityManager,
  type MaterialType,
} from "@cpg/db";
import { DEMO_MATERIALS } from "../../domain/materials/demo-materials";
import { nextMaterialCode } from "../../domain/materials/material-code";
import {
  convertToBase,
  formatDecimal,
  inverseFactor,
  MAX_QUANTITY,
  parseDecimal,
} from "../../domain/quantities/decimal";
import { AppError, ConflictError, NotFoundError, ValidationError, versionConflict } from "../../http/errors";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit, type AuditEntry } from "../audit/audit-recorder";
import { isScopeReadOnly } from "../tenants/tenant.service";
import { findMaterial } from "./find-material";

export { materialNotFound } from "./find-material";

/** What the screens and the API show about a material. `id` is its eight-digit business ID (R01). */
export interface MaterialSummary {
  id: string;
  type: MaterialType;
  description: string;
  baseUnit: string;
  active: boolean;
  createdAt: Date;
  /** The optimistic-lock version an edit must carry back (AUD-024, API-029). */
  version: number;
}

/** One conversion: `1 unit = numerator / denominator` base units, with its indicative inverse. */
export interface ConversionView {
  unit: string;
  numerator: string;
  denominator: string;
  /** `denominator ÷ numerator`, half-up to six decimals; only for display, never for storage (MAT-021). */
  inverse: string;
  version: number;
}

export interface MaterialDetail extends MaterialSummary {
  conversions: ConversionView[];
}

export interface NewMaterial {
  type: MaterialType;
  description: string;
  baseUnit: string;
}

/** The fields an edit may set; absent ones stay as they are. */
export interface MaterialChanges {
  type?: MaterialType;
  description?: string;
  baseUnit?: string;
  active?: boolean;
}

export interface ConversionFactor {
  numerator: string;
  denominator: string;
}

/**
 * An entered quantity converted into the material's base unit (spec Q5): the six-decimal base
 * quantity that is authoritative, and the entered quantity, unit and factor that history keeps
 * (MAT-019). The BOM and document stories store this record as it is.
 */
export interface BaseQuantity {
  baseQuantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
}

export const MATERIAL_ID_RACE = "Another material was created at the same moment. Try again.";

interface Deps {
  em: EntityManager;
}

/**
 * A tenant's materials and their unit conversions (E03-S01). Resolved from a tenant scope, so every
 * read and write is that tenant's only (R05). The admin maintains them; callers check that with
 * `assertAdmin` before a write. A new material takes the tenant's highest ID + 1 (R01). Every change
 * records its tenant audit entry in the same transaction (R08), and an edit carries the version the
 * caller loaded (`VERSION_CONFLICT` otherwise). Nothing is ever deleted except a conversion row:
 * whatever was stored from an entered quantity keeps its own copy of the unit and factor.
 */
export class MaterialService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /** Every material of the tenant, by ID. */
  async list(): Promise<MaterialSummary[]> {
    return (await this.em.find(Material, {}, { orderBy: { code: "asc" } })).map(toSummary);
  }

  /** One material with its conversions, by unit; `MATERIAL_NOT_FOUND` when this tenant has no such ID. */
  async get(materialId: string): Promise<MaterialDetail> {
    const material = await findMaterial(this.em, materialId);
    const conversions = await this.em.find(MaterialConversion, { material }, { orderBy: { unit: "asc" } });
    return { ...toSummary(material), conversions: conversions.map(toConversionView) };
  }

  /** A new active material with the next ID (MAT-001…003). */
  async create(input: NewMaterial, actor: AuditActor): Promise<MaterialSummary> {
    try {
      return await this.em.transactional(async (em) => {
        const material = await this.insert(em, input);
        recordTenantAudit(em, actor, materialEntry("materials.material.created", material, null, snapshot(material)));
        await em.flush();
        return toSummary(material);
      });
    } catch (error) {
      // A racing create on another connection normally surfaces as a stale snapshot, which the
      // request wrappers retry; the unique index only catches what slips past that.
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(MATERIAL_ID_RACE);
      throw error;
    }
  }

  /**
   * Applies the given fields at `version`. A field counts only when it differs from the stored value
   * (spec Q8), so resending the base unit is no change; with nothing changed, nothing is written or
   * recorded. The base unit can't change while conversions exist: their factors are relative to it.
   */
  async update(materialId: string, changes: MaterialChanges, version: number, actor: AuditActor): Promise<MaterialSummary> {
    return this.versioned(async (em) => {
      const material = await findMaterial(em, materialId, { refresh: true });
      if (material.version !== version) throw versionConflict();
      const { active, ...fields } = changedFields(material, changes);
      if (fields.baseUnit !== undefined && (await em.count(MaterialConversion, { material })) > 0) {
        throw new ConflictError(
          "Remove this material's unit conversions before changing its base unit: their factors are relative to it.",
          "BASE_UNIT_HAS_CONVERSIONS",
        );
      }
      if (Object.keys(fields).length > 0) {
        const before = pick(snapshot(material), Object.keys(fields));
        em.assign(material, fields);
        recordTenantAudit(em, actor, materialEntry("materials.material.updated", material, before, pick(snapshot(material), Object.keys(fields))));
      }
      if (active !== undefined) {
        material.active = active;
        const action = active ? "materials.material.reactivated" : "materials.material.deactivated";
        recordTenantAudit(em, actor, materialEntry(action, material, { active: !active }, { active }));
      }
      await em.flush();
      return toSummary(material);
    });
  }

  /** A conversion for a new alternate unit (MAT-019, MAT-020). */
  async addConversion(
    materialId: string,
    { unit, numerator, denominator }: ConversionFactor & { unit: string },
    actor: AuditActor,
  ): Promise<ConversionView> {
    try {
      return await this.em.transactional(async (em) => {
        const material = await findMaterial(em, materialId);
        if (unit === material.baseUnit) {
          throw new AppError("UNIT_IS_BASE_UNIT", `${unit} is this material's base unit: it needs no conversion.`);
        }
        if ((await em.count(MaterialConversion, { material, unit })) > 0) throw conversionExists(unit);
        const conversion = em.create(MaterialConversion, { material, unit, numerator, denominator });
        recordTenantAudit(em, actor, conversionEntry("materials.material-conversion.created", conversion, null, conversionSnapshot(conversion)));
        await em.flush();
        return toConversionView(conversion);
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) throw conversionExists(unit);
      throw error;
    }
  }

  /** A new factor for an existing conversion, at `version`; only new entries use it (MAT-027). */
  async changeConversion(
    materialId: string,
    unit: string,
    { numerator, denominator }: ConversionFactor,
    version: number,
    actor: AuditActor,
  ): Promise<ConversionView> {
    return this.versioned(async (em) => {
      const conversion = await this.findConversion(em, materialId, unit, version);
      if (conversion.numerator === numerator && conversion.denominator === denominator) return toConversionView(conversion);
      const before = conversionSnapshot(conversion);
      em.assign(conversion, { numerator, denominator });
      recordTenantAudit(em, actor, conversionEntry("materials.material-conversion.updated", conversion, before, conversionSnapshot(conversion)));
      await em.flush();
      return toConversionView(conversion);
    });
  }

  /** Removes a conversion, at `version`. Quantities stored earlier keep their own unit and factor. */
  async removeConversion(materialId: string, unit: string, version: number, actor: AuditActor): Promise<{ unit: string }> {
    return this.versioned(async (em) => {
      const conversion = await this.findConversion(em, materialId, unit, version);
      recordTenantAudit(em, actor, conversionEntry("materials.material-conversion.removed", conversion, conversionSnapshot(conversion), null));
      em.remove(conversion);
      await em.flush();
      return { unit };
    });
  }

  /**
   * `quantity` entered in `unit`, in the material's base unit (spec Q5): the base unit itself 1:1,
   * another unit through its conversion, rounded half-up once to six decimals (MAT-019…024, MAT-032).
   * A unit without a conversion is never assumed 1:1 (MAT-023).
   */
  async toBaseQuantity(materialId: string, { quantity, unit }: { quantity: string; unit: string }): Promise<BaseQuantity> {
    const entered = parseDecimal(quantity);
    if (entered === null) {
      throw new ValidationError({ quantity: ["Enter a number of at least 0, with at most 6 decimals."] });
    }
    const material = await findMaterial(this.em, materialId);
    const factor =
      unit === material.baseUnit
        ? { numerator: "1", denominator: "1" }
        : await this.em.findOne(MaterialConversion, { material, unit });
    if (!factor) {
      throw new AppError(
        "UNIT_NOT_CONVERTIBLE",
        `Material ${material.code} has no conversion from ${unit} to its base unit ${material.baseUnit}.`,
      );
    }
    const base = convertToBase(entered, parseDecimal(factor.numerator)!, parseDecimal(factor.denominator)!);
    if (base > MAX_QUANTITY) {
      throw new AppError("QUANTITY_OUT_OF_RANGE", "That quantity is too large to store in the base unit.");
    }
    if (entered > 0n && base === 0n) {
      throw new AppError("QUANTITY_ROUNDS_TO_ZERO", `That quantity is less than 0.000001 ${material.baseUnit}.`);
    }
    return {
      baseQuantity: formatDecimal(base, { fixed: true }),
      enteredQuantity: formatDecimal(entered),
      enteredUnit: unit,
      numerator: factor.numerator,
      denominator: factor.denominator,
    };
  }

  /**
   * Creates the demonstration materials (D06) when the tenant has none, and returns how many. Not
   * audited (spec Q9): it is an installation step, like the tenants the migration inserts. Each
   * material is flushed before the next reads the highest ID, so they get consecutive IDs. Seeds
   * nothing into a read-only tenant (R05): its flag is read in the seed's own transaction.
   */
  async seedDemo(): Promise<number> {
    return this.em.transactional(async (em) => {
      if ((await em.count(Material, {})) > 0 || (await isScopeReadOnly(em))) return 0;
      for (const { conversions, ...fields } of DEMO_MATERIALS) {
        const material = await this.insert(em, fields);
        for (const conversion of conversions) em.create(MaterialConversion, { material, ...conversion });
        await em.flush();
      }
      return DEMO_MATERIALS.length;
    });
  }

  /** Creates (unflushed) a material with the ID after the tenant's highest. */
  private async insert(em: EntityManager, input: NewMaterial): Promise<Material> {
    const [highest] = await em.find(Material, {}, { orderBy: { code: "desc" }, limit: 1 });
    return em.create(Material, { code: nextMaterialCode(highest?.code ?? null), ...input });
  }

  /**
   * Runs an edit in one transaction. The version is compared with a fresh read, never a copy already
   * in the identity map; a write that lands between that read and the flush fails the flush's own
   * version check. Both are `VERSION_CONFLICT`.
   */
  private async versioned<T>(edit: (em: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.em.transactional(edit);
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }

  private async findConversion(em: EntityManager, materialId: string, unit: string, version: number) {
    const material = await findMaterial(em, materialId);
    const conversion = await em.findOne(MaterialConversion, { material, unit }, { refresh: true });
    if (!conversion) {
      throw new NotFoundError("CONVERSION_NOT_FOUND", `Material ${materialId} has no conversion for ${unit}.`);
    }
    if (conversion.version !== version) throw versionConflict();
    return conversion;
  }
}

const conversionExists = (unit: string) =>
  new ConflictError(`This material already has a conversion for ${unit}.`, "CONVERSION_EXISTS");

/** The changes that differ from the stored values; equal values are no change (spec Q8). */
function changedFields(material: Material, changes: MaterialChanges): MaterialChanges {
  const changed: MaterialChanges = {};
  if (changes.type !== undefined && changes.type !== material.type) changed.type = changes.type;
  if (changes.description !== undefined && changes.description !== material.description) {
    changed.description = changes.description;
  }
  if (changes.baseUnit !== undefined && changes.baseUnit !== material.baseUnit) changed.baseUnit = changes.baseUnit;
  if (changes.active !== undefined && changes.active !== material.active) changed.active = changes.active;
  return changed;
}

/** The fields of a material the audit may show: an allowlist (R08). */
function snapshot({ code, type, description, baseUnit, active }: Material) {
  return { id: code, type, description, baseUnit, active };
}

function conversionSnapshot({ material, unit, numerator, denominator }: MaterialConversion) {
  return { material: material.code, unit, numerator, denominator };
}

function pick(values: Record<string, string | boolean>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

function materialEntry(action: string, material: Material, before: AuditEntry["before"], after: AuditEntry["after"]): AuditEntry {
  const label = `${material.code} — ${material.description}`;
  return { action, subject: { type: "Material", id: material.code, label }, before, after };
}

function conversionEntry(
  action: string,
  conversion: MaterialConversion,
  before: AuditEntry["before"],
  after: AuditEntry["after"],
): AuditEntry {
  const { code } = conversion.material;
  const subject = { type: "MaterialConversion", id: `${code}/${conversion.unit}`, label: `${code} ${conversion.unit}` };
  return { action, subject, before, after };
}

function toSummary({ code, type, description, baseUnit, active, createdAt, version }: Material): MaterialSummary {
  return { id: code, type, description, baseUnit, active, createdAt, version };
}

function toConversionView({ unit, numerator, denominator, version }: MaterialConversion): ConversionView {
  const inverse = inverseFactor(parseDecimal(numerator)!, parseDecimal(denominator)!);
  return { unit, numerator, denominator, inverse: formatDecimal(inverse), version };
}
