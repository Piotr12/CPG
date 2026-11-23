import { describe, expect, it } from "vitest";
import { runYielding, yieldToEventLoop } from "./yield-to-event-loop";

describe("yieldToEventLoop", () => {
  it("resolves only after pending I/O-phase callbacks had their turn, unlike a microtask", async () => {
    const order: string[] = [];
    setImmediate(() => order.push("immediate"));
    await Promise.resolve();
    order.push("microtask");
    await yieldToEventLoop();
    order.push("yielded");
    expect(order).toEqual(["microtask", "immediate", "yielded"]);
  });
});

describe("runYielding", () => {
  it("returns the steps' result, letting I/O-phase callbacks run at every pause and only there", async () => {
    const order: string[] = [];
    function* steps(): Generator<void, string, void> {
      setImmediate(() => order.push("immediate 1"));
      order.push("step 1");
      yield;
      setImmediate(() => order.push("immediate 2"));
      order.push("step 2");
      yield;
      order.push("step 3");
      return "done";
    }
    expect(await runYielding(steps())).toBe("done");
    expect(order).toEqual(["step 1", "immediate 1", "step 2", "immediate 2", "step 3"]);
  });

  it("returns at once from steps that never pause", async () => {
    function* steps(): Generator<void, number, void> {
      return 7;
    }
    expect(await runYielding(steps())).toBe(7);
  });
});
