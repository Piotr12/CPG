import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { AppSidebar, SidebarSkeleton } from "./app-sidebar";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  currentUser: vi.fn(),
  currentPreferences: vi.fn(),
  getMessages: vi.fn(),
  documentPreferences: vi.fn(),
  sidebarNav: vi.fn(),
  visitorBar: vi.fn(),
  listTenants: vi.fn(),
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  requestScope: async () => ({ cradle: { tenantService: { list: mocks.listTenants } } }),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../../app/admin/actions", () => ({ signOut: vi.fn(), updatePreferences: vi.fn() }));
vi.mock("../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));
vi.mock("../../preferences/current-preferences", () => ({ currentPreferences: mocks.currentPreferences }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../preferences/document-preferences", () => ({
  DocumentPreferences: (props: object) => {
    mocks.documentPreferences(props);
    return null;
  },
}));
// The client parts have their own tests; here, what the server hands them.
vi.mock("./sidebar-nav", () => ({
  SidebarNav: (props: { account: { panel: React.ReactNode } }) => {
    mocks.sidebarNav(props);
    return <div data-testid="sidebar">{props.account.panel}</div>;
  },
}));
vi.mock("./visitor-bar", () => ({
  VisitorBar: (props: object) => {
    mocks.visitorBar(props);
    return <header data-testid="visitor-bar" />;
  },
}));

function as(user: object | null, locale: "en" | "pl", theme: "light" | "dark") {
  mocks.listTenants.mockResolvedValue([
    { code: "test", name: "Test", generation: 1, readOnly: false },
    { code: "prod", name: "Prod", generation: 1, readOnly: true },
  ]);
  mocks.currentUser.mockResolvedValue(user);
  mocks.currentPreferences.mockResolvedValue({ locale, theme });
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
}

describe("AppSidebar", () => {
  afterEach(() => vi.clearAllMocks());

  it("gives a signed-in account its sidebar, in its language, and applies its preferences", async () => {
    as({ userId: "u1", username: "alice", role: "user" }, "pl", "dark");

    render(await AppSidebar());

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.documentPreferences).toHaveBeenCalledWith({ locale: "pl", theme: "dark", isSignedIn: true });
    expect(mocks.visitorBar).not.toHaveBeenCalled();
    const props = mocks.sidebarNav.mock.calls[0][0];
    expect(props.locale).toBe("pl");
    expect(props.readOnly).toEqual({ test: false, prod: true });
    expect(props.model.shared.map((item: { id: string }) => item.id)).toEqual(["globalAudit", "help"]);
    expect(props.model.tenant[0].label).toBe("Przegląd");
    expect(props.account).toMatchObject({ name: "alice", role: "Użytkownik" });
    expect(props.labels).toMatchObject({
      menu: "Menu",
      close: "Zamknij",
      collapse: "Zwiń menu",
      sidebar: "Nawigacja",
      shared: "Wspólne dla Test i Prod",
      sharedNote: "Ta strona jest wspólna dla Test i Prod",
      tenantNames: { test: "Test", prod: "Prod" },
      tenantSwitch: { test: "Środowisko: Test", prod: "Środowisko: Prod" },
      menuShows: { test: "Menu pokazuje: Test", prod: "Menu pokazuje: Prod" },
      captions: { test: "Dane demonstracyjne, można bezpiecznie eksperymentować", prod: "Dane rzeczywiste" },
      readOnly: "tylko do odczytu",
      readOnlyCaption: "Tylko do odczytu — zmiany biznesowe są zablokowane",
    });
    // The account card's popover holds the account's own controls.
    const panel = within(screen.getByTestId("sidebar"));
    expect(panel.getByText("alice").tagName).toBe("STRONG");
    expect(panel.getByRole("link", { name: "Tokeny API" })).toBeTruthy();
  });

  it("gives the admin Administration and the Administrator role", async () => {
    as({ userId: "u0", username: "admin", role: "admin" }, "en", "light");

    render(await AppSidebar());

    const props = mocks.sidebarNav.mock.calls[0][0];
    expect(props.model.shared[0]).toMatchObject({ id: "administration", label: "Administration" });
    expect(props.account.role).toBe("Administrator");
    expect(props.labels.expand).toBe("Expand menu");
  });

  it("gives a visitor the visitor bar, and tells the document it is signed out", async () => {
    as(null, "en", "light");

    render(await AppSidebar());

    expect(screen.getByTestId("visitor-bar")).toBeTruthy();
    expect(mocks.sidebarNav).not.toHaveBeenCalled();
    // A visitor's bar needs no tenant metadata.
    expect(mocks.listTenants).not.toHaveBeenCalled();
    expect(mocks.visitorBar).toHaveBeenCalledWith({ locale: "en", labels: { menu: "Menu", help: "Help", signIn: "Sign in" } });
    expect(mocks.documentPreferences).toHaveBeenCalledWith({ locale: "en", theme: "light", isSignedIn: false });
  });
});

describe("SidebarSkeleton", () => {
  it("reserves the sidebar's column from md and the top bar below it, without text", () => {
    const { container } = render(<SidebarSkeleton />);
    const skeleton = container.firstElementChild as HTMLElement;
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton.className).toContain("h-12");
    expect(skeleton.className).toContain("md:w-(--sidebar-width)");
    expect(skeleton.textContent).toBe("");
  });
});
