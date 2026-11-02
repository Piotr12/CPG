import { rejectionDetails } from "../exceptions/stored-exception";
import type { MrpProposal } from "../mrp-result";

/**
 * The code a feasible fallback's rejections are stored under in `mrp_run_exception` (E18-S03 spec Q1), after
 * the run's provisional actions: one row per production-order proposal that passed over a BOM, on its need
 * date. The read attaches it to that proposal (one per pair and need date), never to the plan's exceptions.
 */
export const MRP_BOM_REJECTIONS_CODE = "BOM_REJECTIONS";

export function isMrpBomRejectionsCode(code: string): code is typeof MRP_BOM_REJECTIONS_CODE {
  return code === MRP_BOM_REJECTIONS_CODE;
}

/** A proposal's rejections as an `MrpRunException` row stores them: `rejectionDetails`' notation, dated at its need date. */
export interface StoredBomRejections {
  code: typeof MRP_BOM_REJECTIONS_CODE;
  material: string;
  location: string;
  date: string;
  details: Record<string, string>;
}

/** `proposal`'s rejections as a stored row, or null when it passed over nothing (a requisition, or its first BOM). */
export function toStoredBomRejections(proposal: Pick<MrpProposal, "material" | "location" | "needDate" | "rejectedBoms">): StoredBomRejections | null {
  const { material, location, needDate, rejectedBoms } = proposal;
  if (rejectedBoms.length === 0) return null;
  return { code: MRP_BOM_REJECTIONS_CODE, material, location, date: needDate, details: rejectionDetails(rejectedBoms) };
}

/** One component a rejected BOM couldn't be supplied with: six-decimal BUoM texts (R03). */
export interface MrpComponentShortfallView {
  material: string;
  required: string;
  available: string;
  shortage: string;
}

/** One BOM MRP passed over, and why (E18-S03, PRD §04 "BOM choice and explanation"). */
export type MrpBomRejectionView =
  | { bom: string; revision: number; reason: "inactive-component"; materials: string[] }
  | { bom: string; revision: number; reason: "shortage"; shortages: MrpComponentShortfallView[] };

const HEAD = /^(\S+)\/(\d+)$/;
const QUANTITY = /^\d+\.\d{6}$/;

/** `bom/revision: rest` entries of one notation, each kept only when its head reads. */
function entries(notation: string | undefined): { bom: string; revision: number; rest: string }[] {
  if (!notation) return [];
  return notation.split("; ").flatMap((entry) => {
    const split = entry.indexOf(": ");
    const head = HEAD.exec(split < 0 ? "" : entry.slice(0, split));
    return head ? [{ bom: head[1], revision: Number(head[2]), rest: entry.slice(split + 2) }] : [];
  });
}

/**
 * The inverse of `rejectionDetails`: a stored row's `missing`, `inactive` and `order` as structured rejections,
 * in `order` (engine order), or by BOM then revision for a row an older image wrote without it (spec Q3). An
 * entry this image can't read, written by a newer one, is dropped; the raw notation stays in the row's params.
 */
export function readBomRejections({ missing, inactive, order }: { missing?: string; inactive?: string; order?: string }): MrpBomRejectionView[] {
  const rejections: MrpBomRejectionView[] = [];
  for (const { bom, revision, rest } of entries(missing)) {
    const shortages = rest.split(", ").map((line) => line.split(" "));
    if (!shortages.every((tokens) => tokens.length === 4 && tokens.slice(1).every((token) => QUANTITY.test(token)))) continue;
    rejections.push({ bom, revision, reason: "shortage", shortages: shortages.map(([material, required, available, shortage]) => ({ material, required, available, shortage })) });
  }
  for (const { bom, revision, rest } of entries(inactive)) {
    rejections.push({ bom, revision, reason: "inactive-component", materials: rest.split(", ") });
  }
  const rank = new Map((order ?? "").split(", ").map((key, index) => [key, index]));
  const position = ({ bom, revision }: MrpBomRejectionView) => rank.get(`${bom}/${revision}`) ?? rank.size;
  return rejections.sort((a, b) => position(a) - position(b) || a.bom.localeCompare(b.bom) || a.revision - b.revision);
}

/**
 * The structured rejections an exception explains (E18-S03 spec Q2): No Feasible BOM's from its stored notation,
 * Missing Usable BOM's from its `inactive` list, already in engine order, so it keeps that order. Other codes
 * explain no BOM choice and get none.
 */
export function exceptionRejections(code: string, details: Readonly<Record<string, string>> | null): MrpBomRejectionView[] | undefined {
  if (code === "NO_FEASIBLE_BOM") return readBomRejections(details ?? {});
  if (code !== "MISSING_USABLE_BOM") return undefined;
  const inactive = details?.inactive;
  return readBomRejections({ inactive, order: entries(inactive).map(({ bom, revision }) => `${bom}/${revision}`).join(", ") });
}
