import { describe, expect, it } from "vitest";
import { isCurrentPath } from "./current-path";

describe("isCurrentPath", () => {
  it("matches the entry's own screen", () => {
    expect(isCurrentPath("/admin/tokens", "/admin/tokens")).toBe(true);
    expect(isCurrentPath("/admin", "/admin")).toBe(true);
  });

  it("matches pages under an entry", () => {
    expect(isCurrentPath("/admin/test", "/admin/test/audit")).toBe(true);
  });

  it("doesn't let the tenant chooser match every /admin page", () => {
    expect(isCurrentPath("/admin", "/admin/tokens")).toBe(false);
  });

  it("doesn't match a path that only shares a prefix", () => {
    expect(isCurrentPath("/admin/test", "/admin/testing")).toBe(false);
    expect(isCurrentPath("/help", "/admin")).toBe(false);
  });
});
