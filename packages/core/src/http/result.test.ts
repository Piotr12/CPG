import { describe, expect, it } from "vitest";
import { fail, ok } from "./result";

describe("result envelope", () => {
  it("wraps data in an ok result", () => {
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
  });

  it("wraps an error body in a failed result", () => {
    expect(fail({ code: "X", message: "No." })).toEqual({ ok: false, error: { code: "X", message: "No." } });
  });
});
