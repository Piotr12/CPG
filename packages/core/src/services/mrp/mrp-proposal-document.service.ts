import { MrpRecommendation, type EntityManager, type MrpRecommendationKind } from "@cpg/db";
import { isExecutableProposal } from "../../domain/mrp/acceptance/executable-proposal";
import { parseInput } from "../../http/parse-input";
import { productionOrderCreateSchema } from "../../validators/production-orders/production-order.schema";
import { requisitionCreateSchema } from "../../validators/purchasing/purchase-requisition.schema";
import type { AuditActor } from "../audit/actor";
import { findMaterial } from "../materials/find-material";
import type { ProductionOrderService, ProductionOrderView } from "../production-orders/production-order.service";
import type { PurchaseRequisitionService, RequisitionView } from "../purchase-requisitions/purchase-requisition.service";

/** A stored proposal as plain values: what its document is created from (E19-S03, spec "MrpBatchService"). */
export interface MrpProposalFields {
  /** The recommendation's UUID. */
  id: string;
  kind: MrpRecommendationKind;
  material: string;
  location: string;
  needDate: string;
  /** Six-decimal text in the material's base unit. */
  quantity: string;
  /** The BOM a production order is pinned to (E17-S01, #320); null for a requisition. */
  bom: string | null;
  /** That BOM's revision when the run chose it; null where `bom` is. */
  bomRevision: number | null;
}

/** The document a proposal created: a requisition, or a production order (#320), told apart by the proposal's kind. */
export type MrpProposalDocumentView = RequisitionView | ProductionOrderView;

interface Deps {
  em: EntityManager;
  purchaseRequisitionService: PurchaseRequisitionService;
  productionOrderService: ProductionOrderService;
}

/**
 * Turns one proposal of a run into its document (E19-S01's steps 7 and 8, shared with the automatic batch of
 * E19-S03): the document is created through its own service, tagged with the run, so every business rule and its
 * audit entry apply (R08), and the proposal is marked with the document's ID. Accept and the batch call it after
 * their own checks; it re-checks only that the proposal is executable, which no caller should ever miss.
 */
export class MrpProposalDocumentService {
  private readonly em: EntityManager;
  private readonly purchaseRequisitionService: PurchaseRequisitionService;
  private readonly productionOrderService: ProductionOrderService;

  constructor({ em, purchaseRequisitionService, productionOrderService }: Deps) {
    this.em = em;
    this.purchaseRequisitionService = purchaseRequisitionService;
    this.productionOrderService = productionOrderService;
  }

  /**
   * Creates proposal `proposal`'s document for run `runCode` and marks the proposal with it. The quantity is in the
   * base unit, so it is stored unconverted (R03), and the document is due on the need date (#322 keeps it for both
   * kinds, #320 Q1):
   * - a Buy proposal is an Open requisition required on its need date. Refusals are the requisition service's:
   *   `MATERIAL_INACTIVE`, `LOCATION_INACTIVE`, and `VALIDATION_FAILED` above the entry limit;
   * - a Make proposal is an Open production order pinned to the proposal's BOM and revision, finishing on its need
   *   date and starting the location's lead time before it (#320). Refusals are the production-order service's:
   *   the inactive masters, `PRODUCTION_REQUIRES_MAKE`, `PRODUCTION_NO_USABLE_BOM`, `PRODUCTION_BOM_CHANGED` and
   *   `VALIDATION_FAILED` (spec Q6).
   *
   * The mark is a native, tenant-filtered update inside the caller's transaction, so it needs no managed
   * recommendation and rolls back with the document.
   */
  async create(runCode: string, proposal: MrpProposalFields, actor: AuditActor): Promise<MrpProposalDocumentView> {
    if (!isExecutableProposal(proposal)) throw new Error(`MRP can't create a ${proposal.kind} proposal's document.`);
    const { material, location, quantity, needDate } = proposal;
    const { baseUnit } = await findMaterial(this.em, material);
    const origin = { mrpRun: runCode };
    let document: MrpProposalDocumentView;
    if (proposal.kind === "production-order") {
      const input = parseInput(productionOrderCreateSchema, {
        output: material, location, quantity, unit: baseUnit, plannedFinish: needDate, bom: proposal.bom, revision: proposal.bomRevision,
      });
      // The predicate guarantees the BOM, and the schema both halves of the pin.
      document = await this.productionOrderService.createFromMrp(input as typeof input & { bom: string; revision: number }, actor, origin);
    } else {
      const input = parseInput(requisitionCreateSchema, { material, location, quantity, unit: baseUnit, requiredDate: needDate });
      document = await this.purchaseRequisitionService.create(input, actor, origin);
    }
    await this.em.nativeUpdate(MrpRecommendation, { id: proposal.id }, { acceptedDocument: document.id });
    return document;
  }
}
