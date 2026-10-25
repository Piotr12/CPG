import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { CustomerOrderLine } from "../customer-orders/customer-order-line.entity";
import { MATERIAL_UNIT_MAX } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";
import { Shipment } from "./shipment.entity";

const owned = tenantOwned();

/**
 * One line of a shipment: the `quantity` planned to go for one `orderLine` of the shipment's order,
 * six-decimal base-unit text (R03) with the entered quantity, unit and factor kept, and the base
 * quantity its goods issues have `issued` so far. `position` is the line's 0-based index; screens and
 * the API number it from 1.
 */
export const ShipmentLine = defineEntity({
  name: "ShipmentLine",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    shipment: () => p.manyToOne(Shipment),
    position: p.integer(),
    orderLine: () => p.manyToOne(CustomerOrderLine).index(),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
    issued: p.string().default("0.000000"),
  },
  uniques: [{ properties: ["shipment", "position"] }],
  /** Serve a list page's line read, `shipment IN (…)`, which SQLite would plan through the tenant alone (#247). */
  indexes: [{ properties: ["tenant", "shipment"] }],
});

export type ShipmentLine = InferEntity<typeof ShipmentLine>;
