import { PurchaseRequisition, type EntityManager } from "@cpg/db";
import { outstandingQuantity } from "../../domain/purchasing/requisition-quantity";
import { NotFoundError } from "../../http/errors";
import type { AuditEntry } from "../audit/audit-recorder";

/*
 * What the requisition service and the purchase-order service (which converts requisitions) both
 * need: finding, showing and auditing one. A leaf module, so neither service imports the other.
 */

/** A requisition as the screens and the API show it. `id` is its eight-digit business ID. */
export interface RequisitionView {
  id: string;
  material: string;
  location: string;
  /** The base-unit quantity, six decimals (R03). */
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
  requiredDate: string;
  /** How much purchase-order lines have taken, six decimals. */
  converted: string;
  /** What no line has taken yet, six decimals. */
  outstanding: string;
  status: PurchaseRequisition["status"];
  createdAt: Date;
  /** The optimistic-lock version an edit must carry back (AUD-024, API-029). */
  version: number;
}

/** A requisition this tenant doesn't have: an unknown ID, or another tenant's (TEN-014). */
export function requisitionNotFound(id: string): NotFoundError {
  return new NotFoundError("REQUISITION_NOT_FOUND", `There is no purchase requisition ${id} in this tenant.`);
}

/** The requisition with business ID `id` in `em`'s tenant, with its material and location, or `REQUISITION_NOT_FOUND`. */
export async function findRequisition(
  em: EntityManager,
  id: string,
  options: { refresh?: boolean } = {},
): Promise<PurchaseRequisition> {
  const requisition = await em.findOne(PurchaseRequisition, { code: id }, { ...options, populate: ["material", "location"] });
  if (!requisition) throw requisitionNotFound(id);
  return requisition;
}

export function toRequisitionView(requisition: PurchaseRequisition): RequisitionView {
  const { code, material, location, quantity, enteredQuantity, enteredUnit, numerator, denominator } = requisition;
  const { requiredDate, converted, status, createdAt, version } = requisition;
  return {
    id: code,
    material: material.code,
    location: location.code,
    quantity,
    enteredQuantity,
    enteredUnit,
    numerator,
    denominator,
    requiredDate,
    converted,
    outstanding: outstandingQuantity(quantity, converted),
    status: status as RequisitionView["status"],
    createdAt,
    version,
  };
}

/** The fields of a requisition the audit may show: an allowlist (R08). */
export function requisitionSnapshot(requisition: PurchaseRequisition) {
  const { code, material, location, quantity, requiredDate, converted, status } = requisition;
  return { id: code, material: material.code, location: location.code, quantity, requiredDate, converted, status };
}

export function requisitionEntry(
  action: string,
  requisition: PurchaseRequisition,
  before: AuditEntry["before"],
  after: AuditEntry["after"],
): AuditEntry {
  const { code, material, location } = requisition;
  return {
    action: `purchase-requisitions.purchase-requisition.${action}`,
    subject: { type: "PurchaseRequisition", id: code, label: `${code} — ${material.code} ${material.description} at ${location.code}` },
    before,
    after,
  };
}
