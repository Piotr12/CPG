import { describe, expect, it } from "vitest";
import type { MrpDemandRoot, MrpPlannedComponentDemand } from "../mrp-result";
import { compareRequirements, RequirementQueues, requirementsByDate, rootOf, unserved, type Requirement, type RequirementLists } from "./requirements";

const root = (kind: MrpDemandRoot["kind"], originalDate: string): MrpDemandRoot => ({ kind, originalDate });
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
  firmDemand: [{ order: "00000001", position: 1, material: "M1", location: "L1", requiredDate: "2026-10-05", date: "2026-10-05", quantity: 2n }],
  forecastDemand: [],
  componentDemand: [],
  plannedComponentDemand,
  transfersOut: [],
});

describe("compareRequirements (#327)", () => {
  it("orders the pair's own requirements as before: rank, original date, kind, document, position", () => {
    const day = "2026-10-05";
    const pair: RequirementLists = {
      ...lists([]),
      firmDemand: [
        { order: "A", position: 1, material: "M1", location: "L1", requiredDate: "2026-10-06", date: day, quantity: 1n },
        { order: "B", position: 1, material: "M1", location: "L1", requiredDate: day, date: day, quantity: 1n },
        { order: "A", position: 2, material: "M1", location: "L1", requiredDate: day, date: day, quantity: 1n },
      ],
      forecastDemand: [{ material: "M1", location: "L1", forecastDate: day, date: day, forecastQuantity: 1n, quantity: 1n }],
      transfersOut: [{ transfer: "A", material: "M1", location: "L1", stage: "planned", plannedDate: day, date: day, quantity: 1n, overdue: false }],
      componentDemand: [{ order: "A", material: "M1", location: "L1", plannedStart: day, date: day, quantity: 1n, overdue: false }],
    };
    const due = requirementsByDate(pair).get(day)!;
    const expected = [
      ["component", "05", "A", 0],
      ["transfer", "05", "A", 0],
      ["customer-order", "05", "A", 2],
      ["customer-order", "05", "B", 1],
      ["customer-order", "06", "A", 1],
      ["forecast", "05", "", 0],
    ];
    const keys = (list: Requirement[]) => list.map((one) => [one.kind, one.originalDate.slice(-2), one.document, one.position]);
    expect(keys(due)).toEqual(expected);
    expect(keys([...due].reverse().sort(compareRequirements))).toEqual(expected);
  });
});

describe("requirementsByDate (#327)", () => {
  it("lists one requirement per share, its root kept, and sums shares with an equal key, provisional parents' apart", () => {
    const due = requirementsByDate(lists([need(true, 3n), need(true, 4n), need(false, 5n)])).get("2026-10-05")!;
    expect(due.map(({ kind, provisional, required }) => [kind, provisional, required])).toEqual([
      ["customer-order", false, 2n],
      ["planned-component", false, 5n],
      ["planned-component", true, 7n],
    ]);
    expect(rootOf(due[1])).toEqual(root("forecast", "2026-10-07"));
    expect(rootOf(due[0])).toEqual({ kind: "customer-order", originalDate: "2026-10-05" });
  });

  it("serves a shared list afresh after `unserved`", () => {
    const due = requirementsByDate(lists([need(false, 5n)]));
    const queues = new RequirementQueues();
    for (const one of due.get("2026-10-05")!) queues.push(one);
    expect(queues.serve(3n)).toBe(0n);
    unserved(due);
    expect(due.get("2026-10-05")!.map(({ outstanding }) => outstanding)).toEqual([2n, 5n]);
  });
});

describe("RequirementQueues (#327)", () => {
  it("serves in priority order whatever the push order, reports each quantity served and returns what is left", () => {
    const order = (code: string, requiredDate: string, quantity: bigint) => ({ order: code, position: 1, material: "M1", location: "L1", requiredDate, date: requiredDate, quantity });
    const pair: RequirementLists = {
      ...lists([]),
      firmDemand: [order("A", "2026-10-06", 2n), order("B", "2026-10-09", 3n)],
      componentDemand: [{ order: "C", material: "M1", location: "L1", plannedStart: "2026-10-09", date: "2026-10-09", quantity: 1n, overdue: false }],
    };
    const due = requirementsByDate(pair);
    const queues = new RequirementQueues();
    // Pushed latest first, as a share dated at its root can be: B, then C, then A.
    const [later, first] = due.get("2026-10-09")!.slice().reverse();
    queues.push(later);
    queues.push(first);
    queues.push(due.get("2026-10-06")![0]);
    const served: [string | null, bigint][] = [];
    expect(queues.serve(4n, (one, quantity) => served.push([one.document, quantity]))).toBe(0n);
    expect(served).toEqual([["C", 1n], ["A", 2n], ["B", 1n]]);
    expect(queues.serve(5n)).toBe(3n);
    expect(later.outstanding).toBe(0n);
  });

  it("inserts a requirement between two queued ones by its priority, never at the head or the tail", () => {
    const order = (code: string, requiredDate: string) => ({ order: code, position: 1, material: "M1", location: "L1", requiredDate, date: "2026-10-05", quantity: 1n });
    const due = requirementsByDate({ ...lists([]), firmDemand: [order("A", "2026-10-06"), order("B", "2026-10-08"), order("C", "2026-10-09")] }).get("2026-10-05")!;
    const queues = new RequirementQueues();
    queues.push(due[0]);
    queues.push(due[2]);
    queues.push(due[1]);
    const served: (string | null)[] = [];
    queues.serve(3n, (one) => served.push(one.document));
    expect(served).toEqual(["A", "B", "C"]);
  });
});
