import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalAdminLayout from "./layout";

vi.mock("@cpg/core", () => ({ TENANT_CODES: ["test", "prod"], TENANT_NAMES: { test: "Test", prod: "Prod" } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

describe("GlobalAdminLayout", () => {
  it("puts the Global strip above the page", () => {
    render(GlobalAdminLayout({ children: <p>page</p>, params: Promise.resolve({}) }));

    const strip = screen.getByRole("region", { name: "Active tenant" });
    expect(strip.dataset.tenant).toBe("global");
    expect(strip.compareDocumentPosition(screen.getByText("page")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
