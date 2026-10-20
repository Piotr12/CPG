import { ProductionOrder, type EntityManager, type Material, type NamedRecord } from "@cpg/db";
import { ConflictError } from "../../http/errors";

/** Any output reference locks historic type/base units; terminal orders retain their history. */
export async function productionUsingMaterial(em: EntityManager, output: Material) {
  return (await em.findOne(ProductionOrder, { output }))?.code ?? null;
}
/** Only direct output/location references block deactivation; BOM components follow the existing BOM policy. */
export async function assertNoProductionOrders(em: EntityManager, reference: { output: Material } | { location: NamedRecord }) {
  const order = await em.findOne(ProductionOrder, { ...reference, status: "open" }, { orderBy: { code: "asc" } });
  if (order) {
    const code = "output" in reference ? "MATERIAL_HAS_PRODUCTION_ORDERS" : "LOCATION_HAS_PRODUCTION_ORDERS";
    throw new ConflictError(`Production order ${order.code} is still Open.`, code, { order: order.code });
  }
}
