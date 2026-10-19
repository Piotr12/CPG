import { afterEach, describe, expect, it, vi } from "vitest";
import { formValues, refreshAfterWrite } from "./refresh-after-write";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

describe("formValues", () => {
  it("keeps an object and turns anything else into no values", () => {
    expect(formValues({ name: "x" })).toEqual({ name: "x" });
    for (const value of [null, undefined, "x", 3]) expect(formValues(value)).toEqual({});
  });
});

describe("refreshAfterWrite", () => {
  afterEach(() => vi.clearAllMocks());

  it("refreshes every path after a success or a stale version, and returns the result", () => {
    const ok = { ok: true as const, data: 1 };
    const stale = { ok: false as const, error: { code: "VERSION_CONFLICT", message: "x" } };

    expect(refreshAfterWrite(ok, "/a", "/b")).toBe(ok);
    expect(refreshAfterWrite(stale, "/c")).toBe(stale);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/a"], ["/b"], ["/c"]]);
  });

  it("refreshes nothing after any other failure", () => {
    refreshAfterWrite({ ok: false, error: { code: "FORBIDDEN", message: "x" } }, "/a");

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
