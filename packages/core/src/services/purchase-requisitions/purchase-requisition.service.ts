import {
  OptimisticLockError,
  PurchaseRequisition,
  UniqueConstraintViolationException,
  type EntityManager,
  type Material,
} from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { DEMO_REQUISITIONS } from "../../domain/purchasing/demo-purchasing";
import { AppError, ConflictError, ValidationError, versionConflict } from "../../http/errors";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { findActiveLocation } from "../locations/find-location";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { findActiveMaterial } from "../materials/find-material";
import { lineError } from "../materials/line-error";
import { isScopeReadOnly } from "../tenants/tenant.service";
import {
  findRequisition,
  requisitionEntry,
  requisitionSnapshot,
  toRequisitionView,
  type RequisitionView,
} from "./requisition-records";

export type { RequisitionView };

/** A new requisition as entered: the quantity in any unit the material converts. */
export interface NewRequisition {
  material: string;
  location: string;
  quantity: string;
  unit: string;
  requiredDate: string;
}

export const REQUISITION_ID_RACE = "Another purchase requisition was created at the same moment. Try again.";

interface Deps {
  em: EntityManager;
}

/**
 * The tenant's purchase requisitions (E09-S01): a need to buy one material at one location by a
 * date. Resolved from a tenant scope, so every read and write is that tenant's only (R05); any
 * signed-in account writes (the route or action checks the session, the read-only gate is the
 * wrapper's). A requisition starts Open with nothing converted (LFC-001) and is completed by the
 * purchase-order lines that convert it (`PurchaseOrderService`); it never changes stock (BUY-009).
 * Only its required date can change afterwards. Every change records its tenant audit entry in the
 * same transaction (R08), and an edit carries the version the caller loaded.
 */
export class PurchaseRequisitionService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /** Every requisition of the tenant, by ID. */
  async list(): Promise<RequisitionView[]> {
    const requisitions = await this.em.find(
      PurchaseRequisition,
      {},
      { populate: ["material", "location"], orderBy: { code: "asc" } },
    );
    return requisitions.map(toRequisitionView);
  }

  /** One requisition; `REQUISITION_NOT_FOUND` when this tenant has no such ID, another tenant's included (TEN-014). */
  async get(id: string): Promise<RequisitionView> {
    return toRequisitionView(await findRequisition(this.em, id));
  }

  /** A new Open requisition with the next ID and nothing converted (LFC-001). */
  async create(input: NewRequisition, actor: AuditActor): Promise<RequisitionView> {
    try {
      return await this.em.transactional(async (em) => {
        const requisition = await insertRequisition(em, input);
        recordTenantAudit(em, actor, requisitionEntry("created", requisition, null, requisitionSnapshot(requisition)));
        await em.flush();
        return toRequisitionView(requisition);
      });
    } catch (error) {
      // A racing create normally surfaces as a stale snapshot, which the request wrappers retry;
      // the unique index only catches what slips past that.
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(REQUISITION_ID_RACE, "REQUISITION_ID_RACE");
      throw error;
    }
  }

  /** A new required date at `version`; the same date is no change and records nothing (spec Q8). */
  async setRequiredDate(id: string, requiredDate: string, version: number, actor: AuditActor): Promise<RequisitionView> {
    try {
      return await this.em.transactional(async (em) => {
        const requisition = await findRequisition(em, id, { refresh: true });
        if (requisition.version !== version) throw versionConflict();
        if (requisition.requiredDate !== requiredDate) {
          const before = { requiredDate: requisition.requiredDate };
          requisition.requiredDate = requiredDate;
          recordTenantAudit(em, actor, requisitionEntry("updated", requisition, before, { requiredDate }));
          await em.flush();
        }
        return toRequisitionView(requisition);
      });
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }

  /**
   * Creates the demonstration requisitions (D06) when the tenant has none, and returns how many. Each
   * is built through the same rules as a save, in its own savepoint: one that breaks a rule here (a
   * demo material or location missing, inactive or without its conversion in an edited Test tenant)
   * is skipped. Not audited, like the other demo records. Seeds nothing into a read-only tenant (R05).
   */
  async seedDemo(): Promise<number> {
    return this.em.transactional(async (em) => {
      if ((await em.count(PurchaseRequisition, {})) > 0 || (await isScopeReadOnly(em))) return 0;
      let created = 0;
      for (const demo of DEMO_REQUISITIONS) {
        try {
          await em.transactional(async (savepoint) => {
            await insertRequisition(savepoint, demo);
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
}

/** Checks and inserts (unflushed) a requisition with the tenant's next ID; shared by `create` and the demo seed. */
async function insertRequisition(em: EntityManager, input: NewRequisition): Promise<PurchaseRequisition> {
  const material = await findActiveMaterial(em, input.material);
  const location = await findActiveLocation(em, input.location);
  const record = await convertEntered(em, material, input);
  const [highest] = await em.find(PurchaseRequisition, {}, { orderBy: { code: "desc" }, limit: 1 });
  const code = nextSequentialId(highest?.code ?? null, {
    code: "REQUISITION_IDS_EXHAUSTED",
    message: "This tenant has used every eight-digit purchase requisition ID.",
  });
  const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
  return em.create(PurchaseRequisition, {
    code,
    material,
    location,
    quantity: baseQuantity,
    enteredQuantity,
    enteredUnit,
    numerator,
    denominator,
    requiredDate: input.requiredDate,
    converted: "0.000000",
    status: "open",
  });
}

/** The entered quantity in the material's base unit; a refused conversion is a field error on `quantity` or `unit`. */
async function convertEntered(
  em: EntityManager,
  material: Material,
  { quantity, unit }: { quantity: string; unit: string },
): Promise<BaseQuantity> {
  try {
    return await convertToBaseQuantity(em, material, { quantity, unit });
  } catch (error) {
    const [field, message] = lineError(error);
    throw new ValidationError({ [field]: [message] });
  }
}
