import { DOCUMENT_PAGE_SIZE } from "@cpg/core/validators/shipments/shipment.schema";

/**
 * The requisition list's page that shows requisition `id`. The list is by ID, 100 to a page, and a
 * tenant's requisition IDs run from 00000001 without gaps, since none is ever deleted, so requisition
 * N is on page ⌈N / 100⌉.
 */
export function requisitionHref(tenant: string, id: string): string {
  return `/admin/${tenant}/purchase-requisitions?page=${Math.ceil(Number(id) / DOCUMENT_PAGE_SIZE)}`;
}
