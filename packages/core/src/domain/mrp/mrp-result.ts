/**
 * What `planMrp` returns (#273). Every figure is base-unit micro-units (R03); E14-S02 stores each one
 * as a six-decimal text. The bucket carries every figure the MRP stories fill, so its shape never
 * changes for them: E14-S01 filled firm demand and the balances; each other figure stays zero until
 * the story named beside it.
 */
export interface MrpResult {
  today: string;
  /** The 90 horizon dates, today through day 89. */
  dates: readonly string[];
  /** One plan per planned material and location, by material code, then location code. */
  plans: readonly MrpPlan[];
  /** Proposed receipts; none until E16-S01 sizes them. */
  proposals: readonly MrpProposal[];
  /** What the plan can't do as the documents say, by date, then document (#277); E16-S03 adds the other kinds. */
  exceptions: readonly MrpException[];
}

export interface MrpPlan {
  material: string;
  location: string;
  /** Today's physical stock: the opening balance of day 0. */
  physical: bigint;
  /** Exactly 90, in date order. */
  buckets: readonly MrpBucket[];
  /** The order lines behind the buckets' firm demand. */
  firmDemand: readonly MrpFirmDemand[];
  /** The forecast residuals behind the buckets' forecast demand (E15-S01). */
  forecastDemand: readonly MrpForecastDemand[];
  /** The document lines behind the buckets' tentative and dependable supply (E15-S02). */
  supply: readonly MrpSupply[];
  /** The production orders behind the production part of the buckets' dependable supply (#277). */
  productionOutput: readonly MrpProductionOutput[];
  /** The production orders' component needs behind the buckets' dependent demand (#277). */
  componentDemand: readonly MrpComponentDemand[];
  /** The transfers behind the buckets' transfer dispatch, at this source (#277). */
  transfersOut: readonly MrpTransferMovement[];
  /** The transfers behind the buckets' transfer receipt, at this destination (#277). */
  transfersIn: readonly MrpTransferMovement[];
}

/** One day of one material at one location. */
export interface MrpBucket {
  date: string;
  /** Open customer-order lines, overdue ones today (E14-S01). */
  firmDemand: bigint;
  /** Forecast residual after D08 netting (E15-S01). */
  forecastDemand: bigint;
  /** Components of open production orders (E15-S03) and of Make proposals (E17-S01). */
  dependentDemand: bigint;
  /** Planned transfer dispatch at the source (E15-S03). */
  transferOut: bigint;
  /** Open purchase requisitions (E15-S02). */
  tentativeSupply: bigint;
  /** Purchase orders (E15-S02) and executable production output (E15-S03). */
  dependableSupply: bigint;
  /** Output of production orders at risk (E17-S03): shown, never counted in the balance. */
  atRiskSupply: bigint;
  /** Planned transfer receipt at the destination (E15-S03). */
  transferIn: bigint;
  /** Proposals received this day (E16-S01). */
  proposedReceipts: bigint;
  /** The safety-stock target in force this day (E15-S01): a level the balance is compared with, not a flow. */
  safetyTarget: bigint;
  /** The balance at the end of the day, before proposals; it may be negative. */
  projectedBefore: bigint;
  /** `projectedBefore` plus every proposed receipt up to this day. */
  projectedAfter: bigint;
  /** How far `projectedBefore` is below zero; zero when it isn't. */
  shortage: bigint;
}

/** The outstanding part of one open order line, in the bucket it counts in. */
export interface MrpFirmDemand {
  order: string;
  position: number;
  material: string;
  location: string;
  /** The line's own date, kept for D08 forecast consumption (SAL-017, E15-S01). */
  requiredDate: string;
  /** The bucket it counts in: `requiredDate`, or today when the line is overdue. */
  date: string;
  quantity: bigint;
}

/** What is left of one forecast once its month's orders consumed it (D08), in the bucket it counts in. */
export interface MrpForecastDemand {
  material: string;
  location: string;
  /** The forecast's own date, kept when its residual counts today. */
  forecastDate: string;
  /** The bucket it counts in: `forecastDate`, or today for an earlier residual of this month. */
  date: string;
  /** The forecast as entered, before consumption. */
  forecastQuantity: bigint;
  /** The residual counted on `date`: above zero, at most `forecastQuantity`. */
  quantity: bigint;
}

/**
 * The outstanding part of one open supply document line, in the bucket it counts in (E15-S02). A
 * requisition is tentative supply; a purchase-order line dependable. Production output, also dependable,
 * has its own list (`MrpPlan.productionOutput`, #277).
 */
export interface MrpSupply {
  kind: "requisition" | "purchase-order";
  reliability: "tentative" | "dependable";
  /** The requisition's or the purchase order's business ID. */
  document: string;
  /** The purchase-order line's position; `null` for a requisition, which has no lines. */
  position: number | null;
  material: string;
  location: string;
  /** The document's own required or planned date, kept when it has passed (PRD §04). */
  plannedDate: string;
  /** The bucket it counts in: `plannedDate`, or today when that has passed. */
  date: string;
  /** The Overdue Supply marker: `plannedDate` is before today (MRP-015, BUY-019). */
  overdue: boolean;
  quantity: bigint;
}

/** An open production order's unproduced balance, expected on its finish day (#277). */
export interface MrpProductionOutput {
  order: string;
  material: string;
  location: string;
  /** The order's own finish day, kept when it is overdue (MRP-016). */
  plannedFinish: string;
  /** The bucket it counts in: `plannedFinish`, or today when overdue. */
  date: string;
  quantity: bigint;
  /** The Overdue Supply marker: the finish day has passed and output is still pending. */
  overdue: boolean;
}

/** What an open production order's unproduced balance needs of one pinned component, on its start day (#277). */
export interface MrpComponentDemand {
  order: string;
  material: string;
  location: string;
  /** The order's own start day, kept when it is overdue (MRP-022). */
  plannedStart: string;
  /** The bucket it counts in: `plannedStart`, or today when overdue. */
  date: string;
  quantity: bigint;
  overdue: boolean;
}

/**
 * One leg of an open transfer at one site (#277): stock in transit arriving at the destination, or the
 * source-feasible part of the undispatched quantity leaving the source and arriving at the destination.
 */
export interface MrpTransferMovement {
  transfer: string;
  material: string;
  /** The source for a dispatch, the destination for a receipt. */
  location: string;
  stage: "in-transit" | "planned";
  /** The transfer's own day: planned dispatch for a dispatch, planned arrival for a receipt. */
  plannedDate: string;
  /** The bucket it counts in: `plannedDate`, or today when overdue. */
  date: string;
  quantity: bigint;
  /** The day has passed; on a receipt it is the Overdue Transfer warning (TRF-016, MRP-040). */
  overdue: boolean;
}

/**
 * A transfer whose source can't supply its undispatched quantity on the dispatch day (TRF-017,
 * MRP-039): only `available` is projected at either site, and the transfer itself is never changed.
 */
export interface MrpInsufficientTransferStock {
  kind: "insufficient-transfer-stock";
  transfer: string;
  material: string;
  source: string;
  destination: string;
  /** The dispatch day the source was checked on. */
  date: string;
  /** The undispatched quantity the transfer plans. */
  planned: bigint;
  /** The source's dependable balance that day, never below zero: less than `planned`. */
  available: bigint;
}

/** An MRP exception. */
export type MrpException = MrpInsufficientTransferStock;

/** A proposed receipt. E16-S01 adds its kind, need date and lead time; E16-S02 its timing marks. */
export interface MrpProposal {
  material: string;
  location: string;
  date: string;
  quantity: bigint;
}
