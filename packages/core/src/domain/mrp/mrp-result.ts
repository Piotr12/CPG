import type { MrpRecordKind } from "./mrp-inputs";

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
  /** Proposed receipts (E16-S01), by material code, then location code, then need date. */
  proposals: readonly MrpProposal[];
  /**
   * What the plan can't do as the documents say (#277), or can't plan without guessing (E16-S03), in
   * `compareExceptions` order: by material, location, code rank, date, then transfer.
   */
  exceptions: readonly MrpException[];
  /**
   * What the plan counts as the documents say but late (E18-S02): every overdue supply item of a
   * readable material, in `compareWarnings` order. A warning never stops a proposal.
   */
  warnings: readonly MrpWarning[];
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
  /** What the plan leaves uncovered, by date, then priority (E16-S02, `priority/rank-shortages.ts`); not stored. */
  shortages: readonly MrpShortage[];
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
  code: "INSUFFICIENT_TRANSFER_STOCK";
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

/**
 * A stored row of the material couldn't be read (E16-S03, MRP-036): a quantity or a date that isn't
 * valid, or a unit factor that isn't above zero. Raised on every planned pair of the material, needed
 * or not; the row is left out and nothing is guessed in its place.
 */
export interface MrpInvalidUomConversion {
  code: "INVALID_UOM_CONVERSION";
  material: string;
  location: string;
  /** The kind of the first unreadable row of the material (spec Q8). */
  record: MrpRecordKind;
  /** Its business ID, `order/position` for a line; absent for a balance, a forecast or a target. */
  document?: string;
}

/** Why a pair has no usable planning parameter set (E16-S03, spec Q5). */
export type MrpMissingParametersReason = "no-set" | "raw-make" | "invalid-set";

/**
 * The pair has no usable planning parameter set (MAT-017, MRP-034, MRP-033): with `no-set` only when
 * it needs supply, otherwise always. `date` is the first day it needs supply, absent when it doesn't.
 */
export interface MrpMissingPlanningParameters {
  code: "MISSING_PLANNING_PARAMETERS";
  material: string;
  location: string;
  date?: string;
  reason: MrpMissingParametersReason;
}

/** A Make pair's proposal has no active BOM whose current revision is valid on its need date `date` (MRP-035). */
export interface MrpMissingBom {
  code: "MISSING_BOM";
  material: string;
  location: string;
  date: string;
}

/** An MRP exception: `exceptions/codes.ts` lists the codes, their messages and their rank. */
export type MrpException = MrpInvalidUomConversion | MrpMissingPlanningParameters | MrpMissingBom | MrpInsufficientTransferStock;

/** The document behind an overdue supply item: what `MrpSupply` or `MrpProductionOutput` counts. */
export type MrpOverdueSource = "purchase-order" | "requisition" | "production-order";

/**
 * Overdue Supply (MRP-015, MRP-016, BUY-019): an open document's remainder whose own date has passed,
 * counted on the run's first day, `date`. It keeps the document's date and the quantity counted.
 */
export interface MrpOverdueSupply {
  code: "OVERDUE_SUPPLY";
  material: string;
  location: string;
  date: string;
  source: MrpOverdueSource;
  /** The purchase order's, requisition's or production order's business ID. */
  document: string;
  /** The purchase-order line's position; absent for a requisition or a production order. */
  position?: number;
  /** The document's own date: the line's planned date, the requisition's required date, or the order's planned finish. */
  plannedDate: string;
  quantity: bigint;
}

/**
 * Overdue Transfer (MRP-040, TRF-016): a transfer arrival whose planned day has passed, counted at the
 * destination (`location`) on the run's first day, `date`.
 */
export interface MrpOverdueTransfer {
  code: "OVERDUE_TRANSFER";
  material: string;
  location: string;
  date: string;
  transfer: string;
  stage: MrpTransferMovement["stage"];
  /** The planned arrival. */
  plannedDate: string;
  quantity: bigint;
}

/** An MRP warning (E18-S02): stored with the run, shown as a mark, never listed among its exceptions. */
export type MrpWarning = MrpOverdueSupply | MrpOverdueTransfer;

/**
 * What an uncovered requirement is, in the order MRP serves them on a day (PRD §04 "Overdue demand and
 * priority", E16-S02): open documents' needs first, then customer orders, then the forecast residual,
 * then the safety-stock target.
 */
export const MRP_SHORTAGE_KINDS = ["component", "transfer", "customer-order", "forecast", "safety-target"] as const;
export type MrpShortageKind = (typeof MRP_SHORTAGE_KINDS)[number];

/** One requirement that stock, existing supply and the proposals received by its day can't cover on that day (E16-S02). */
export interface MrpShortage {
  kind: MrpShortageKind;
  /** The bucket the requirement counts in. */
  date: string;
  /**
   * Its priority date: the order line's required date, the forecast's own date, the production order's
   * start or the transfer's planned dispatch, kept when it counts today; the day itself for the target.
   */
  originalDate: string;
  /** The customer order's, production order's or transfer's business ID; `null` for a forecast and the target. */
  document: string | null;
  /** The order line's position; `null` for every other kind. */
  position: number | null;
  /** What the requirement needs that day: its quantity, or the target in force. */
  required: bigint;
  /** What the day leaves of it uncovered: above zero, at most `required`. */
  uncovered: bigint;
}

/** What a proposal would create: never a transfer (N06, TRF-018) and never a purchase order (MRP-030). */
export const MRP_PROPOSAL_KINDS = ["purchase-requisition", "production-order"] as const;
export type MrpProposalKind = (typeof MRP_PROPOSAL_KINDS)[number];

/** A proposed receipt (E16-S01), sized by `sizing/size-proposals.ts` and timed by `sizing/schedule-proposal.ts` (E16-S02). */
export interface MrpProposal extends MrpProposalTiming {
  kind: MrpProposalKind;
  material: string;
  location: string;
  /** The day the balance after earlier proposals falls below that day's target: what the receipt must cover. It never moves (MRP-037). */
  needDate: string;
  /** Above zero, never below the need (R03, MAT-025). */
  quantity: bigint;
  /** The pair's lead time in whole calendar days (N04, MAT-018). */
  leadTimeDays: number;
}

/**
 * When a proposal can start and finish (E16-S02, PRD §04 "Overdue and late starts"). Its receipt counts
 * on `plannedFinish`, unless that is beyond the horizon, where it counts in no bucket.
 */
export interface MrpProposalTiming {
  /** `needDate` less the lead time in calendar days, never before today (MRP-038). */
  plannedStart: string;
  /** `needDate` when the lead time allows it; otherwise today plus the lead time, the earliest feasible finish. */
  plannedFinish: string;
  /** Late Supply: the calendar days from `needDate` to `plannedFinish`, zero when on time (MRP-037). */
  lateDays: number;
  /** Beyond Horizon: `plannedFinish` is after day 89, so the receipt is shown but never in a bucket (MRP-049). */
  beyondHorizon: boolean;
}
