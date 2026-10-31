/**
 * What `planMrp` returns (#273). Every figure is base-unit micro-units (R03); E14-S02 stores each one
 * as a six-decimal text. The bucket carries every figure the MRP stories fill, so its shape never
 * changes for them: this story fills firm demand and the balances, and the others stay zero until
 * the story named beside them.
 */
export interface MrpResult {
  today: string;
  /** The 90 horizon dates, today through day 89. */
  dates: readonly string[];
  /** One plan per planned material and location, by material code, then location code. */
  plans: readonly MrpPlan[];
  /** Proposed receipts; none until E16-S01 sizes them. */
  proposals: readonly MrpProposal[];
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
  /** The production orders behind the production part of the buckets' dependable supply (#277). */
  productionOutput: readonly MrpProductionOutput[];
  /** The production orders' component needs behind the buckets' dependent demand (#277). */
  componentDemand: readonly MrpComponentDemand[];
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

/** A proposed receipt. E16-S01 adds its kind, need date and lead time; E16-S02 its timing marks. */
export interface MrpProposal {
  material: string;
  location: string;
  date: string;
  quantity: bigint;
}
