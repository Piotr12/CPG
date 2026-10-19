import { describe, expect, it } from "vitest";
import { ConflictError } from "../../http/errors";
import { assertWritable, TENANT_READ_ONLY } from "./read-only";

describe("assertWritable", () => {
  it("lets a write to a writable tenant through", () => {
    expect(() => assertWritable({ readOnly: false })).not.toThrow();
  });

  it("refuses a write to a read-only tenant with 409 TENANT_READ_ONLY", () => {
    const error = (() => {
      try {
        assertWritable({ readOnly: true });
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ code: "TENANT_READ_ONLY", status: 409, message: TENANT_READ_ONLY });
  });
});
