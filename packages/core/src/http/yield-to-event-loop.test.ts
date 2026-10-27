import { describe, expect, it } from "vitest";
import { yieldToEventLoop } from "./yield-to-event-loop";

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
