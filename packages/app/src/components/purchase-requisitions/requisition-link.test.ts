import { describe, expect, it } from "vitest";
import { requisitionHref } from "./requisition-link";

describe("requisitionHref", () => {
  it("opens the list's page of 100 that shows the requisition (#187)", () => {
    expect(requisitionHref("test", "00000001")).toBe("/admin/test/purchase-requisitions?page=1");
    expect(requisitionHref("test", "00000100")).toBe("/admin/test/purchase-requisitions?page=1");
    expect(requisitionHref("prod", "00000101")).toBe("/admin/prod/purchase-requisitions?page=2");
    expect(requisitionHref("prod", "00000250")).toBe("/admin/prod/purchase-requisitions?page=3");
  });
});
