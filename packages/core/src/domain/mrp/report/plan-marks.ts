import type { MrpOverdueSource, MrpTransferMovement } from "../mrp-result";

/** What a mark warns of, in the order a day lists them (spec, "Marks"). */
export const MRP_MARK_KINDS = ["overdue-supply", "overdue-transfer", "late-requisition", "late-supply", "beyond-horizon"] as const;
export type MrpMarkKind = (typeof MRP_MARK_KINDS)[number];

/**
 * One warning the MRP report shows on the day it falls on (E18-S02, UX-018), and in that day's week.
 * Quantities are six-decimal texts in the base unit, as stored.
 */
export type MrpMark =
  | {
      kind: "overdue-supply";
      /** The run's first day, where the supply counts. */
      date: string;
      source: MrpOverdueSource;
      document: string;
      /** The purchase-order line's position, or null. */
      position: number | null;
      /** The document's own date, kept (PRD §04). */
      plannedDate: string;
      quantity: string;
    }
  | { kind: "overdue-transfer"; date: string; transfer: string; stage: MrpTransferMovement["stage"]; plannedDate: string; quantity: string }
  | {
      kind: "late-requisition";
      /** The requisition's required date, where it counts (#322). */
      date: string;
      document: string;
      plannedDate: string;
      /** The earliest date its lead time allows from the run's first day. */
      plannedFinish: string;
      lateDays: number;
      quantity: string;
    }
  | {
      kind: "late-supply" | "beyond-horizon";
      /** The proposal's need date, which never moves (MRP-037). */
      date: string;
      proposal: string;
      plannedFinish: string;
      lateDays: number;
      quantity: string;
    };

/** A stored warning row of the pair, as the read gives it. */
export interface StoredWarningRow {
  code: string;
  date: string | null;
  details: Record<string, string> | null;
}

/** A stored proposal of the pair, with the timing its read derives. */
export interface TimedProposal {
  id: string;
  needDate: string;
  quantity: string;
  plannedFinish: string;
  lateDays: number;
  beyondHorizon: boolean;
}

const SOURCES: readonly string[] = ["purchase-order", "requisition", "production-order"] satisfies MrpOverdueSource[];
const STAGES: readonly string[] = ["in-transit", "planned"] satisfies MrpTransferMovement["stage"][];

/**
 * One pair's marks (spec, "Marks"): its stored warnings (overdue supply and transfers, late requisitions), and its late proposals, a Beyond Horizon
 * one marked as such, each on its need date. By date, then kind, then the stored order. A warning row
 * whose details this image can't read (another image's shape) is left out rather than guessed.
 */
export function planMarks(proposals: readonly TimedProposal[], warnings: readonly StoredWarningRow[]): MrpMark[] {
  const marks: MrpMark[] = [];
  for (const row of warnings) {
    const mark = warningMark(row);
    if (mark) marks.push(mark);
  }
  for (const { id, needDate, quantity, plannedFinish, lateDays, beyondHorizon } of proposals) {
    if (lateDays > 0) marks.push({ kind: beyondHorizon ? "beyond-horizon" : "late-supply", date: needDate, proposal: id, plannedFinish, lateDays, quantity });
  }
  return marks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : MRP_MARK_KINDS.indexOf(a.kind) - MRP_MARK_KINDS.indexOf(b.kind)));
}

function warningMark({ code, date, details }: StoredWarningRow): MrpMark | null {
  if (date === null || !details) return null;
  const { plannedDate, quantity } = details;
  if (!plannedDate || !quantity) return null;
  if (code === "OVERDUE_SUPPLY") {
    const { source, document, position } = details;
    if (!document || !SOURCES.includes(source) || (position !== undefined && !/^\d+$/.test(position))) return null;
    return { kind: "overdue-supply", date, source: source as MrpOverdueSource, document, position: position === undefined ? null : Number(position), plannedDate, quantity };
  }
  if (code === "OVERDUE_TRANSFER") {
    const { transfer, stage } = details;
    if (!transfer || !STAGES.includes(stage)) return null;
    return { kind: "overdue-transfer", date, transfer, stage: stage as MrpTransferMovement["stage"], plannedDate, quantity };
  }
  if (code === "LATE_REQUISITION") {
    const { document, plannedFinish, lateDays } = details;
    if (!document || !plannedFinish || !/^[1-9]\d*$/.test(lateDays ?? "")) return null;
    return { kind: "late-requisition", date, document, plannedDate, plannedFinish, lateDays: Number(lateDays), quantity };
  }
  return null;
}
