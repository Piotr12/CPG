import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalAdminLayout from "./layout";

vi.mock("../../../components/tenants/tenant-strip", () => ({
  TenantStrip: ({ scope }: { scope: string }) => <div data-testid="strip" data-tenant={scope} />,
}));

describe("GlobalAdminLayout", () => {
  it("puts the Global strip above the page", () => {
    render(GlobalAdminLayout({ children: <p>page</p>, params: Promise.resolve({}) }));

    const strip = screen.getByTestId("strip");
    expect(strip.dataset.tenant).toBe("global");
    expect(strip.compareDocumentPosition(screen.getByText("page")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
