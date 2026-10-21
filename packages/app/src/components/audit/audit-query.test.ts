import { describe, expect, it } from "vitest";
import { auditUrl, businessDateOf, filtersOf, isFiltered, movementIdsOf, recordHistoryUrl, reversalOf } from "./audit-query";

const PATH = "/admin/test/audit";

describe("auditUrl", () => {
  it("is the bare path without filters or a cursor", () => {
    expect(auditUrl(PATH, {})).toBe(PATH);
  });

  it("lists every active filter in a fixed order, then the cursor, encoded", () => {
    expect(
      auditUrl(PATH, { to: "2026-10-21", from: "2026-10-01", channel: "ui", account: "alice", subjectId: "00000003/00000001/2026-11-01", subjectType: "Forecast" }, "e-1"),
    ).toBe(`${PATH}?subjectType=Forecast&subjectId=00000003%2F00000001%2F2026-11-01&account=alice&channel=ui&from=2026-10-01&to=2026-10-21&before=e-1`);
  });

  it("round-trips through URLSearchParams", () => {
    const query = { subjectType: "PurchaseOrder", subjectId: "00000012", account: "bob" };
    expect(Object.fromEntries(new URL(auditUrl(PATH, query), "http://cpg.test").searchParams)).toEqual(query);
  });
});

describe("recordHistoryUrl", () => {
  it("narrows the screen to one subject", () => {
    expect(recordHistoryUrl("/admin/audit", { type: "User", id: "u-2" })).toBe("/admin/audit?subjectType=User&subjectId=u-2");
  });
});

describe("filtersOf and isFiltered", () => {
  it("keeps only the filters, dropping the page position", () => {
    expect(filtersOf({ channel: "api", from: undefined, ...{ before: "e-1", limit: 50 } } as never)).toEqual({ channel: "api" });
  });

  it("tells a filtered query from an unfiltered one", () => {
    expect(isFiltered({})).toBe(false);
    expect(isFiltered({ to: "2026-10-21" })).toBe(true);
  });
});

describe("businessDateOf", () => {
  it("reads the business date recorded after the change, else before it", () => {
    expect(businessDateOf({ before: { businessDate: "2026-10-20" }, after: { businessDate: "2026-10-21" } })).toBe("2026-10-21");
    expect(businessDateOf({ before: { businessDate: "2026-10-20" }, after: { quantity: "1" } })).toBe("2026-10-20");
    expect(businessDateOf({ before: null, after: null })).toBeNull();
  });

  it("ignores a value that is not a real calendar date", () => {
    expect(businessDateOf({ before: null, after: { businessDate: "2026-02-30" } })).toBeNull();
    expect(businessDateOf({ before: null, after: { businessDate: 20261021 } })).toBeNull();
  });

  // The snapshot shapes the six producers record (stock posting, reversal, transfer, goods receipt, goods issue, production completion).
  it.each([
    ["stock posting", { quantity: "1.000000", movement: "1.000000", type: "correction", businessDate: "2026-10-21", reason: "Count" }],
    ["reversal", { reversed: true, original: "m-1", reversal: "m-2", businessDate: "2026-10-21", reason: "Wrong bin" }],
    ["transfer", { dispatched: "4.000000", moved: "4.000000", businessDate: "2026-10-21" }],
    ["goods receipt", { purchaseOrder: "00000012", businessDate: "2026-10-21", lines: "1" }],
    ["goods issue", { shipment: "00000004", businessDate: "2026-10-21", lines: "1" }],
    ["production completion", { order: "00000002", produced: "10.000000", businessDate: "2026-10-21" }],
  ])("finds the business date a %s records", (_producer, after) => {
    expect(businessDateOf({ before: null, after })).toBe("2026-10-21");
  });
});

describe("reversalOf and movementIdsOf", () => {
  const links = [{ original: "m-1", inverse: "m-2" }];
  const movement = (id: string) => ({ type: "StockMovement", id, label: "Bolts" });

  it("links an original to its inverse and back", () => {
    expect(reversalOf(movement("m-1"), links)).toEqual({ reverses: null, reversedBy: "m-2" });
    expect(reversalOf(movement("m-2"), links)).toEqual({ reverses: "m-1", reversedBy: null });
  });

  it("has nothing for an unreversed movement or another record type", () => {
    expect(reversalOf(movement("m-3"), links)).toBeNull();
    expect(reversalOf({ type: "Material", id: "m-1", label: "Bolts" }, links)).toBeNull();
  });

  it("asks for each movement of a page once, and for nothing else", () => {
    const entries = [{ subject: movement("m-1") }, { subject: movement("m-1") }, { subject: { type: "Material", id: "x", label: "y" } }, { subject: movement("m-2") }];
    expect(movementIdsOf(entries)).toEqual(["m-1", "m-2"]);
  });
});
