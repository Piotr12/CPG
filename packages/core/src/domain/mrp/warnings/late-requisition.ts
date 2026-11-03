import type { MrpPlanningParameters } from "../mrp-inputs";
import type { MrpLateRequisition, MrpPlan } from "../mrp-result";
import { MRP_HORIZON_DAYS } from "../projection/horizon";
import { scheduleProposal } from "../sizing/schedule-proposal";

/**
 * One Late Requisition warning per Open requisition of a Buy pair that its lead time can't meet (#322,
 * spec Q3, Q4): required today or later, but before today plus the lead time. The days late and the
 * earliest date are a proposal's (`scheduleProposal`), so a late proposal's requisition keeps its Late Supply
 * figures. An overdue requisition keeps Overdue Supply only. No readable set, or a Make one: no lead time to judge by.
 */
export function lateRequisitionWarnings({ material, location, supply }: MrpPlan, parameters: MrpPlanningParameters | undefined, today: string): MrpLateRequisition[] {
  if (parameters?.procurement !== "buy") return [];
  const warnings: MrpLateRequisition[] = [];
  for (const { kind, overdue, document, plannedDate, date, quantity } of supply) {
    if (kind !== "requisition" || overdue) continue;
    const { plannedFinish, lateDays } = scheduleProposal(plannedDate, parameters.leadTimeDays, today, MRP_HORIZON_DAYS);
    if (lateDays > 0) warnings.push({ code: "LATE_REQUISITION", material, location, date, document, plannedDate, plannedFinish, lateDays, quantity });
  }
  return warnings;
}
