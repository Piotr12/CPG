import { CustomerOrder, CustomerOrderLine, type EntityManager, type Material, type NamedRecord } from "@cpg/db";
import { parseDecimal } from "../../domain/quantities/decimal";
import { ConflictError } from "../../http/errors";

/** One order referencing the material, including removed lines: historical units must stay valid. */
export async function orderUsingMaterial(em: EntityManager, material: Material): Promise<string | null> {
  const line = await em.findOne(CustomerOrderLine, { material }, { populate: ["order"] });
  return line?.order.code ?? null;
}

/** An Open order with outstanding demand blocks deactivation of its material (LFC-014). */
export async function assertNoCustomerDemand(em: EntityManager, material: Material): Promise<void> {
  let after: string | undefined;
  for (;;) {
    // A detached batch bounds identity-map memory while preserving the caller's transaction and tenant filter.
    const lines = await em.find(CustomerOrderLine, { material, removed: false, status: "open", order: { status: "open" },
      ...(after === undefined ? {} : { id: { $gt: after } }) },
    { populate: ["order"], orderBy: { id: "asc" }, limit: 100, disableIdentityMap: true });
    if (lines.length === 0) return;
    const demand = lines.find((line) => parseDecimal(line.quantity)! > parseDecimal(line.fulfilled)! + parseDecimal(line.abandoned)!);
    if (demand) throw new ConflictError(`Customer order ${demand.order.code} has outstanding demand for this material.`, "MATERIAL_HAS_CUSTOMER_DEMAND");
    after = lines.at(-1)!.id;
  }
}

/** An unfinished direct order reference blocks location deactivation; customers remain independent. */
export async function assertNoCustomerOrdersAtLocation(em: EntityManager, location: NamedRecord): Promise<void> {
  const order = await em.findOne(CustomerOrder, { location: location.id, status: "open" }, { orderBy: { code: "asc" } });
  if (order) throw new ConflictError(`Customer order ${order.code} is still Open at this location.`, "LOCATION_HAS_CUSTOMER_ORDERS");
}
