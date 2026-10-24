import { describe, expect, it } from "vitest";
import { BOM_SORTS } from "../../validators/boms/bom-list.schema";
import { compareBoms, type SortableBom } from "./bom-order";

const bom = (id: string, output: string, fields: Partial<SortableBom> = {}): SortableBom => ({
  id,
  output,
  active: true,
  revision: 1,
  priority: 1,
  validFrom: "2026-01-01",
  validThrough: null,
  ...fields,
});

const BOMS = [
  bom("00000004", "00000020", { priority: 2, revision: 3, validFrom: "2026-03-01", validThrough: "2026-12-31" }),
  bom("00000001", "00000020", { priority: 1, active: false }),
  bom("00000003", "00000010", { priority: 3, revision: 2, validFrom: "2026-02-01", validThrough: "2026-06-30" }),
  bom("00000002", "00000010", { priority: 1, revision: 2 }),
];

const order = (sort: (typeof BOM_SORTS)[number], dir: "asc" | "desc" = "asc") => [...BOMS].sort(compareBoms(sort, dir)).map(({ id }) => id);

describe("compareBoms (#217)", () => {
  it("orders by output, alternatives by priority whichever way the outputs run, as BOM-008 lists them", () => {
    expect(order("output")).toEqual(["00000002", "00000003", "00000001", "00000004"]);
    expect(order("output", "desc")).toEqual(["00000001", "00000004", "00000002", "00000003"]);
  });

  it("orders by every other column both ways, by BOM ID within equal values", () => {
    expect(order("id", "desc")).toEqual(["00000004", "00000003", "00000002", "00000001"]);
    expect(order("priority")).toEqual(["00000001", "00000002", "00000004", "00000003"]);
    expect(order("priority", "desc")).toEqual(["00000003", "00000004", "00000001", "00000002"]);
    expect(order("revision", "desc")).toEqual(["00000004", "00000002", "00000003", "00000001"]);
    expect(order("validFrom")).toEqual(["00000001", "00000002", "00000003", "00000004"]);
    expect(order("validFrom", "desc")).toEqual(["00000004", "00000003", "00000001", "00000002"]);
    expect(order("status")).toEqual(["00000001", "00000002", "00000003", "00000004"]);
    expect(order("status", "desc")).toEqual(["00000002", "00000003", "00000004", "00000001"]);
  });

  it("puts a recipe without an end after every dated one", () => {
    expect(order("validThrough")).toEqual(["00000003", "00000004", "00000001", "00000002"]);
    expect(order("validThrough", "desc")).toEqual(["00000001", "00000002", "00000004", "00000003"]);
  });
});
