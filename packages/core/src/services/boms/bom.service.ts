import {
  Bom,
  BomComponent,
  BomRevision,
  Material,
  OptimisticLockError,
  UniqueConstraintViolationException,
  type EntityManager,
} from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { DEMO_BOMS } from "../../domain/boms/demo-boms";
import { findCycle, type CycleStep, type RecipeEdge } from "../../domain/boms/find-cycle";
import { findPriorityConflict, type PriorityConflict } from "../../domain/boms/priority-conflict";
import { isSameRecipe } from "../../domain/boms/recipe-equality";
import { canBeBomComponent, canBeBomOutput } from "../../domain/boms/recipe-rules";
import { parseDecimal } from "../../domain/quantities/decimal";
import { AppError, ConflictError, NotFoundError, ValidationError, versionConflict, type FieldErrors } from "../../http/errors";
import {
  DUPLICATE_COMPONENT_MESSAGE,
  FINISHED_COMPONENT_MESSAGE,
  RAW_OUTPUT_MESSAGE,
  VALID_THROUGH_BEFORE_FROM_MESSAGE,
} from "../../validators/boms/bom-fields.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit, type AuditEntry } from "../audit/audit-recorder";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { conversionFieldError } from "../materials/conversion-field-error";
import { findActiveMaterial, findMaterial } from "../materials/find-material";
import { isScopeReadOnly } from "../tenants/tenant.service";

/** One line as the screens and the API show it: the component's ID and the stored record (materials spec Q5). */
export interface BomComponentView {
  material: string;
  /** The base-unit quantity per one output base unit, six decimals (R03). */
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
}

/** A recipe's own fields: its priority (1 is the highest) and inclusive validity (spec Q4). */
export interface RecipeHeader {
  priority: number;
  validFrom: string;
  /** Null when the recipe has no end. */
  validThrough: string | null;
}

/** A BOM with its current revision's recipe. `id` is its eight-digit business ID. */
export interface BomView extends RecipeHeader {
  id: string;
  /** The output material's ID. */
  output: string;
  active: boolean;
  /** The current revision's number. */
  revision: number;
  components: BomComponentView[];
  createdAt: Date;
  /** The optimistic-lock version an edit must carry back (AUD-024, API-029). */
  version: number;
}

export interface BomRevisionSummary extends RecipeHeader {
  number: number;
  createdAt: Date;
}

/** A BOM, its current recipe and every revision, newest first (BOM-020). */
export interface BomDetail extends BomView {
  revisions: BomRevisionSummary[];
}

/** One revision, current or historic, read-only. */
export interface BomRevisionView extends RecipeHeader {
  bom: string;
  number: number;
  createdAt: Date;
  current: boolean;
  components: BomComponentView[];
}

/** A line as entered: a material, a quantity and the unit it is in. */
export interface ComponentLine {
  material: string;
  quantity: string;
  unit: string;
}

export interface RecipeInput extends RecipeHeader {
  components: ComponentLine[];
}

export interface NewBom extends RecipeInput {
  output: string;
}

/** What an update may change; absent recipe fields keep the current revision's values (spec Q13). */
export type BomChanges = Partial<RecipeInput> & { active?: boolean };

export const BOM_ID_RACE = "Another BOM was created at the same moment. Try again.";

/** A BOM's current revision and its lines, loaded together. */
interface CurrentRecipe {
  revision: BomRevision;
  lines: BomComponent[];
}

/** A line ready to store: its material and the record its entered quantity converts to. */
interface ResolvedLine {
  material: Material;
  record: BaseQuantity;
}

/** The recipe a save would store, in the shape the checks and the writes share. */
interface Candidate extends RecipeHeader {
  lines: ResolvedLine[];
}

interface Deps {
  em: EntityManager;
}

/**
 * The tenant's BOMs (E04-S01). Resolved from a tenant scope, so every read and write is that
 * tenant's only (R05); callers check the admin with `assertAdmin`. A BOM is a stable alternative
 * recipe for one intermediate or finished output; its recipe is a series of immutable revisions,
 * and a save adds one only when the recipe really changes (R04). Two active alternatives for one
 * output never share a priority on the same day, and no recipe may make a cycle. Every change
 * records its tenant audit entry in the same transaction (R08), and an update carries the version
 * the caller loaded. BOMs, revisions and lines are never deleted.
 */
export class BomService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /** Every BOM of the tenant with its current recipe, by output ID, then priority, then BOM ID. */
  async list(): Promise<BomView[]> {
    const boms = await this.em.find(Bom, {}, { populate: ["output"] });
    const current = await currentRecipes(this.em, boms);
    return boms
      .map((bom) => toView(bom, current.get(bom.id)!))
      .sort((a, b) => a.output.localeCompare(b.output) || a.priority - b.priority || a.id.localeCompare(b.id));
  }

  /** One BOM with its current recipe and its revisions; `BOM_NOT_FOUND` when this tenant has no such ID. */
  async get(bomId: string): Promise<BomDetail> {
    return detail(this.em, await findBom(this.em, bomId));
  }

  /** One revision of a BOM, current or historic (BOM-020); `BOM_REVISION_NOT_FOUND` when it has none of that number. */
  async getRevision(bomId: string, number: number): Promise<BomRevisionView> {
    const bom = await findBom(this.em, bomId);
    const revision = await this.em.findOne(BomRevision, { bom, number });
    if (!revision) throw new NotFoundError("BOM_REVISION_NOT_FOUND", `BOM ${bomId} has no revision ${number}.`);
    const lines = await linesOf(this.em, [revision]);
    return {
      bom: bom.code,
      number,
      ...header(revision),
      createdAt: revision.createdAt,
      current: number === bom.revision,
      components: lines.map(toComponentView),
    };
  }

  /** A new BOM with revision 1 and the next ID (BOM-001, BOM-002, BOM-005). */
  async create(input: NewBom, actor: AuditActor): Promise<BomDetail> {
    try {
      return await this.em.transactional(async (em) => {
        const { bom, candidate } = await insertBom(em, input);
        recordTenantAudit(em, actor, bomEntry("created", bom, null, { id: bom.code, output: bom.output.code, active: true, ...recipeSnapshot(1, candidate) }));
        await em.flush();
        return detail(em, bom);
      });
    } catch (error) {
      // A racing create normally surfaces as a stale snapshot, which the request wrappers retry;
      // the unique index only catches what slips past that.
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(BOM_ID_RACE, "BOM_ID_RACE");
      throw error;
    }
  }

  /**
   * Applies `changes` at `version` (spec Q6, Q7, Q11, Q13). Recipe fields left out keep the current
   * revision's; when the resulting recipe differs from it, the next revision is added. A changed
   * `active` flag is recorded on its own and never adds a revision. The priority check runs once,
   * on the end state, and only when the BOM ends up active. With nothing changed, nothing is written.
   */
  async update(bomId: string, changes: BomChanges, version: number, actor: AuditActor): Promise<BomDetail> {
    return this.versioned(async (em) => {
      const bom = await findBom(em, bomId, { refresh: true });
      if (bom.version !== version) throw versionConflict();
      const current = await currentRecipe(em, bom);
      const candidate = await revisedRecipe(em, current, changes);
      const active = changes.active ?? bom.active;
      if (candidate) await assertNoCycle(em, bom.code, bom.output, candidate);
      if (active && (candidate || !bom.active)) {
        await assertNoPriorityConflict(em, bom.code, bom.output, candidate ?? toCandidate(current));
      }
      if (candidate) {
        const before = recipeSnapshot(bom.revision, toCandidate(current));
        bom.revision += 1;
        insertRevision(em, bom, bom.revision, candidate);
        recordTenantAudit(em, actor, bomEntry("revised", bom, before, recipeSnapshot(bom.revision, candidate)));
      }
      if (active !== bom.active) {
        bom.active = active;
        recordTenantAudit(em, actor, bomEntry(active ? "reactivated" : "deactivated", bom, { active: !active }, { active }));
      }
      await em.flush();
      return detail(em, bom);
    });
  }

  /**
   * Creates the demonstration BOMs (D06) when the tenant has none, and returns how many. Each is
   * built through the same rules as a save, in its own savepoint: one that breaks a rule here (a
   * demo material retyped, deactivated, or its conversion removed in an edited Test tenant) is
   * skipped, and the next takes the next free ID. Not audited, like the other demo records. Seeds
   * nothing into a read-only tenant (R05).
   */
  async seedDemo(): Promise<number> {
    return this.em.transactional(async (em) => {
      if ((await em.count(Bom, {})) > 0 || (await isScopeReadOnly(em))) return 0;
      let created = 0;
      for (const demo of DEMO_BOMS) {
        try {
          await em.transactional(async (savepoint) => {
            await insertBom(savepoint, demo);
            await savepoint.flush();
          });
          created += 1;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
        }
      }
      return created;
    });
  }

  /** Runs an edit in one transaction; a write landing before its flush is `VERSION_CONFLICT`. */
  private async versioned<T>(edit: (em: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.em.transactional(edit);
    } catch (error) {
      // A clash on (bom, number) is a racing revision with the same number: the BOM changed under the caller.
      if (error instanceof OptimisticLockError || error instanceof UniqueConstraintViolationException) throw versionConflict();
      throw error;
    }
  }
}

/** The BOM with business ID `bomId` in `em`'s tenant, with its output, or `BOM_NOT_FOUND`. */
async function findBom(em: EntityManager, bomId: string, options: { refresh?: boolean } = {}): Promise<Bom> {
  const bom = await em.findOne(Bom, { code: bomId }, { ...options, populate: ["output"] });
  if (!bom) throw new NotFoundError("BOM_NOT_FOUND", `There is no BOM ${bomId} in this tenant.`);
  return bom;
}

/**
 * Checks and inserts (unflushed) a new BOM with revision 1: the output, the lines, then the cycle
 * and priority rules, then the next ID. Shared by `create` and the demo seed.
 */
async function insertBom(em: EntityManager, input: NewBom): Promise<{ bom: Bom; candidate: Candidate }> {
  const output = await findActiveMaterial(em, input.output);
  if (!canBeBomOutput(output.type)) throw new ValidationError({ output: [RAW_OUTPUT_MESSAGE] });
  const candidate: Candidate = { ...pickHeader(input), lines: await resolveLines(em, input.components, []) };
  await assertNoCycle(em, null, output, candidate);
  await assertNoPriorityConflict(em, null, output, candidate);
  const [highest] = await em.find(Bom, {}, { orderBy: { code: "desc" }, limit: 1 });
  const code = nextSequentialId(highest?.code ?? null, {
    code: "BOM_IDS_EXHAUSTED",
    message: "This tenant has used every eight-digit BOM ID.",
  });
  const bom = em.create(Bom, { code, output, revision: 1 });
  insertRevision(em, bom, 1, candidate);
  return { bom, candidate };
}

/** Creates (unflushed) revision `number` of `bom` with its lines, in entered order. */
function insertRevision(em: EntityManager, bom: Bom, number: number, candidate: Candidate): void {
  const revision = em.create(BomRevision, { bom, number, ...pickHeader(candidate) });
  candidate.lines.forEach(({ material, record }, position) => {
    const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
    em.create(BomComponent, { revision, position, material, quantity: baseQuantity, enteredQuantity, enteredUnit, numerator, denominator });
  });
}

/**
 * The recipe an update would store, or null when it changes nothing (spec Q6): the current
 * revision's fields overlaid with `changes`, compared by priority, dates and base quantities.
 */
async function revisedRecipe(em: EntityManager, current: CurrentRecipe, changes: BomChanges): Promise<Candidate | null> {
  const { priority, validFrom, validThrough, components } = changes;
  if ([priority, validFrom, validThrough, components].every((field) => field === undefined)) return null;
  const header: RecipeHeader = {
    priority: priority ?? current.revision.priority,
    validFrom: validFrom ?? current.revision.validFrom,
    validThrough: validThrough === undefined ? (current.revision.validThrough ?? null) : validThrough,
  };
  if (header.validThrough !== null && header.validThrough < header.validFrom) {
    throw new ValidationError({ validThrough: [VALID_THROUGH_BEFORE_FROM_MESSAGE] });
  }
  const lines = components ? await resolveLines(em, components, current.lines) : toCandidate(current).lines;
  const candidate = { ...header, lines };
  return isSameRecipe(toContent(toCandidate(current)), toContent(candidate)) ? null : candidate;
}

/**
 * Loads each line's material and converts its quantity, collecting every line's field errors into
 * one `VALIDATION_FAILED` keyed `components.N.<field>`. An unknown material is `MATERIAL_NOT_FOUND`.
 * An inactive material can't be added (MAT-029) but may stay when `kept` (the current revision's
 * lines) already has it (spec Q10). A material repeated in `lines` is an error on its later line
 * (spec Q5), so a caller that skips the schemas (the import) gets the same answer. A kept line resent
 * with the same entered quantity (compared as a number) and unit keeps its stored record, so a
 * changed conversion never revalues it (spec Q6, MAT-027).
 */
async function resolveLines(em: EntityManager, lines: readonly ComponentLine[], kept: readonly BomComponent[]): Promise<ResolvedLine[]> {
  const keptByMaterial = new Map(kept.map((line) => [line.material.code, line]));
  const errors: FieldErrors = {};
  const resolved: ResolvedLine[] = [];
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (seen.has(line.material)) {
      errors[`components.${index}.material`] = [DUPLICATE_COMPONENT_MESSAGE];
      continue;
    }
    seen.add(line.material);
    const keptLine = keptByMaterial.get(line.material);
    const material = keptLine ? await findMaterial(em, line.material) : await findActiveMaterial(em, line.material);
    if (!canBeBomComponent(material.type)) {
      errors[`components.${index}.material`] = [FINISHED_COMPONENT_MESSAGE];
      continue;
    }
    if (keptLine && keptLine.enteredUnit === line.unit && parseDecimal(keptLine.enteredQuantity) === parseDecimal(line.quantity)) {
      resolved.push({ material, record: toRecord(keptLine) });
      continue;
    }
    try {
      resolved.push({ material, record: await convertToBaseQuantity(em, material, line) });
    } catch (error) {
      const [field, message] = conversionFieldError(error);
      errors[`components.${index}.${field}`] = [message];
    }
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return resolved;
}

/**
 * Refuses a recipe that would make a cycle, naming every step's BOM (R04, BOM-024, BOM-025, spec
 * Q8). The graph is every BOM's current revision, active or not; `bomCode` is the saved BOM's (null
 * for a new one), whose own old edges the new recipe replaces.
 */
async function assertNoCycle(em: EntityManager, bomCode: string | null, output: Material, candidate: Candidate): Promise<void> {
  const boms = await em.find(Bom, {}, { populate: ["output"] });
  const edges: RecipeEdge[] = [];
  for (const [id, { lines }] of await currentRecipes(em, boms)) {
    const bom = boms.find((each) => each.id === id)!;
    for (const line of lines) edges.push({ bom: bom.code, output: bom.output.code, component: line.material.code });
  }
  const components = candidate.lines.map(({ material }) => material.code);
  const cycle = findCycle(edges, { bom: bomCode, output: output.code, components });
  if (cycle) throw new ConflictError(`This recipe would make a cycle: ${await cyclePath(em, cycle)}.`, "BOM_CYCLE");
}

/**
 * `00000003 C →(BOM 00000009) 00000001 A →(BOM 00000007) 00000003 C`: each material with the BOM of
 * its step; the step of a BOM that has no ID yet is a bare arrow. Language-neutral, so a screen can
 * append it to the sentence it translates.
 */
async function cyclePath(em: EntityManager, cycle: CycleStep[]): Promise<string> {
  const codes = [cycle[0].from, ...cycle.map(({ to }) => to)];
  const materials = await em.find(Material, { code: { $in: codes } });
  const label = (code: string) => `${code} ${materials.find((material) => material.code === code)!.description}`;
  return [label(cycle[0].from), ...cycle.map(({ to, bom }) => `${bom ? `→(BOM ${bom})` : "→"} ${label(to)}`)].join(" ");
}

/**
 * Refuses a recipe whose priority another active alternative for the same output already has on
 * one of its days (R04, BOM-015…019, BOM-030, spec Q7). Compares the current revisions of the
 * active BOMs; `bomCode` is skipped (null for a new BOM).
 */
async function assertNoPriorityConflict(em: EntityManager, bomCode: string | null, output: Material, candidate: Candidate): Promise<void> {
  const alternatives = await em.find(Bom, { output, active: true });
  const current = await currentRecipes(em, alternatives);
  const conflict = findPriorityConflict(
    { bom: bomCode ?? "", ...pickHeader(candidate) },
    alternatives.map((bom) => ({ bom: bom.code, ...header(current.get(bom.id)!.revision) })),
  );
  if (conflict) throw new ConflictError(conflictMessage(conflict), "BOM_PRIORITY_CONFLICT");
}

/**
 * Names the clashing BOM and the days both would be chosen on, after the colon in a language-neutral
 * form (`BOM 00000001 (2027-03-01 – 2027-03-31)`, `– …` for no end), so a screen can append it.
 */
function conflictMessage({ bom, days }: PriorityConflict): string {
  const span = days.from === days.through ? days.from : `${days.from} – ${days.through ?? "…"}`;
  return `Another active BOM for this output has the same priority on some of these days: BOM ${bom} (${span}).`;
}

/** The current revision of each of `boms`, with its lines, by the BOM's internal ID. */
async function currentRecipes(em: EntityManager, boms: readonly Bom[]): Promise<Map<string, CurrentRecipe>> {
  if (boms.length === 0) return new Map();
  const revisions = (await em.find(BomRevision, { bom: { $in: boms } })).filter((revision) =>
    boms.some((bom) => bom.id === revision.bom.id && bom.revision === revision.number),
  );
  const lines = await linesOf(em, revisions);
  return new Map(revisions.map((revision) => [revision.bom.id, { revision, lines: lines.filter((line) => line.revision.id === revision.id) }]));
}

async function currentRecipe(em: EntityManager, bom: Bom): Promise<CurrentRecipe> {
  return (await currentRecipes(em, [bom])).get(bom.id)!;
}

/** The lines of `revisions`, with their materials, in entered order. */
async function linesOf(em: EntityManager, revisions: readonly BomRevision[]): Promise<BomComponent[]> {
  return em.find(BomComponent, { revision: { $in: [...revisions] } }, { populate: ["material"], orderBy: { position: "asc" } });
}

async function detail(em: EntityManager, bom: Bom): Promise<BomDetail> {
  const revisions = await em.find(BomRevision, { bom }, { orderBy: { number: "desc" } });
  return {
    ...toView(bom, await currentRecipe(em, bom)),
    revisions: revisions.map((revision) => ({ number: revision.number, ...header(revision), createdAt: revision.createdAt })),
  };
}

function header(revision: BomRevision): RecipeHeader {
  return { priority: revision.priority, validFrom: revision.validFrom, validThrough: revision.validThrough ?? null };
}

function pickHeader({ priority, validFrom, validThrough }: RecipeHeader): RecipeHeader {
  return { priority, validFrom, validThrough };
}

function toRecord(line: BomComponent): BaseQuantity {
  const { quantity, enteredQuantity, enteredUnit, numerator, denominator } = line;
  return { baseQuantity: quantity, enteredQuantity, enteredUnit, numerator, denominator };
}

function toCandidate({ revision, lines }: CurrentRecipe): Candidate {
  return { ...header(revision), lines: lines.map((line) => ({ material: line.material, record: toRecord(line) })) };
}

function toContent({ lines, ...recipeHeader }: Candidate) {
  return { ...recipeHeader, components: lines.map(({ material, record }) => ({ material: material.code, quantity: record.baseQuantity })) };
}

function toComponentView({ material, quantity, enteredQuantity, enteredUnit, numerator, denominator }: BomComponent): BomComponentView {
  return { material: material.code, quantity, enteredQuantity, enteredUnit, numerator, denominator };
}

function toView(bom: Bom, { revision, lines }: CurrentRecipe): BomView {
  return {
    id: bom.code,
    output: bom.output.code,
    active: bom.active,
    revision: bom.revision,
    ...header(revision),
    components: lines.map(toComponentView),
    createdAt: bom.createdAt,
    version: bom.version,
  };
}

/**
 * A recipe as the audit may show it (R08): scalar fields, and the lines as one text value, each
 * `material base-quantity base-unit`, plus the entered quantity and unit when they differ.
 */
function recipeSnapshot(number: number, { lines, ...recipeHeader }: Candidate) {
  const components = lines
    .map(({ material, record }) => {
      const entered = record.enteredUnit === material.baseUnit ? "" : ` (${record.enteredQuantity} ${record.enteredUnit})`;
      return `${material.code} ${record.baseQuantity} ${material.baseUnit}${entered}`;
    })
    .join("; ");
  return { revision: number, ...pickHeader(recipeHeader), components };
}

function bomEntry(action: string, bom: Bom, before: AuditEntry["before"], after: AuditEntry["after"]): AuditEntry {
  const label = `${bom.code} — ${bom.output.code} ${bom.output.description}`;
  return { action: `boms.bom.${action}`, subject: { type: "Bom", id: bom.code, label }, before, after };
}
