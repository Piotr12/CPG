import { render, screen, cleanup } from "@testing-library/react";
import { expect, it } from "vitest";
import { productionBlockerError } from "./production-blocker-error";
it("links only valid production blockers and preserves translated context", () => {
  const format = productionBlockerError({ errors: { LOCATION_HAS_PRODUCTION_ORDERS: "Open order {order}" } }, "prod");
  for (const code of ["LOCATION_HAS_PRODUCTION_ORDERS", "MATERIAL_HAS_PRODUCTION_ORDERS"]) {
    render(<>{format({ code, message: "Blocked", params: { order: "00000017" } })}</>);
    expect(screen.getByRole("link", { name: "00000017" }).getAttribute("href")).toBe("/admin/prod/production-orders/00000017"); cleanup();
  }
  for (const error of [{ code: "OTHER", message: "Other" }, { code: "LOCATION_HAS_PRODUCTION_ORDERS", message: "No context" }, { code: "LOCATION_HAS_PRODUCTION_ORDERS", message: "Bad", params: { order: "../../admin" } }]) {
    render(<>{format(error)}</>); expect(screen.queryByRole("link")).toBeNull(); cleanup();
  }
});
