import { Supplier, type EntityManager } from "@cpg/db";
import { ConflictError } from "../../http/errors";
import { findNamedRecord, type NamedRecordLookup } from "../named-records/find-named-record";

/** How a supplier is found and named in errors; `SupplierService` builds its kind on it. */
export const SUPPLIER_LOOKUP = { entity: Supplier, noun: "supplier", codePrefix: "SUPPLIER" } satisfies NamedRecordLookup;

/** The supplier with business ID `id` in `em`'s tenant, or `SUPPLIER_NOT_FOUND`: another tenant's ID too (TEN-014). */
export async function findSupplier(em: EntityManager, id: string): Promise<Supplier> {
  return (await findNamedRecord(em, SUPPLIER_LOOKUP, id)) as Supplier;
}

/**
 * `findSupplier` for a new document that names the supplier: an inactive one can't be picked
 * (BUY-025, LFC-023), so it is `SUPPLIER_INACTIVE`. Documents made before stay valid (LFC-021).
 */
export async function findActiveSupplier(em: EntityManager, id: string): Promise<Supplier> {
  const supplier = await findSupplier(em, id);
  if (!supplier.active) {
    throw new ConflictError(`Supplier ${id} is inactive, so it can't be picked for new entries.`, "SUPPLIER_INACTIVE");
  }
  return supplier;
}
