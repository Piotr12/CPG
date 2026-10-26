/** What the generated Test datasets plan on a weekday. */
export type PlanningEvent = "planningRun" | "receipt";

export interface PlanningDay {
  event?: PlanningEvent;
  /** Whether a reset on this day leaves today's partly received purchase order (spec "Today: what is open"). */
  partialReceipt: boolean;
}

/**
 * Monday to Sunday, as the generator plans them (decision Q10 of #237, spec
 * `implemented/2026-10-25--0848UTC-single-site-daily-dataset`): Thursday's run creates next week's
 * orders, received on Monday and Tuesday. A partial receipt needs an order created before today and
 * not yet due. `tests/planning-week-guide.test.ts` checks this week against generated datasets.
 */
export const PLANNING_WEEK: readonly PlanningDay[] = [
  { event: "receipt", partialReceipt: true },
  { event: "receipt", partialReceipt: true },
  { partialReceipt: false },
  { event: "planningRun", partialReceipt: false },
  { partialReceipt: true },
  { partialReceipt: true },
  { partialReceipt: true },
];
