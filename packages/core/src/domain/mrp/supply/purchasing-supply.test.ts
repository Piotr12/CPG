import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpPurchaseOrderLine, MrpRequisition } from "../mrp-inputs";
import type { MrpSupply } from "../mrp-result";
import { horizonDates } from "../projection/horizon";
import { compareSupply, purchasingSupply } from "./purchasing-supply";

const TODAY = "2026-10-01";
const DATES = horizonDates(TODAY);
const q = (text: string) => parseDecimal(text)!;

const requisition = (overrides: Partial<MrpRequisition> = {}): MrpRequisition => ({
  code: "00000001",
  material: "M1",
  location: "L1",
  requiredDate: "2026-10-10",
  quantity: q("100"),
  converted: 0n,
  abandoned: 0n,
  status: "open",
  ...overrides,
});

const orderLine = (overrides: Partial<MrpPurchaseOrderLine> = {}): MrpPurchaseOrderLine => ({
  order: "00000001",
  position: 1,
  material: "M1",
  location: "L1",
  plannedDate: "2026-10-10",
  quantity: q("100"),
  received: 0n,
  abandoned: 0n,
  status: "open",
  ...overrides,
});

const quantities = (items: readonly MrpSupply[]) => items.map(({ document, quantity }) => [document, quantity]);

describe("purchasingSupply", () => {
  it("counts an open requisition's unconverted rest as tentative supply on its required date", () => {
    expect(purchasingSupply([requisition({ converted: q("60") })], [], DATES)).toEqual([
      {
        kind: "requisition",
        reliability: "tentative",
        document: "00000001",
        position: null,
        material: "M1",
        location: "L1",
        plannedDate: "2026-10-10",
        date: "2026-10-10",
        overdue: false,
        quantity: q("40"),
      },
    ]);
  });

  it("counts an open purchase-order line's unreceived rest as dependable supply on its planned date", () => {
    expect(purchasingSupply([], [orderLine({ order: "00000007", position: 3, received: q("40") })], DATES)).toEqual([
      {
        kind: "purchase-order",
        reliability: "dependable",
        document: "00000007",
        position: 3,
        material: "M1",
        location: "L1",
        plannedDate: "2026-10-10",
        date: "2026-10-10",
        overdue: false,
        quantity: q("60"),
      },
    ]);
  });

  it("subtracts what was abandoned from either document", () => {
    const items = purchasingSupply(
      [requisition({ converted: q("30"), abandoned: q("20") })],
      [orderLine({ received: q("10"), abandoned: q("25") })],
      DATES,
    );
    expect(quantities(items)).toEqual([
      ["00000001", q("65")],
      ["00000001", q("50")],
    ]);
    expect(items.map(({ kind }) => kind)).toEqual(["purchase-order", "requisition"]);
  });

  it("counts no closed document, even one whose arithmetic would leave a remainder", () => {
    // Each fixture keeps a remainder, so only the status filter keeps it out (lesson 2026-10-27).
    const requisitions = [
      requisition({ status: "cancelled" }),
      requisition({ status: "closed-early", converted: q("60"), abandoned: q("10") }),
      requisition({ status: "completed", converted: q("40") }),
    ];
    const lines = [
      // A Closed Early line whose receipt was reversed: received back to 0, 40 abandoned.
      orderLine({ status: "closed-early", abandoned: q("40") }),
      orderLine({ status: "cancelled", abandoned: q("10") }),
      orderLine({ status: "completed", received: q("90") }),
    ];
    expect(purchasingSupply(requisitions, lines, DATES)).toEqual([]);
  });

  it("drops a remainder of zero: a fully converted requisition still Open, a line received exactly or beyond its quantity", () => {
    const items = purchasingSupply(
      [requisition({ converted: q("100") })],
      [orderLine({ received: q("100") }), orderLine({ position: 2, received: q("110") })],
      DATES,
    );
    expect(items).toEqual([]);
  });

  it("MRP-015: counts overdue supply today, keeping its own date and marking it overdue", () => {
    const items = purchasingSupply(
      [requisition({ requiredDate: "2026-09-20" })],
      [orderLine({ plannedDate: "2026-09-30", quantity: q("50") }), orderLine({ position: 2, plannedDate: TODAY, quantity: q("5") })],
      DATES,
    );
    expect(items.map(({ kind, plannedDate, date, overdue, quantity }) => ({ kind, plannedDate, date, overdue, quantity }))).toEqual([
      { kind: "requisition", plannedDate: "2026-09-20", date: TODAY, overdue: true, quantity: q("100") },
      { kind: "purchase-order", plannedDate: "2026-09-30", date: TODAY, overdue: true, quantity: q("50") },
      { kind: "purchase-order", plannedDate: TODAY, date: TODAY, overdue: false, quantity: q("5") },
    ]);
  });

  it("keeps supply on the horizon's last day, 29 December, and drops it from day 90 on", () => {
    const items = purchasingSupply(
      [requisition({ requiredDate: "2026-12-30" })],
      [orderLine({ plannedDate: "2026-12-29" }), orderLine({ position: 2, plannedDate: "2027-01-15" })],
      DATES,
    );
    expect(items.map(({ kind, date }) => `${kind}@${date}`)).toEqual(["purchase-order@2026-12-29"]);
  });

  it("orders items by bucket, own date, kind, document and position, whatever the input order", () => {
    const requisitions = [
      requisition({ code: "00000009", requiredDate: "2026-10-05" }),
      requisition({ code: "00000002", requiredDate: "2026-09-25" }),
      requisition({ code: "00000004", requiredDate: "2026-10-05" }),
    ];
    const lines = [
      orderLine({ order: "00000003", position: 2, plannedDate: "2026-10-05" }),
      orderLine({ order: "00000003", position: 1, plannedDate: "2026-10-05" }),
      orderLine({ order: "00000001", position: 4, plannedDate: "2026-10-05" }),
      orderLine({ order: "00000008", position: 1, plannedDate: "2026-09-28" }),
    ];
    const forward = purchasingSupply(requisitions, lines, DATES);
    expect(purchasingSupply([...requisitions].reverse(), [...lines].reverse(), DATES)).toEqual(forward);
    expect(forward.map(({ kind, document, position }) => `${kind}:${document}/${position}`)).toEqual([
      "requisition:00000002/null",
      "purchase-order:00000008/1",
      "purchase-order:00000001/4",
      "purchase-order:00000003/1",
      "purchase-order:00000003/2",
      "requisition:00000004/null",
      "requisition:00000009/null",
    ]);
  });
});

describe("compareSupply", () => {
  it("finds two items of the same document line equal", () => {
    const [item] = purchasingSupply([requisition()], [], DATES);
    expect(compareSupply(item, { ...item })).toBe(0);
  });
});
