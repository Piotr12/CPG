import { describe, expect, it } from "vitest";
import type { ProductionCompletion, ProductionCompletionLine, ProductionOrder, StockMovement } from "@cpg/db";
import { assertCompletionHistory, completionAlreadyReversed, PRODUCTION_COMPLETION_MOVEMENT } from "./completion-reversal";

const order = { output: { id: "bar" }, location: { id: "plant" } } as ProductionOrder;
const line = (material: string, actual: string) => ({ material: { id: material }, actual }) as ProductionCompletionLine;
const movement = (material: string, quantity: string, type = PRODUCTION_COMPLETION_MOVEMENT, location = "plant") =>
  ({ type, quantity, material: { id: material }, location: { id: location } }) as StockMovement;
const completion = (quantity: string) => ({ quantity }) as ProductionCompletion;
const inconsistent = expect.objectContaining({ code: "STOCK_REVERSAL_INCONSISTENT" });

describe("assertCompletionHistory", () => {
  it("accepts the output in, then each used input out, skipping unused lines and a waste output", () => {
    expect(() => assertCompletionHistory(order, completion("10.000000"), [line("cocoa", "5.000000"), line("wrapper", "0.000000")],
      [movement("bar", "10.000000"), movement("cocoa", "-5.000000")])).not.toThrow();
    expect(() => assertCompletionHistory(order, completion("0.000000"), [line("cocoa", "5.000000")], [movement("cocoa", "-5.000000")])).not.toThrow();
  });

  it.each([
    ["a missing movement", [movement("bar", "10.000000")]],
    ["another movement type", [movement("bar", "10.000000", "correction"), movement("cocoa", "-5.000000")]],
    ["another material", [movement("bar", "10.000000"), movement("milk", "-5.000000")]],
    ["another location", [movement("bar", "10.000000", PRODUCTION_COMPLETION_MOVEMENT, "warehouse"), movement("cocoa", "-5.000000")]],
    ["another quantity", [movement("bar", "10.000000"), movement("cocoa", "-4.000000")]],
    ["the wrong sign", [movement("bar", "-10.000000"), movement("cocoa", "-5.000000")]],
  ])("refuses %s", (_, movements) => {
    expect(() => assertCompletionHistory(order, completion("10.000000"), [line("cocoa", "5.000000")], movements)).toThrow(inconsistent);
  });
});

it("names the existing reversal when it is known", () => {
  expect(completionAlreadyReversed("posting")).toMatchObject({ code: "PRODUCTION_COMPLETION_ALREADY_REVERSED", status: 409, messageParams: { reversal: "posting" } });
  expect(completionAlreadyReversed(null).messageParams).toBeUndefined();
});
