import { formatDecimal } from "../../quantities/decimal";
import { rejectionDetails } from "../exceptions/stored-exception";
import { MRP_PROVISIONAL_BLOCKERS, type MrpProvisionalAction, type MrpProvisionalBlocker } from "../mrp-result";

/**
 * The code a provisional action is stored under in `mrp_run_exception` (E17-S03 spec Q8), after the run's
 * warnings. The read lists it in the plan's `provisional`, never among its exceptions or marks.
 */
export const MRP_PROVISIONAL_CODE = "PROVISIONAL_PRODUCTION";

export function isMrpProvisionalCode(code: string): code is typeof MRP_PROVISIONAL_CODE {
  return code === MRP_PROVISIONAL_CODE;
}

/** A provisional action as an `MrpRunException` row stores it: dated at its need date, every other figure a string. */
export interface StoredProvisional {
  code: typeof MRP_PROVISIONAL_CODE;
  material: string;
  location: string;
  date: string;
  details: Record<string, string>;
}

const fixed = (quantity: bigint) => formatDecimal(quantity, { fixed: true });

/**
 * `action` as a stored row: `quantity`, `leadTimeDays`, `bom`, `bomRevision`, `components` (`00000011
 * 6.000000, 00000012 3.000000`, as the action lists them) and `blockers` (comma-separated), plus No Feasible
 * BOM's `missing` and `inactive` when it can't be supplied (spec Q5), and `missing`, `inactive` and `order` whenever
 * it passed over a BOM (E18-S03 spec Q3a).
 */
export function toStoredProvisional(action: MrpProvisionalAction): StoredProvisional {
  const { material, location, needDate, quantity, leadTimeDays, bom, bomRevision, components, blockers, rejectedBoms } = action;
  const details: Record<string, string> = {
    quantity: fixed(quantity),
    leadTimeDays: String(leadTimeDays),
    bom,
    bomRevision: String(bomRevision),
    components: components.map((component) => `${component.material} ${fixed(component.quantity)}`).join(", "),
    blockers: blockers.join(","),
    // Any fallback is explained, a provisional-demand action's included (E18-S03 spec Q3a).
    ...((blockers.includes("no-feasible-bom") || rejectedBoms.length > 0) && rejectionDetails(rejectedBoms)),
  };
  return { code: MRP_PROVISIONAL_CODE, material, location, date: needDate, details };
}

/** A stored provisional action as the read lists it, before its timing is derived (`scheduleProposal`). */
export interface ReadProvisional {
  needDate: string;
  /** A six-decimal BUoM text. */
  quantity: string;
  leadTimeDays: number;
  bom: string;
  bomRevision: number;
  components: { material: string; quantity: string }[];
  blockers: MrpProvisionalBlocker[];
  missing?: string;
  inactive?: string;
  /** The rejected BOM/revisions in engine order (E18-S03); absent on a row an older image wrote. */
  order?: string;
}

/** The read's half of `toStoredProvisional`: a blocker this image doesn't know, written by a newer one, is dropped. */
export function readStoredProvisional(date: string, details: Record<string, string>): ReadProvisional {
  const { quantity, leadTimeDays, bom, bomRevision, components, blockers, missing, inactive, order } = details;
  return {
    needDate: date,
    quantity,
    leadTimeDays: Number(leadTimeDays),
    bom,
    bomRevision: Number(bomRevision),
    components: components === "" ? [] : components.split(", ").map((entry) => {
      const [material, amount] = entry.split(" ");
      return { material, quantity: amount };
    }),
    blockers: MRP_PROVISIONAL_BLOCKERS.filter((blocker) => blockers.split(",").includes(blocker)),
    ...(missing !== undefined && { missing }),
    ...(inactive !== undefined && { inactive }),
    ...(order !== undefined && { order }),
  };
}
