import { describe, expect, it, vi } from "vitest";
import { globalSingleton } from "./singleton";

describe("globalSingleton", () => {
  it("creates the value once per key", () => {
    const create = vi.fn(() => ({}));

    const first = globalSingleton("singleton-test:once", create);
    const second = globalSingleton("singleton-test:once", create);

    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("compares object keys by identity", () => {
    const key = {};

    expect(globalSingleton(key, () => "a")).toBe("a");
    expect(globalSingleton({}, () => "b")).toBe("b");
    expect(globalSingleton(key, () => "c")).toBe("a");
  });

  it("keeps a resolved promise", async () => {
    const create = vi.fn(async () => "ready");

    await expect(globalSingleton("singleton-test:resolved", create)).resolves.toBe("ready");
    await expect(globalSingleton("singleton-test:resolved", create)).resolves.toBe("ready");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("drops a rejected promise so the next call retries", async () => {
    const key = "singleton-test:rejected";

    await expect(globalSingleton(key, () => Promise.reject(new Error("no database")))).rejects.toThrow(
      "no database",
    );
    await expect(globalSingleton(key, async () => "retried")).resolves.toBe("retried");
  });
});
