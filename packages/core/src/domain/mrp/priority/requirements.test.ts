import { describe, expect, it } from "vitest";
import type { MrpDemandRoot, MrpPlannedComponentDemand } from "../mrp-result";
import { compareRequirements, RequirementQueues, requirementsByDate, type Requirement, type RequirementLists } from "./requirements";

const root = (kind: MrpDemandRoot["kind"], originalDate: string, overrides: Partial<MrpDemandRoot> = {}): MrpDemandRoot => ({
  kind,
  material: "M1",
  originalDate,
  document: null,
  position: null,
  ...overrides,
});
const requirement = (of: MrpDemandRoot, overrides: Partial<Requirement> = {}): Requirement => ({
  kind: of.kind === "safety-target" ? "planned-component" : of.kind,
  date: "2026-10-05",
  root: of,
  via: "",
  parentNeedDate: "",
  provisional: false,
  required: 1n,
  outstanding: 1n,
  ...overrides,
});
const need = (provisional: boolean, quantity: bigint): MrpPlannedComponentDemand => ({
  parent: "P1",
  parentNeedDate: "2026-10-07",
  bom: "00000001",
  bomRevision: 1,
  material: "M1",
  location: "L1",
  date: "2026-10-05",
  quantity,
  roots: [{ root: root("forecast", "2026-10-07"), quantity }],
  provisional,
});
const lists = (plannedComponentDemand: MrpPlannedComponentDemand[]): RequirementLists => ({
  material: "M1",
  firmDemand: [{ order: "00000001", position: 1, material: "M1", location: "L1", requiredDate: "2026-10-05", date: "2026-10-05", quantity: 2n }],
  forecastDemand: [],
  componentDemand: [],
  plannedComponentDemand,
  transfersOut: [],
});

describe("compareRequirements (#327)", () => {
  it("orders the pair's own requirements as before: rank, original date, kind, document, position", () => {
    const sorted = [
      requirement(root("forecast", "2026-10-05")),
      requirement(root("customer-order", "2026-10-06", { document: "A", position: 1 })),
      requirement(root("customer-order", "2026-10-05", { document: "B", position: 1 })),
      requirement(root("customer-order", "2026-10-05", { document: "A", position: 2 })),
      requirement(root("transfer", "2026-10-05", { document: "A" })),
      requirement(root("component", "2026-10-05", { document: "A" })),
    ].sort(compareRequirements);
    expect(sorted.map(({ kind, root: { originalDate, document, position } }) => [kind, originalDate.slice(-2), document, position])).toEqual([
      ["component", "05", "A", null],
      ["transfer", "05", "A", null],
      ["customer-order", "05", "A", 2],
      ["customer-order", "05", "B", 1],
      ["customer-order", "06", "A", 1],
      ["forecast", "05", null, null],
    ]);
  });
});

describe("requirementsByDate (#327)", () => {
  it("selects provisional parents' needs apart, alone or with the rest, and sums shares with an equal key", () => {
    const pair = lists([need(true, 3n), need(true, 4n), need(false, 5n)]);
    const quantities = (provisional: "exclude" | "only" | "include") =>
      requirementsByDate(pair, provisional).get("2026-10-05")!.map(({ kind, provisional: of, required }) => [kind, of, required]);
    expect(quantities("exclude")).toEqual([["customer-order", false, 2n], ["planned-component", false, 5n]]);
    expect(quantities("only")).toEqual([["planned-component", true, 7n]]);
    expect(quantities("include")).toEqual([["customer-order", false, 2n], ["planned-component", false, 5n], ["planned-component", true, 7n]]);
  });
});

describe("RequirementQueues (#327)", () => {
  it("serves in priority order whatever the push order, reports each quantity served and returns what is left", () => {
    const queues = new RequirementQueues();
    const later = requirement(root("customer-order", "2026-10-09", { document: "B" }), { required: 3n, outstanding: 3n });
    const earlier = requirement(root("customer-order", "2026-10-06", { document: "A" }), { required: 2n, outstanding: 2n });
    const first = requirement(root("component", "2026-10-09", { document: "C" }), { required: 1n, outstanding: 1n });
    queues.push(later);
    queues.push(earlier);
    queues.push(first);
    const served: [string | null, bigint][] = [];
    expect(queues.serve(4n, ({ root: { document } }, quantity) => served.push([document, quantity]))).toBe(0n);
    expect(served).toEqual([["C", 1n], ["A", 2n], ["B", 1n]]);
    expect(queues.serve(5n)).toBe(3n);
    expect(later.outstanding).toBe(0n);
  });
});
