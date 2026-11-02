import { MrpRecommendation, type EntityManager, type MrpRecommendationKind } from "@cpg/db";
import { isExecutableProposal } from "../../domain/mrp/acceptance/executable-proposal";
import { parseInput } from "../../http/parse-input";
import { requisitionCreateSchema } from "../../validators/purchasing/purchase-requisition.schema";
import type { AuditActor } from "../audit/actor";
import { findMaterial } from "../materials/find-material";
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
}

interface Deps {
  em: EntityManager;
  purchaseRequisitionService: PurchaseRequisitionService;
}

/**
 * Turns one proposal of a run into its document (E19-S01's steps 7 and 8, shared with the automatic batch of
 * E19-S03): the document is created through its own service, tagged with the run, so every business rule and its
 * audit entry apply (R08), and the proposal is marked with the document's ID. Accept and the batch call it after
 * their own checks; it re-checks only that the kind is executable, which no caller should ever miss.
 */
export class MrpProposalDocumentService {
  private readonly em: EntityManager;
  private readonly purchaseRequisitionService: PurchaseRequisitionService;

  constructor({ em, purchaseRequisitionService }: Deps) {
    this.em = em;
    this.purchaseRequisitionService = purchaseRequisitionService;
  }

  /**
   * Creates proposal `proposal`'s document for run `runCode` and marks the proposal with it. A Buy proposal is an
   * Open requisition for its quantity in the base unit (unconverted, R03), required on its need date (#322 keeps
   * the need date). Refusals are the document service's own: `MATERIAL_INACTIVE`, `LOCATION_INACTIVE`, and
   * `VALIDATION_FAILED` above the entry limit. The mark is a native, tenant-filtered update inside the caller's
   * transaction, so it needs no managed recommendation and rolls back with the document.
   */
  async create(runCode: string, proposal: MrpProposalFields, actor: AuditActor): Promise<RequisitionView> {
    if (!isExecutableProposal(proposal.kind)) throw new Error(`MRP can't create a ${proposal.kind} proposal's document.`);
    const { material, location, quantity, needDate } = proposal;
    const { baseUnit } = await findMaterial(this.em, material);
    const input = parseInput(requisitionCreateSchema, { material, location, quantity, unit: baseUnit, requiredDate: needDate });
    const document = await this.purchaseRequisitionService.create(input, actor, { mrpRun: runCode });
    await this.em.nativeUpdate(MrpRecommendation, { id: proposal.id }, { acceptedDocument: document.id });
    return document;
  }
}
