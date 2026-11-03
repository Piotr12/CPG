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
  /**
   * Proposed receipts (E16-S01), by material code, then location code, then need date: executable ones only,
   * every requisition and every feasible Make proposal (E17-S03).
   */
  proposals: readonly MrpProposal[];
  /**
   * The Make actions that can't execute (E17-S03, PRD §04 "Multilevel explosion"): kept apart from
   * `proposals`, never in a balance, by material, location and need date, then a `no-feasible-bom`-only one first.
   */
  provisional: readonly MrpProvisionalAction[];
  /**
   * What the plan can't do as the documents say (#277), or can't plan without guessing (E16-S03), in
   * `compareExceptions` order: by material, location, code rank, date, then transfer, then production order.
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
  /** The at-risk production orders behind the buckets' at-risk supply (E17-S03): shown, never counted. */
  atRiskOutput: readonly MrpProductionOutput[];
  /** The production orders' component needs behind the buckets' dependent demand (#277). */
  componentDemand: readonly MrpComponentDemand[];
  /** The Make proposals' component needs behind the rest of the buckets' dependent demand (E17-S01). */
  plannedComponentDemand: readonly MrpPlannedComponentDemand[];
  /** The transfers behind the buckets' transfer dispatch, at this source (#277). */
  transfersOut: readonly MrpTransferMovement[];
  /** The transfers behind the buckets' transfer receipt, at this destination (#277). */
  transfersIn: readonly MrpTransferMovement[];
  /** What the plan leaves uncovered, by date, then priority (E16-S02, `priority/rank-shortages.ts`); not stored, ranked on first read (#327). */
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
  /**
   * Output of production orders at risk (E17-S03): an open order whose pinned revision has an inactive
   * component. Shown, never counted in a balance; sizing adds it back, so the demand it was to cover is
   * blocked rather than replanned.
   */
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
 * What one Make proposal of `parent` at `location` needs of one component (E17-S01, PRD §04 "Multilevel
 * explosion"): the proposal's quantity times the line's per-output quantity, rounded upward once (R03,
 * BOM-007), on the proposal's planned start, at the same location.
 */
export interface MrpPlannedComponentDemand {
  /** The proposal's material. */
  parent: string;
  /**
   * The proposal's need date. A parent pair has one executable proposal per need date, but since E17-S03 a
   * provisional one can share it, so the date and `provisional` tell two parents' proposals apart.
   */
  parentNeedDate: string;
  /** The BOM and current revision the proposal was exploded through. */
  bom: string;
  bomRevision: number;
  material: string;
  location: string;
  /** The bucket it counts in: the proposal's planned start, never before today. */
  date: string;
  quantity: bigint;
  /**
   * The root priorities the parent proposal serves (#327, `priority/peg-proposals.ts`), each with its part of
   * `quantity`: in priority order, adding up to `quantity`, none zero and no two with one root.
   */
  roots: readonly MrpDemandShare[];
  /**
   * The need is provisional (E17-S03): a provisional action's that stays infeasible even with this component
   * supplied, since MRP can't supply something else it is short of (#369), or one sized only for a provisional
   * parent's need. The component's executable proposals never cover it. Like every need of a proposal with no
   * feasible BOM, real or not, it counts in the component's projection but never in a later feasibility test.
   */
  provisional: boolean;
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

/**
 * The material is on a cycle of active BOMs in stored data (E17-S01, R04, MRP-028): its Make pair at
 * `location` gets no proposal, so nothing on the cycle is exploded. `path` is a shortest cycle through
 * the material, in the BOM service's notation without descriptions: `M1 →(BOM B1) M2 →(BOM B2) M1`.
 */
export interface MrpBomCycle {
  code: "CYCLIC_BOM";
  material: string;
  location: string;
  path: string;
}

/** One valid BOM's inactive components (E17-S02): the BOM and revision, then the materials' codes in code order. */
export interface MrpInactiveBom {
  bom: string;
  revision: number;
  materials: readonly string[];
}

/**
 * A Make pair's proposal whose BOMs valid on its planned finish `date` all have an inactive component
 * (E17-S02, LFC-026, MRP-050): the pair gets no proposal, so nothing is exploded. `inactive` lists those
 * BOMs in priority order, then BOM code.
 */
export interface MrpMissingUsableBom {
  code: "MISSING_USABLE_BOM";
  material: string;
  location: string;
  date: string;
  inactive: readonly MrpInactiveBom[];
}

/**
 * The proposal of the pair needed on `date` has usable BOMs, but none whose components can all be supplied
 * on its planned start (E17-S02, BOM-011): it is kept and exploded provisionally through its highest-priority
 * usable BOM. `rejections` are every BOM valid on its planned finish, in priority order, then BOM code.
 */
export interface MrpNoFeasibleBom {
  code: "NO_FEASIBLE_BOM";
  material: string;
  location: string;
  date: string;
  rejections: readonly MrpBomRejection[];
}

/**
 * At-Risk Existing Production / Inactive BOM Component (E17-S03, MRP-051, LFC-027): the open production
 * order `order` of the pair pins a revision with an inactive component, so its unproduced balance `quantity`
 * is at-risk supply, never dependable, and the demand it was to cover gets no replacement. `date` is the
 * order's own planned finish; only an order whose output counts inside the horizon raises it.
 */
export interface MrpAtRiskProduction {
  code: "AT_RISK_PRODUCTION";
  material: string;
  location: string;
  date: string;
  order: string;
  quantity: bigint;
  /** The pinned revision's inactive components, in code order. */
  inactiveComponents: readonly string[];
}

/** An MRP exception: `exceptions/codes.ts` lists the codes, their messages and their rank. */
export type MrpException =
  | MrpInvalidUomConversion
  | MrpMissingPlanningParameters
  | MrpMissingBom
  | MrpMissingUsableBom
  | MrpBomCycle
  | MrpNoFeasibleBom
  | MrpAtRiskProduction
  | MrpInsufficientTransferStock;

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

/**
 * Late Requisition (#322): an Open requisition, not yet overdue, required sooner than its Buy pair's lead
 * time allows from the run's first day, timed by a proposal's own rule (`scheduleProposal`). It counts on
 * its own date, `date`, as a document accepted from a Late Supply proposal does (spec Q1).
 */
export interface MrpLateRequisition {
  code: "LATE_REQUISITION";
  material: string;
  location: string;
  date: string;
  /** The requisition's business ID. */
  document: string;
  /** Its required date. */
  plannedDate: string;
  /** The earliest date its lead time allows from the run's first day. */
  plannedFinish: string;
  lateDays: number;
  quantity: bigint;
}

/** An MRP warning (E18-S02): stored with the run, shown as a mark, never listed among its exceptions. */
export type MrpWarning = MrpOverdueSupply | MrpOverdueTransfer | MrpLateRequisition;

/**
 * What an uncovered requirement is, in the order MRP serves them on a day (PRD §04 "Overdue demand and
 * priority", E16-S02): open documents' needs first, then customer orders, then the forecast residual, then
 * the safety-stock target. A Make proposal's component need (E17-S01) ranks as the root requirement each of
 * its shares serves (#327): `planned-component` only names it, and breaks a tie with the root's own kind.
 */
export const MRP_SHORTAGE_KINDS = ["component", "transfer", "customer-order", "planned-component", "forecast", "safety-target"] as const;
export type MrpShortageKind = (typeof MRP_SHORTAGE_KINDS)[number];

/** What can be at the root of a Make proposal's component need: every requirement kind but the planned component. */
export type MrpDemandRootKind = Exclude<MrpShortageKind, "planned-component">;

/**
 * The priority of a requirement at the root of a Make proposal's component need (#327, PRD §04 "Overdue demand
 * and priority"): what the top parent's units serve, carried unchanged down every level. It is the priority only,
 * kind and original date, never the document: requirements of one kind on one original date have equal business
 * priority (PRD §04, DEM-021), so a need holds one share per priority it serves, whatever the levels multiply.
 */
export interface MrpDemandRoot {
  kind: MrpDemandRootKind;
  /** The priority date, as `MrpShortage.originalDate` has it for the kind; for the target, the proposal's need date. */
  originalDate: string;
}

/** The part of a need that serves one root priority (#327). */
export interface MrpDemandShare {
  root: MrpDemandRoot;
  quantity: bigint;
}

/** One requirement that stock, existing supply and the proposals received by its day can't cover on that day (E16-S02). */
export interface MrpShortage {
  kind: MrpShortageKind;
  /** The bucket the requirement counts in. */
  date: string;
  /**
   * Its priority date: the order line's required date, the forecast's own date, the production order's
   * start or the transfer's planned dispatch, kept when it counts today; a planned component's root's
   * (#327); the day itself for the target.
   */
  originalDate: string;
  /**
   * The customer order's, production order's or transfer's business ID, or a planned component's parent
   * material; `null` for a forecast and the target.
   */
  document: string | null;
  /** The order line's position; `null` for every other kind. */
  position: number | null;
  /** What the requirement needs that day: its quantity, a planned component's share, or the target in force. */
  required: bigint;
  /** What the day leaves of it uncovered: above zero, at most `required`. */
  uncovered: bigint;
  /** A planned component's root priority (#327); `null` for every other kind. */
  root: MrpDemandRoot | null;
}

/** What a proposal would create: never a transfer (N06, TRF-018) and never a purchase order (MRP-030). */
export const MRP_PROPOSAL_KINDS = ["purchase-requisition", "production-order"] as const;
export type MrpProposalKind = (typeof MRP_PROPOSAL_KINDS)[number];

/**
 * A proposed receipt (E16-S01), sized by `sizing/size-proposals.ts`, timed by `sizing/schedule-proposal.ts`
 * (E16-S02) and, when it is a production order, exploded by `explosion/explode-proposal.ts` (E17-S01).
 */
export interface MrpProposal extends MrpProposalTiming, MrpProposalRecipe {
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
 * The recipe a proposal is exploded through (E17-S01, MRP-031) and how it was chosen (E17-S02): `null`
 * and empty for a requisition.
 */
export interface MrpProposalRecipe {
  /** The BOM's business ID. */
  bom: string | null;
  /** Its current revision's number. */
  bomRevision: number | null;
  /**
   * Its components can all be supplied on the planned start (`chooseBom`): `true` for every production-order
   * proposal, since one that can't be supplied is a provisional action instead (E17-S03); `null` for a
   * requisition. Not stored.
   */
  feasible: boolean | null;
  /** Every BOM tested before `bom`, in order, each with why it was passed over (BOM-010). Not stored. */
  rejectedBoms: readonly MrpBomRejection[];
}

/** What one component of a BOM lacks for a proposal (E17-S02): the production dialog's names (`componentRequirement`). */
export interface MrpComponentShortfall {
  material: string;
  /** The proposal's lot-rounded quantity times the line, rounded up once (R03). */
  required: bigint;
  /** What the component can give from the proposal's planned start, never below zero (`lowestDependableBalances`). */
  available: bigint;
  /** `required − available`, above zero. */
  shortage: bigint;
}

/**
 * Why `chooseBom` passed over a BOM valid on the proposal's planned finish (E17-S02, PRD §04 "BOM choice
 * and explanation"): an inactive component, or components it can't be supplied with, by component code.
 */
export type MrpBomRejection =
  | { bom: string; revision: number; reason: "inactive-component"; materials: readonly string[] }
  | { bom: string; revision: number; reason: "shortage"; shortages: readonly MrpComponentShortfall[] };

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

/**
 * Why a provisional action can't execute (E17-S03): no usable BOM can supply it (`no-feasible-bom`), or it
 * was sized only for a provisional parent's need (`provisional-demand`).
 */
export const MRP_PROVISIONAL_BLOCKERS = ["no-feasible-bom", "provisional-demand"] as const;
export type MrpProvisionalBlocker = (typeof MRP_PROVISIONAL_BLOCKERS)[number];

/** What one provisional action would need of one component, on its planned start (the explosion's figure). */
export interface MrpProvisionalComponent {
  material: string;
  quantity: bigint;
}

/**
 * A hypothetical production order of a provisional plan (E17-S03, MRP-047, BOM-011): sized and timed like
 * a proposal and exploded through `bom`, its component needs provisional unless MRP can supply all it is short
 * of (#369), but never executable, never a receipt in any balance and never a claim on a component.
 */
export interface MrpProvisionalAction extends MrpProposalTiming {
  kind: "production-order";
  material: string;
  location: string;
  /** The day it would cover: one action per pair, need date and kind of sizing. */
  needDate: string;
  quantity: bigint;
  leadTimeDays: number;
  /** The highest-priority usable BOM it is exploded through, or the feasible one `chooseBom` chose. */
  bom: string;
  bomRevision: number;
  /** Its components' needs, by material code. */
  components: readonly MrpProvisionalComponent[];
  /** In `MRP_PROVISIONAL_BLOCKERS` order, never empty (a stored row a newer image wrote may read back with none this image knows). */
  blockers: readonly MrpProvisionalBlocker[];
  /** Every BOM `chooseBom` passed over, as on a proposal; with `no-feasible-bom`, every valid BOM. */
  rejectedBoms: readonly MrpBomRejection[];
}
