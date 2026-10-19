import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalAdminLayout from "./layout";

vi.mock("../../../components/tenants/tenant-header", () => ({
  TenantHeader: ({ scope }: { scope: string }) => <div data-testid="tenant-header" data-tenant={scope} />,
}));

describe("GlobalAdminLayout", () => {
  it("puts the Global header row above the page", () => {
    render(GlobalAdminLayout({ children: <p>page</p>, params: Promise.resolve({}) }));

    const header = screen.getByTestId("tenant-header");
    expect(header.dataset.tenant).toBe("global");
    expect(header.compareDocumentPosition(screen.getByText("page")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
