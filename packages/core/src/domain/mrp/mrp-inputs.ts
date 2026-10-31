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
  /** Forecasts from the first day of today's month through day 89 (E15-S01). */
  forecasts: readonly MrpForecast[];
  /** Every safety-stock target effective on or before day 89 (E15-S01). */
  safetyTargets: readonly MrpSafetyTarget[];
  requisitions: readonly MrpRequisition[];
  purchaseOrderLines: readonly MrpPurchaseOrderLine[];
  productionOrders: readonly MrpProductionOrder[];
  transfers: readonly MrpTransfer[];
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
 * non-removed line to `netForecasts`, which this shape satisfies as a `ConsumingOrderLine`. The loader
 * passes the Open lines due before the end of day 89's month and the other lines due in the months a
 * counted forecast can fall in (#275).
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

/** A forecast of a material at a location on a day; it is a `DemandForecast`, so `netForecasts` takes it unchanged. */
export interface MrpForecast {
  material: string;
  location: string;
  date: string;
  quantity: bigint;
}

/** A safety-stock target, in force from `effectiveFrom` until the next one of its pair (DEM-015/016). */
export interface MrpSafetyTarget {
  material: string;
  location: string;
  effectiveFrom: string;
  quantity: bigint;
}

/**
 * A purchase requisition at its own location (BUY-001), whatever its status: the supply seam takes the
 * open ones (E15-S02). `converted` is what purchase-order lines have taken of it (BUY-003). `code` is
 * its business ID.
 */
export interface MrpRequisition {
  code: string;
  material: string;
  location: string;
  requiredDate: string;
  quantity: bigint;
  converted: bigint;
  abandoned: bigint;
  status: DocumentState;
}

/**
 * A purchase-order line with its order's location (BUY-006), whatever its status: the supply seam takes
 * the open ones (E15-S02). `plannedDate` is the current one, edits included (BUY-024); `received` may
 * exceed `quantity` (BUY-015). `(order, position)` is the line's business ID.
 */
export interface MrpPurchaseOrderLine {
  order: string;
  position: number;
  material: string;
  location: string;
  plannedDate: string;
  quantity: bigint;
  received: bigint;
  abandoned: bigint;
  status: DocumentState;
}

/**
 * A production order with its pinned BOM revision's lines, whatever its status (#277). Its output and
 * its inputs are both at `location`, the producing site. `quantity` is the target and `produced` what
 * completions have posted; `components` give each input's base quantity per base unit of output.
 */
export interface MrpProductionOrder {
  order: string;
  material: string;
  location: string;
  plannedStart: string;
  plannedFinish: string;
  quantity: bigint;
  produced: bigint;
  abandoned: bigint;
  status: DocumentState;
  components: readonly MrpComponentLine[];
}

/** One line of a pinned BOM revision: `perOutput` of `material` for one base unit of the output. */
export interface MrpComponentLine {
  material: string;
  perOutput: bigint;
}

/**
 * A transfer with its posting progress, whatever its status (#277): `quantity` is planned, and
 * `dispatched`, `received` and `writtenOff` are what its postings have moved. What is in transit,
 * `dispatched − received − writtenOff`, belongs to the transfer and to neither site (R09).
 */
export interface MrpTransfer {
  transfer: string;
  material: string;
  source: string;
  destination: string;
  plannedDispatch: string;
  plannedArrival: string;
  quantity: bigint;
  dispatched: bigint;
  received: bigint;
  writtenOff: bigint;
  abandoned: bigint;
  status: DocumentState;
}
