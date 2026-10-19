import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TenantSwitchLinks, tenantHome } from "./tenant-switch-links";

describe("TenantSwitchLinks", () => {
  it("links each tenant through hrefFor and marks only the current one", () => {
    render(
      <TenantSwitchLinks
        tenants={[
          { code: "test", name: "Test" },
          { code: "prod", name: "Prod" },
        ]}
        current="prod"
        hrefFor={tenantHome}
      />,
    );

    expect(screen.getByRole("link", { name: "Test" }).getAttribute("href")).toBe("/admin/test");
    expect(screen.getByRole("link", { name: "Test" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "Prod" }).getAttribute("aria-current")).toBe("page");
  });
});
