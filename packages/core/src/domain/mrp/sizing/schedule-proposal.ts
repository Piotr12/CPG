import { addDays, daysBetween } from "../../demand/demand-buckets";
import { plannedStart } from "../../production-orders/production-planning";
import type { MrpProposalTiming } from "../mrp-result";

/**
 * When a proposal needed on `needDate` can start and finish, given the pair's lead time in whole
 * calendar days, weekends included (PRD §04, MAT-018, N04). It starts the lead time before its need,
 * by production orders' own `plannedStart`. A start that would fall before `today` starts today and
 * finishes today plus the lead time, late by the days between; the need keeps its date (MRP-037/038).
 * A finish `horizonDays` or more after today is Beyond Horizon: it raises no bucket (MRP-049).
 */
export function scheduleProposal(needDate: string, leadTimeDays: number, today: string, horizonDays: number): MrpProposalTiming {
  const backScheduled = plannedStart(needDate, leadTimeDays);
  const late = backScheduled < today;
  const plannedFinish = late ? addDays(today, leadTimeDays) : needDate;
  return {
    plannedStart: late ? today : backScheduled,
    plannedFinish,
    lateDays: late ? daysBetween(needDate, plannedFinish) : 0,
    beyondHorizon: daysBetween(today, plannedFinish) >= horizonDays,
  };
}
