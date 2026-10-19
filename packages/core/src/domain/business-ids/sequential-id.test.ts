import { describe, expect, it } from "vitest";
import { formatSequentialId, nextSequentialId } from "./sequential-id";

const exhausted = { code: "THINGS_IDS_EXHAUSTED", message: "No thing IDs left." };

describe("formatSequentialId", () => {
  it("zero-pads to eight digits", () => {
    expect(formatSequentialId(1)).toBe("00000001");
    expect(formatSequentialId(12345678)).toBe("12345678");
  });
});

describe("nextSequentialId", () => {
  it("starts an empty kind at 00000001", () => {
    expect(nextSequentialId(null, exhausted)).toBe("00000001");
  });

  it("follows the highest ID", () => {
    expect(nextSequentialId("00000041", exhausted)).toBe("00000042");
    expect(nextSequentialId("99999998", exhausted)).toBe("99999999");
  });

  it("refuses to go past eight digits with the kind's own code and message", () => {
    expect(() => nextSequentialId("99999999", exhausted)).toThrow(
      expect.objectContaining({ code: "THINGS_IDS_EXHAUSTED", status: 409, message: "No thing IDs left." }),
    );
  });
});
