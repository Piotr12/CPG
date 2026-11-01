import { describe, expect, it } from "vitest";
import { isRevisionValidOn } from "./bom-validity";

describe("isRevisionValidOn", () => {
  const window = { validFrom: "2026-11-05", validThrough: "2026-11-20" };

  it("is valid inside the window and on both edges", () => {
    expect(isRevisionValidOn(window, "2026-11-10")).toBe(true);
    expect(isRevisionValidOn(window, "2026-11-05")).toBe(true);
    expect(isRevisionValidOn(window, "2026-11-20")).toBe(true);
  });

  it("is not valid before the window starts or after it ends", () => {
    expect(isRevisionValidOn(window, "2026-11-04")).toBe(false);
    expect(isRevisionValidOn(window, "2026-11-21")).toBe(false);
  });

  it("is open-ended without an end, whether null or not loaded", () => {
    expect(isRevisionValidOn({ validFrom: "2026-11-05", validThrough: null }, "2099-12-31")).toBe(true);
    expect(isRevisionValidOn({ validFrom: "2026-11-05" }, "2099-12-31")).toBe(true);
    expect(isRevisionValidOn({ validFrom: "2026-11-05", validThrough: null }, "2026-11-04")).toBe(false);
  });
});
