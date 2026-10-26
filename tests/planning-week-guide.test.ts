import { describe, expect, it } from "vitest";
import { PLANNING_WEEK } from "../packages/app/src/app/help/test-dataset/planning-week";
import { addDays, monthOf } from "../packages/core/src/domain/demo/calendar";
import { planDemand } from "../packages/core/src/domain/demo/demand-plan";
import { planSupply } from "../packages/core/src/domain/demo/supply-plan";
import { TEST_TENANT_CONFIG } from "../packages/core/src/domain/demo/test-tenant-config.schema";
import { buildTimeline, planEvents } from "../packages/core/src/domain/demo/timeline";

const config = TEST_TENANT_CONFIG;

/** Monday 0 … Sunday 6, the order `PLANNING_WEEK` uses. */
const weekdayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

const plans = new Map<number, ReturnType<typeof planEvents>>();
function planFor(day: string) {
  const anchor = monthOf(day);
  if (!plans.has(anchor)) {
    const demand = planDemand(config, anchor);
    plans.set(anchor, planEvents(config, demand, planSupply(config, demand, anchor), anchor));
  }
  return plans.get(anchor)!;
}

/** Two full weeks across a month boundary, Monday 2026-10-19 to Sunday 2026-11-01. */
const DAYS = Array.from({ length: 14 }, (_, i) => addDays("2026-10-19", i));

// The help page /help/test-dataset draws the generator's week (Q10 of #237). If the cadence changes, the drawing must too.
describe("the planning week the help page draws", () => {
  it.each(DAYS)("matches the generated dataset's partial receipt on %s", (day) => {
    const receivedToday = buildTimeline(config, planFor(day), day).filter((event) => event.kind === "goodsReceipt" && event.at.startsWith(day));

    expect(receivedToday.length > 0).toBe(PLANNING_WEEK[weekdayIndex(day)].partialReceipt);
  });

  it("creates the weekly purchase orders on the planning-run day and receives them on the receipt days", () => {
    const orders = planFor(DAYS[0]).supply.purchaseOrders;
    const daysOf = (event: string) => PLANNING_WEEK.flatMap((day, index) => (day.event === event ? [index] : []));

    expect(orders.length).toBeGreaterThan(0);
    expect(new Set(orders.map(({ createdOn }) => weekdayIndex(createdOn)))).toEqual(new Set(daysOf("planningRun")));
    expect(new Set(orders.map(({ plannedDate }) => weekdayIndex(plannedDate)))).toEqual(new Set(daysOf("receipt")));
  });
});
