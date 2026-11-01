import { describe, expect, it } from "vitest";
import { isRevisionValidOn, isUsableRevision } from "./bom-validity";

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

describe("isUsableRevision", () => {
  const window = { validFrom: "2026-11-05", validThrough: "2026-11-20" };

  it("is usable when valid on the date with every component active", () => {
    expect(isUsableRevision(window, true, "2026-11-10")).toBe(true);
  });

  it("is not usable with an inactive component, even when valid", () => {
    expect(isUsableRevision(window, false, "2026-11-10")).toBe(false);
  });

  it("is not usable outside its window, even with every component active", () => {
    expect(isUsableRevision(window, true, "2026-11-21")).toBe(false);
  });
});
