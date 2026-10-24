import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../tests/setup/server-components";
import { en } from "../../../i18n/messages/en";
import { pl } from "../../../i18n/messages/pl";
import { BackLink, type BackLinkProps } from "./back-link";
import TenantNotFound from "./not-found";

/** The first element of `type` in a rendered tree. */
function findElement(node: ReactNode, type: unknown): ReactElement<BackLinkProps> {
  const found = Children.toArray(node)
    .filter(isValidElement<{ children?: ReactNode }>)
    .map((child) => (child.type === type ? child : findElement(child.props.children, type)))
    .find(Boolean);
  return found as ReactElement<BackLinkProps>;
}

const mocks = vi.hoisted(() => ({ connection: vi.fn(), getMessages: vi.fn(), pathname: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ usePathname: mocks.pathname }));
vi.mock("@cpg/core", () => ({ TENANT_NAMES: { test: "Test", prod: "Prod" } }));
vi.mock("../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

describe("TenantNotFound", () => {
  beforeEach(() => {
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
    mocks.pathname.mockReturnValue("/admin/test/materials/99999999");
  });
  afterEach(() => vi.clearAllMocks());

  it("says the record isn't in this tenant and leads back to its list, at request time", async () => {
    render(await resolveServerComponents(TenantNotFound()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(screen.getByText("Page not found.")).toBeTruthy();
    expect(screen.getByText("The address may be mistyped, or the record belongs to the other tenant.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Materials" }).getAttribute("href")).toBe("/admin/test/materials");
    expect(document.querySelector("main")?.className).toContain("max-w-3xl");
  });

  it("names the tenant's Overview in the reader's language when the address is in no list", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });
    mocks.pathname.mockReturnValue("/admin/prod/no-such-list");

    render(await resolveServerComponents(TenantNotFound()));

    const link = screen.getByRole("link", { name: "Wróć do strony Przegląd — Prod" });
    expect(link.getAttribute("href")).toBe("/admin/prod");
    expect(link.closest("[lang]")?.getAttribute("lang")).toBe("pl");
  });

  it("hands the way back plain data only, which a client component can receive (lesson 2026-10-20)", async () => {
    const content = (await resolveServerComponents(TenantNotFound())) as ReactElement;
    const backLink = findElement(content, BackLink);

    // JSON keeps strings, numbers and objects; a function would be dropped and the round trip would differ.
    expect(JSON.parse(JSON.stringify(backLink.props))).toEqual(backLink.props);
    expect(backLink.props.lists).toContainEqual(expect.objectContaining({ id: "productionOrders", label: "Production orders" }));
    expect(backLink.props.lists).not.toContainEqual(expect.objectContaining({ id: "overview" }));
  });

  it("shows the loading frame first", () => {
    const { container } = render(TenantNotFound().props.children.props.fallback);

    expect(container.querySelector('[aria-busy="true"] [data-slot="skeleton"]')).toBeTruthy();
    expect(container.textContent).toBe("");
  });
});
