import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpPlanningParameters } from "../mrp-inputs";
import type { MrpPlan, MrpSupply } from "../mrp-result";
import { lateRequisitionWarnings } from "./late-requisition";

const q = (text: string) => parseDecimal(text)!;
const TODAY = "2026-10-01";

const empty = {
  physical: 0n, buckets: [], firmDemand: [], forecastDemand: [], productionOutput: [], atRiskOutput: [], componentDemand: [], plannedComponentDemand: [], transfersOut: [], transfersIn: [], shortages: [],
};
const requisition = (document: string, plannedDate: string, quantity = "5", overrides: Partial<MrpSupply> = {}): MrpSupply => ({
  kind: "requisition", reliability: "tentative", document, position: null, material: "M1", location: "L1", plannedDate, date: plannedDate < TODAY ? TODAY : plannedDate, overdue: plannedDate < TODAY, quantity: q(quantity), ...overrides,
});
const planOf = (supply: MrpSupply[]): MrpPlan => ({ ...empty, material: "M1", location: "L1", supply });
const buy = (leadTimeDays: number, overrides: Partial<MrpPlanningParameters> = {}): MrpPlanningParameters => ({
  material: "M1", location: "L1", materialType: "raw", procurement: "buy", leadTimeDays, minimumQuantity: 0n, lotMultiple: q("1"), ...overrides,
});

describe("lateRequisitionWarnings", () => {
  it("#322: warns of each Open requisition required before today plus the Buy lead time, with a proposal's days late and earliest date", () => {
    const plan = planOf([
      requisition("00000001", "2026-10-02"),
      requisition("00000002", TODAY, "0.5"),
      requisition("00000003", "2026-10-03"),
      requisition("00000004", "2026-10-20"),
    ]);
    expect(lateRequisitionWarnings(plan, buy(2), TODAY)).toEqual([
      { code: "LATE_REQUISITION", material: "M1", location: "L1", date: "2026-10-02", document: "00000001", plannedDate: "2026-10-02", plannedFinish: "2026-10-03", lateDays: 1, quantity: q("5") },
      { code: "LATE_REQUISITION", material: "M1", location: "L1", date: TODAY, document: "00000002", plannedDate: TODAY, plannedFinish: "2026-10-03", lateDays: 2, quantity: q("0.5") },
    ]);
  });

  it("names only what the requisition still counts, as a partly converted one does (MRP-012)", () => {
    const [warning] = lateRequisitionWarnings(planOf([requisition("00000005", "2026-10-04", "40")]), buy(7), TODAY);
    expect(warning).toMatchObject({ quantity: q("40"), plannedFinish: "2026-10-08", lateDays: 4 });
  });

  it("leaves an overdue requisition to Overdue Supply, and warns of no purchase order", () => {
    const plan = planOf([
      requisition("00000006", "2026-09-29"),
      { ...requisition("00000007", "2026-10-02"), kind: "purchase-order", reliability: "dependable", position: 1 },
    ]);
    expect(lateRequisitionWarnings(plan, buy(5), TODAY)).toEqual([]);
  });

  it("warns of nothing with a zero lead time, a Make set, or no set (spec Q4)", () => {
    const plan = planOf([requisition("00000008", TODAY)]);
    expect(lateRequisitionWarnings(plan, buy(0), TODAY)).toEqual([]);
    expect(lateRequisitionWarnings(plan, buy(3, { procurement: "make", materialType: "finished" }), TODAY)).toEqual([]);
    expect(lateRequisitionWarnings(plan, undefined, TODAY)).toEqual([]);
  });
});
