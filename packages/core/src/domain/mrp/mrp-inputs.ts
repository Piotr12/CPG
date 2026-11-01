import type { MaterialType } from "../../validators/materials/material-fields.schema";
import type { DocumentState } from "../document-lifecycle/lifecycle";
import type { ProcurementMode } from "../planning-parameters/procurement";
import type { MrpPair } from "./projection/pairs";

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
  /** Every planning parameter set of the tenant, one per material and location (E16-S01). */
  planningParameters: readonly MrpPlanningParameters[];
  /** The current revision of every active BOM, for the Missing BOM check (E16-S03) and the explosion (E17-S01). */
  boms: readonly MrpBom[];
  /** Every stored row the loader couldn't read, left out of the lists above (E16-S03). */
  unreadable: readonly MrpUnreadableRow[];
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

/**
 * How one material is planned at one location (E03-S03), with the material's type so the engine
 * applies R02 itself (E16-S01). The validators keep `minimumQuantity` at zero or more and
 * `lotMultiple` above zero on every entry path, and the demo seed's sets pass them too.
 */
export interface MrpPlanningParameters {
  material: string;
  location: string;
  materialType: MaterialType;
  procurement: ProcurementMode;
  /** Whole calendar days (MAT-018), carried to each proposal for E16-S02. */
  leadTimeDays: number;
  minimumQuantity: bigint;
  lotMultiple: bigint;
}

/**
 * One active BOM's current revision (R04): its validity for the Missing BOM check (E16-S03), and its
 * priority and lines for the explosion (E17-S01). A revision with a line the loader couldn't read is
 * never here (#281 spec Q8).
 */
export interface MrpBom {
  /** The BOM's business ID. */
  bom: string;
  /** The current revision's number. */
  revision: number;
  /** 1 is the highest (R04). */
  priority: number;
  output: string;
  validFrom: string;
  /** `null` when open-ended. */
  validThrough: string | null;
  /** Every line's material is active: the production dialog offers only such recipes (#281 spec Q4). */
  componentsActive: boolean;
  /** `perOutput` of each component for one base unit of `output`, in the component's base unit. */
  components: readonly MrpComponentLine[];
}

/** The kinds of stored row the snapshot reads quantities, factors or dates from (E16-S03, spec Q8). */
export type MrpRecordKind =
  | "stock-balance"
  | "customer-order-line"
  | "forecast"
  | "safety-stock-target"
  | "purchase-requisition"
  | "purchase-order-line"
  | "production-order"
  | "bom-line"
  | "transfer";

/**
 * A stored row the loader couldn't read (E16-S03), at one pair it would feed: a row feeding several
 * pairs gives one entry per pair. Each entry names a plan, as a stock row does. A planning parameter
 * set's entry names no plan (parameters never do): its pair's set is unusable (`invalid-set`).
 */
export interface MrpUnreadableRow extends MrpPair {
  record: MrpRecordKind | "planning-parameter-set";
  /** The business ID, `order/position` for a line; absent for a balance, a forecast, a target or a set. */
  document?: string;
}
