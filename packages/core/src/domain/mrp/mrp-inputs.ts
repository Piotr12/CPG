import type { DocumentState } from "../document-lifecycle/lifecycle";

/**
 * The snapshot MRP plans from (#273). Materials, locations and orders appear by business ID, never by
 * UUID, so results sort deterministically; every quantity is base-unit micro-units (R03) and every date
 * a zero-padded ISO `YYYY-MM-DD` text, which compares correctly as a string. The snapshot loader
 * (E14-S02) builds it; each later MRP story adds its own input list as one property here.
 */
export interface MrpInputs {
  stock: readonly MrpStock[];
  orderLines: readonly MrpOrderLine[];
}

/** Physical on-hand of one material at one location today. In-transit stock is never physical. */
export interface MrpStock {
  material: string;
  location: string;
  physical: bigint;
}

/**
 * A customer-order line with its order's location (SAL-004), whatever its status, removed lines
 * included: firm demand takes the open, non-removed ones, and forecast netting (E15-S01) passes every
 * non-removed line to `netForecasts`, which this shape satisfies as a `ConsumingOrderLine`.
 * `(order, position)` is the line's business ID.
 */
export interface MrpOrderLine {
  order: string;
  position: number;
  material: string;
  location: string;
  requiredDate: string;
  quantity: bigint;
  fulfilled: bigint;
  abandoned: bigint;
  status: DocumentState;
  removed: boolean;
}
