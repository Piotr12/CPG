import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../tests/setup/server-components";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { TenantHeader, TenantHeaderText } from "./tenant-header";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), getMessages: vi.fn(), currentUser: vi.fn(), pathname: "/admin/test/materials" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

function as(locale: "en" | "pl", role: "admin" | "user" | null = "admin") {
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
  mocks.currentUser.mockResolvedValue(role && { userId: "u1", username: "alice", role });
}

describe("TenantHeader", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    ["test", "TEST", "border-t-amber-500", "bg-amber-200"],
    ["prod", "PROD", "border-t-red-600", "bg-neutral-900"],
  ] as const)("names the %s tenant in words and colour, with the trail to the open page (TEN-011)", async (scope, tag, edge, tagColour) => {
    as("en");
    mocks.pathname = `/admin/${scope}/materials/00000005`;

    render(await resolveServerComponents(TenantHeader({ scope })));

    const header = screen.getByRole("region", { name: `${tag} Active tenant` });
    expect(header.dataset.tenant).toBe(scope);
    expect(header.className).toContain(edge);
    expect(within(header).getByText(tag).className).toContain(tagColour);
    expect(within(header).getByText("Active tenant").className).toBe("sr-only");
    const trail = within(within(header).getByRole("navigation", { name: "You are here" }));
    expect(trail.getByText("Master data")).toBeTruthy();
    expect(trail.getByText("Materials").getAttribute("aria-current")).toBe("page");
  });

  it("marks pages outside any tenant as Global and says so in visible words", async () => {
    as("en");
    mocks.pathname = "/admin/users";

    render(await resolveServerComponents(TenantHeader({ scope: "global" })));

    const name = "GLOBAL Shared by Test and Prod — switching tenant doesn't change this page";
    const header = screen.getByRole("region", { name });
    expect(header.className).toContain("border-t-border");
    expect(within(header).getByText(/^Shared by Test and Prod/).className).not.toContain("sr-only");
    expect(within(header).getByRole("navigation", { name: "You are here" }).textContent).toBe("AdministrationUsers");
  });

  it("shows no trail where the sidebar doesn't hold the page", async () => {
    as("en", "user");
    mocks.pathname = "/admin";

    render(await resolveServerComponents(TenantHeader({ scope: "global" })));

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("describes the scope in the reader's language, at request time", async () => {
    as("pl");
    mocks.pathname = "/admin/prod";

    render(await TenantHeaderText({ scope: "prod" }));

    expect(mocks.connection).toHaveBeenCalledOnce();
    const text = screen.getByText("Aktywne środowisko");
    expect(text.parentElement!.getAttribute("lang")).toBe("pl");
    expect(screen.getByRole("navigation", { name: "Jesteś tutaj" }).textContent).toBe("Przegląd");
  });

  it("renders only its words when the session check fails closed (the page's own gate redirects)", async () => {
    as("en", null);

    render(await TenantHeaderText({ scope: "test" }));

    expect(screen.getByText("Active tenant")).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
