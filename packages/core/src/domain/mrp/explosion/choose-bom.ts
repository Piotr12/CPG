import { isRevisionValidOn, isUsableRevision } from "../../boms/bom-validity";
import { scaledMicro } from "../../production-orders/production-planning";
import type { MrpBom } from "../mrp-inputs";
import type { MrpBomRejection, MrpComponentShortfall, MrpProposal } from "../mrp-result";
import { compareCodes } from "../projection/pairs";

/** The BOM a production-order proposal plans through, whether its components can be supplied, and every BOM passed over before it. */
export interface BomChoice {
  bom: MrpBom;
  feasible: boolean;
  rejected: MrpBomRejection[];
}

/** What the choice reads of a timed production-order proposal. */
export type ChosenProposal = Pick<MrpProposal, "material" | "quantity" | "plannedFinish">;

/**
 * The BOM a production-order proposal plans through (E17-S02, PRD §04 "BOM choice and explanation"). The
 * candidates are the output's BOMs valid on the proposal's planned finish, the day Missing BOM checks, by
 * priority (1 is the highest, R04), then BOM code, which only keeps stored data deterministic. Each is tested
 * in turn at the proposal's lot-rounded quantity, never the need before rounding (MRP-046):
 *
 * - one with an inactive component isn't usable (`isUsableRevision`) and is passed over as
 *   `inactive-component` (MRP-050, LFC-025);
 * - otherwise each line needs `scaledMicro(perOutput, quantity)`, the explosion's and production orders'
 *   requirement (R03), and gets `available(material)`, never below zero. Lines needing more are a `shortage`
 *   (MRP-025, BOM-010), by component code. A revision has at most one line per material.
 *
 * The first BOM with no shortage is chosen and feasible, with the BOMs before it rejected (MRP-024). When
 * none is, the highest-priority usable BOM is returned infeasible, with every candidate rejected (BOM-011).
 * `replenishPair` raises Missing BOM or Missing Usable BOM before a proposal with no usable BOM, so one is a
 * programming error.
 */
export function chooseBom(proposal: ChosenProposal, boms: readonly MrpBom[], available: (component: string) => bigint): BomChoice {
  const candidates = validBoms(boms, proposal.plannedFinish);
  const rejected: MrpBomRejection[] = [];
  let firstUsable: MrpBom | undefined;
  for (const bom of candidates) {
    const { bom: code, revision } = bom;
    if (!isUsableRevision(bom, bom.inactiveComponents.length === 0, proposal.plannedFinish)) {
      rejected.push({ bom: code, revision, reason: "inactive-component", materials: bom.inactiveComponents });
      continue;
    }
    firstUsable ??= bom;
    const shortages = shortfalls(bom, proposal.quantity, available);
    if (shortages.length === 0) return { bom, feasible: true, rejected };
    rejected.push({ bom: code, revision, reason: "shortage", shortages });
  }
  if (!firstUsable) throw new Error(`No usable BOM of ${proposal.material} is valid on ${proposal.plannedFinish}, so Missing Usable BOM should have stopped its proposals.`);
  return { bom: firstUsable, feasible: false, rejected };
}

/** The BOMs valid on `date`, in the order they are tested: by priority (1 is the highest), then BOM code. */
export function validBoms(boms: readonly MrpBom[], date: string): MrpBom[] {
  return boms.filter((bom) => isRevisionValidOn(bom, date)).sort((a, b) => a.priority - b.priority || compareCodes(a.bom, b.bom));
}

/** Each line of `bom` whose need for `quantity` is more than its component can give, by component code. */
function shortfalls(bom: MrpBom, quantity: bigint, available: (component: string) => bigint): MrpComponentShortfall[] {
  const shortages: MrpComponentShortfall[] = [];
  for (const { material, perOutput } of bom.components) {
    const required = scaledMicro(perOutput, quantity);
    const balance = available(material);
    const usable = balance > 0n ? balance : 0n;
    if (required > usable) shortages.push({ material, required, available: usable, shortage: required - usable });
  }
  return shortages.sort((a, b) => compareCodes(a.material, b.material));
}
