import { describe, expect, it } from "vitest";
import { errorReference } from "./error-reference";

describe("errorReference", () => {
  it("quotes a server error's digest", () => {
    expect(errorReference(Object.assign(new Error("boom"), { digest: "2913876712" }))).toBe("2913876712");
  });

  it("is a dash for an error without a digest, or a thrown value that isn't an error", () => {
    expect(errorReference(new Error("boom"))).toBe("—");
    expect(errorReference(Object.assign(new Error("boom"), { digest: 42 }))).toBe("—");
    expect(errorReference({ digest: "2913876712" })).toBe("—");
    expect(errorReference("boom")).toBe("—");
  });
});
