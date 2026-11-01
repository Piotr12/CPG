import { describe, expect, it } from "vitest";
import { planMarks, type StoredWarningRow, type TimedProposal } from "./plan-marks";

const TODAY = "2026-10-01";
const po: StoredWarningRow = { code: "OVERDUE_SUPPLY", date: TODAY, details: { source: "purchase-order", document: "00000003", position: "1", plannedDate: "2026-09-28", quantity: "30.000000" } };
const transit: StoredWarningRow = { code: "OVERDUE_TRANSFER", date: TODAY, details: { transfer: "00000002", stage: "in-transit", plannedDate: "2026-09-30", quantity: "25.000000" } };
const proposal = (overrides: Partial<TimedProposal>): TimedProposal => ({
  id: "p1", needDate: "2026-10-04", quantity: "12.000000", plannedFinish: "2026-10-04", lateDays: 0, beyondHorizon: false, ...overrides,
});

describe("planMarks", () => {
  it("UX-018: marks the overdue PO line and transfer on the run's first day with their own dates, and a late proposal on its need date", () => {
    const late = proposal({ id: "p1", plannedFinish: "2026-10-08", lateDays: 4 });
    expect(planMarks([late, proposal({ id: "p2", needDate: "2026-10-09" })], [transit, po])).toEqual([
      { kind: "overdue-supply", date: TODAY, source: "purchase-order", document: "00000003", position: 1, plannedDate: "2026-09-28", quantity: "30.000000" },
      { kind: "overdue-transfer", date: TODAY, transfer: "00000002", stage: "in-transit", plannedDate: "2026-09-30", quantity: "25.000000" },
      { kind: "late-supply", date: "2026-10-04", proposal: "p1", plannedFinish: "2026-10-08", lateDays: 4, quantity: "12.000000" },
    ]);
  });

  it("MRP-049: marks a Beyond Horizon proposal as such, not as Late Supply, on its need date", () => {
    const far = proposal({ id: "p3", needDate: "2026-10-15", plannedFinish: "2027-01-09", lateDays: 86, beyondHorizon: true, quantity: "40.000000" });
    expect(planMarks([far], [])).toEqual([{ kind: "beyond-horizon", date: "2026-10-15", proposal: "p3", plannedFinish: "2027-01-09", lateDays: 86, quantity: "40.000000" }]);
  });

  it("orders a day's marks by kind, keeping the stored order within a kind", () => {
    const requisition: StoredWarningRow = { code: "OVERDUE_SUPPLY", date: TODAY, details: { source: "requisition", document: "00000009", plannedDate: "2026-09-29", quantity: "1.000000" } };
    const late = proposal({ needDate: TODAY, plannedFinish: "2026-10-03", lateDays: 2 });
    expect(planMarks([late], [transit, requisition, po]).map((mark) => [mark.kind, "document" in mark ? mark.document : null])).toEqual([
      ["overdue-supply", "00000009"],
      ["overdue-supply", "00000003"],
      ["overdue-transfer", null],
      ["late-supply", null],
    ]);
    expect(planMarks([], [requisition])[0]).toMatchObject({ position: null });
    const later = proposal({ id: "later", needDate: "2026-10-09", plannedFinish: "2026-10-11", lateDays: 2 });
    const earlier = proposal({ id: "earlier", needDate: "2026-10-05", plannedFinish: "2026-10-06", lateDays: 1 });
    expect(planMarks([later, earlier], []).map((mark) => mark.date)).toEqual(["2026-10-05", "2026-10-09"]);
  });

  it("leaves out a warning row it can't read, as another image might write, and any other code", () => {
    const broken: StoredWarningRow[] = [
      { ...po, date: null },
      { ...po, details: null },
      { ...po, details: { ...po.details!, plannedDate: "" } },
      { ...po, details: { ...po.details!, quantity: "" } },
      { ...po, details: { ...po.details!, document: "" } },
      { ...po, details: { ...po.details!, source: "sales-order" } },
      { ...po, details: { ...po.details!, position: "first" } },
      { ...transit, details: { ...transit.details!, transfer: "" } },
      { ...transit, details: { ...transit.details!, stage: "lost" } },
      { ...po, code: "MISSING_BOM" },
    ];
    expect(planMarks([], broken)).toEqual([]);
  });
});
