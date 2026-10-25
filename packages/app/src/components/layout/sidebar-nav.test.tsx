import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@cpg/ui/components/sidebar";
import { TooltipProvider } from "@cpg/ui/components/tooltip";
import { en } from "../../i18n/messages/en";
import { navModel } from "./nav-items";
import { SidebarNav, type SidebarLabels } from "./sidebar-nav";

const mocks = vi.hoisted(() => ({ pathname: "/admin/test" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
// A plain anchor: jsdom has no router, and a click must not try to navigate.
vi.mock("next/link", () => ({
  default: ({ href, onClick, ...props }: ComponentProps<"a">) => (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
      {...props}
    />
  ),
}));

const labels: SidebarLabels = {
  menu: "Menu",
  close: "Close",
  account: "Account",
  collapse: "Collapse menu",
  expand: "Expand menu",
  sidebar: "Navigation",
  sidebarDescription: "Every screen you can open.",
  shared: "Shared by Test and Prod",
  sharedNote: "This page is shared by Test and Prod",
  tenantNames: { test: "Test", prod: "Prod" },
  tenantSwitch: { test: "Tenant: Test", prod: "Tenant: Prod" },
  menuShows: { test: "Menu shows: Test", prod: "Menu shows: Prod" },
  captions: { test: "Demonstration data, safe to experiment", prod: "Live data" },
  readOnly: "read-only",
  readOnlyCaption: "Read-only — business changes are blocked",
};
const account = { name: "alice", role: "Administrator", panel: <button type="button">Sign out</button> };

beforeAll(() => {
  // Radix positions popovers, menus and tooltips with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

/** Who listens for media-query changes, so a test can resize the window under a mounted sidebar. */
const mediaListeners = new Set<() => void>();
const matchesWidth = (query: string, width: number) => {
  const min = /min-width: (\d+)px/.exec(query);
  const max = /max-width: (\d+)px/.exec(query);
  return (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]));
};

/** Sets the viewport width the sidebar reads (jsdom has no matchMedia): `innerWidth` and every media query. */
function viewport(width: number) {
  window.innerWidth = width;
  window.matchMedia = vi.fn((query: string) => ({
    matches: matchesWidth(query, width),
    addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
}

/** Resizes a mounted sidebar: the new width, then every listener told. */
function resize(width: number) {
  act(() => {
    viewport(width);
    for (const listener of [...mediaListeners]) listener();
  });
}

const WRITABLE = { test: false, prod: false };

const tree = (role: "admin" | "user", readOnly = WRITABLE) => (
  <TooltipProvider>
    <SidebarProvider>
      <SidebarNav model={navModel({ role }, en.nav)} labels={labels} readOnly={readOnly} account={account} locale="en" />
    </SidebarProvider>
  </TooltipProvider>
);

function renderAt(pathname: string, role: "admin" | "user" = "admin", readOnly = WRITABLE) {
  mocks.pathname = pathname;
  const view = render(tree(role, readOnly));
  return {
    ...view,
    navigate(to: string) {
      mocks.pathname = to;
      view.rerender(tree(role, readOnly));
    },
  };
}

const menu = () => within(screen.getByRole("navigation", { name: "Menu" }));
const hrefOf = (name: string) => menu().getByRole("link", { name }).getAttribute("href");
const currentEntries = () =>
  menu()
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);
const tenantSwitch = (name: string) => within(menu().getByRole("group", { name }));

describe("SidebarNav on a desktop", () => {
  beforeEach(() => viewport(1280));

  it("shows the admin the tenant tree and the shared screens, and marks the open screen", () => {
    renderAt("/admin/test/materials");

    expect(menu().getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["CPG", "/admin/test"],
      ["Test", "/admin/test/materials"],
      ["Prod", "/admin/prod/materials"],
      ["Overview", "/admin/test"],
      ["Materials", "/admin/test/materials"],
      ["Locations", "/admin/test/locations"],
      ["Customers", "/admin/test/customers"],
      ["Suppliers", "/admin/test/suppliers"],
      ["Planning parameters", "/admin/test/planning-parameters"],
      ["Safety stock", "/admin/test/safety-stock"],
      ["BOMs", "/admin/test/boms"],
      ["Statistical units", "/admin/test/statistical-units"],
      ["Import", "/admin/test/import"],
      ["Forecasts", "/admin/test/forecasts"],
      ["Production orders", "/admin/test/production-orders"],
      ["Customer orders", "/admin/test/customer-orders"],
      ["Purchase requisitions", "/admin/test/purchase-requisitions"],
      ["Purchase orders", "/admin/test/purchase-orders"],
      ["Transfers", "/admin/test/transfers"],
      ["Stock", "/admin/test/stock"],
      ["Stock import", "/admin/test/stock-import"],
      ["Stock report", "/admin/test/reports/stock"],
      ["Variance report", "/admin/test/reports/variance"],
      ["Audit", "/admin/test/audit"],
      ["Users", "/admin/users"],
      ["Tenants", "/admin"],
      ["Global audit", "/admin/audit"],
      ["Help", "/help"],
    ]);
    expect(currentEntries()).toEqual(["Test", "Materials"]);
    expect(menu().getByRole("button", { name: /Master data/ }).getAttribute("aria-expanded")).toBe("true");
    expect(menu().getByRole("button", { name: /Administration/ }).getAttribute("aria-expanded")).toBe("true");
    expect(menu().getByText("Demonstration data, safe to experiment")).toBeTruthy();
    expect(menu().getByText("Shared by Test and Prod")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Menu" }).getAttribute("lang")).toBe("en");
    // The brand is the mammoth mark beside the name, 20 px, 16 px once folded to the rail; no emoji.
    const mark = menu().getByRole("link", { name: "CPG" }).querySelector("svg[data-slot=mammoth-mark]")!;
    expect(mark.getAttribute("width")).toBe("20");
    expect(mark.getAttribute("class")).toContain("group-data-[collapsible=icon]:size-4");
    expect(document.body.textContent).not.toContain("🦣");
  });

  it("gives a normal user no Administration", () => {
    renderAt("/admin/test", "user");

    expect(menu().queryByRole("button", { name: /Administration/ })).toBeNull();
    expect(menu().queryByRole("link", { name: "Users" })).toBeNull();
    expect(currentEntries()).toEqual(["Test", "Overview"]);
  });

  it("switches tenant on the same section, and from a record page to the list (TEN-010, TEN-012)", () => {
    renderAt("/admin/prod/materials/00000005");

    const group = tenantSwitch("Tenant: Prod");
    expect(group.getByRole("link", { name: "Prod" }).getAttribute("aria-current")).toBe("page");
    expect(group.getByRole("link", { name: "Test" }).getAttribute("href")).toBe("/admin/test/materials");
    expect(currentEntries()).toEqual(["Prod", "Materials"]);
    expect(menu().getByText("Live data")).toBeTruthy();
  });

  it("keeps a group open while it holds the current page, and lets the others fold", () => {
    renderAt("/admin/test/locations");
    const masterData = menu().getByRole("button", { name: /Master data/ });
    const administration = menu().getByRole("button", { name: /Administration/ });

    fireEvent.click(masterData);
    fireEvent.click(administration);

    expect(masterData.getAttribute("aria-expanded")).toBe("true");
    expect(menu().getByRole("link", { name: "Locations" })).toBeTruthy();
    expect(administration.getAttribute("aria-expanded")).toBe("false");
    expect(menu().queryByRole("link", { name: "Users" })).toBeNull();
  });

  it("opens a folded group once it holds the current page, and doesn't fold it when the page moves on", () => {
    const view = renderAt("/admin/test/audit");
    const masterData = () => menu().getByRole("button", { name: /Master data/ });
    fireEvent.click(masterData());
    expect(masterData().getAttribute("aria-expanded")).toBe("false");

    view.navigate("/admin/test/locations");
    expect(masterData().getAttribute("aria-expanded")).toBe("true");
    // Folding the group that holds the current page is ignored now, and not deferred to later.
    fireEvent.click(masterData());
    view.navigate("/admin/test/audit");

    expect(masterData().getAttribute("aria-expanded")).toBe("true");
    expect(menu().getByRole("link", { name: "Locations" })).toBeTruthy();
  });

  it("on a shared page, says the page is shared and lets the switch re-target the tree without navigating (Q7)", () => {
    renderAt("/admin/users");

    expect(currentEntries()).toEqual(["Users"]);
    expect(menu().getByText("This page is shared by Test and Prod")).toBeTruthy();
    const test = tenantSwitch("Menu shows: Test").getByRole("button", { name: "Test" });
    expect(test.getAttribute("aria-pressed")).toBe("true");
    expect(hrefOf("Materials")).toBe("/admin/test/materials");

    fireEvent.click(tenantSwitch("Menu shows: Test").getByRole("button", { name: "Prod" }));

    expect(tenantSwitch("Menu shows: Prod").getByRole("button", { name: "Prod" }).getAttribute("aria-pressed")).toBe("true");
    expect(hrefOf("Materials")).toBe("/admin/prod/materials");
    expect(hrefOf("CPG")).toBe("/admin/prod");
  });

  it("remembers the last tenant page's tenant on a shared page", () => {
    const view = renderAt("/admin/test/audit");
    view.navigate("/admin/prod/audit");

    view.navigate("/admin/audit");

    expect(currentEntries()).toEqual(["Global audit"]);
    expect(tenantSwitch("Menu shows: Prod")).toBeTruthy();
    expect(hrefOf("Overview")).toBe("/admin/prod");
  });

  it("locks a read-only tenant's side of the switch and says so in the caption on its pages (R05)", () => {
    const view = renderAt("/admin/prod/materials", "admin", { test: false, prod: true });

    const group = tenantSwitch("Tenant: Prod");
    expect(group.getByRole("link", { name: "Prod (read-only)" }).getAttribute("aria-current")).toBe("page");
    expect(group.getByRole("link", { name: "Test" })).toBeTruthy();
    expect(menu().getByText("Read-only — business changes are blocked")).toBeTruthy();
    expect(menu().queryByText("Live data")).toBeNull();

    // A writable tenant keeps its own caption; a shared page keeps the shared note.
    view.navigate("/admin/test/materials");
    expect(menu().getByText("Demonstration data, safe to experiment")).toBeTruthy();
    view.navigate("/admin/users");
    expect(menu().getByText("This page is shared by Test and Prod")).toBeTruthy();
  });

  it("marks only Tenants on /admin, which prefixes every page", () => {
    renderAt("/admin");
    expect(currentEntries()).toEqual(["Tenants"]);
  });

  it("collapses to the rail, where a group opens its entries as a fly-out", async () => {
    renderAt("/admin/test/materials");

    fireEvent.click(menu().getByRole("button", { name: "Collapse menu" }));

    expect(menu().getByRole("button", { name: "Expand menu" })).toBeTruthy();
    expect(menu().queryByRole("link", { name: "Locations" })).toBeNull();
    const masterData = document.querySelector<HTMLElement>("[data-group=masterData]")!;
    expect(masterData.dataset.active).toBe("true");

    await act(async () => fireEvent.keyDown(masterData, { key: "Enter" }));

    const flyOut = within(screen.getByRole("menu"));
    expect(flyOut.getByText("Master data")).toBeTruthy();
    expect(flyOut.getByRole("menuitem", { name: "Locations" }).getAttribute("href")).toBe("/admin/test/locations");
    expect(flyOut.getByRole("menuitem", { name: "Materials" }).getAttribute("aria-current")).toBe("page");
    expect(flyOut.getByRole("menuitem", { name: "Suppliers" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("menu").getAttribute("lang")).toBe("en");
  });

  it("opens the account card's popover, to the right in the rail, and closes it on navigation", () => {
    const view = renderAt("/admin/test");
    fireEvent.click(menu().getByRole("button", { name: "Collapse menu" }));
    const card = screen.getByRole("button", { name: "Account: alice" });
    expect(within(card).getByText("Administrator")).toBeTruthy();
    // A quiet account icon, not an initial in a filled circle; in the rail the icon alone keeps the card's name.
    const icon = card.querySelector("svg[data-account-icon]")!;
    expect(icon.getAttribute("class")).toContain("lucide-circle-user-round");
    expect(icon.getAttribute("class")).toContain("text-muted-foreground");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(within(card).queryByText("A")).toBeNull();
    expect(card.querySelector(".rounded-full")).toBeNull();

    fireEvent.click(card);
    const popover = screen.getByRole("dialog", { name: "Account" });
    expect(popover.dataset.side).toBe("right");
    expect(popover.getAttribute("lang")).toBe("en");
    expect(within(popover).getByRole("button", { name: "Sign out" })).toBeTruthy();

    view.navigate("/admin/test/audit");

    expect(screen.queryByRole("dialog", { name: "Account" })).toBeNull();
  });

  it("opens the account popover upwards when expanded, and shows the card as current on API tokens", () => {
    renderAt("/admin/tokens");
    const card = screen.getByRole("button", { name: "Account: alice" });
    expect(card.dataset.active).toBe("true");
    expect(currentEntries()).toEqual([]);

    fireEvent.click(card);

    expect(screen.getByRole("dialog", { name: "Account" }).dataset.side).toBe("top");
  });
});

describe("SidebarNav between 768 and 1023 px (D6)", () => {
  beforeEach(() => viewport(800));
  afterEach(() => viewport(1280));

  const state = () => document.querySelector<HTMLElement>("[data-slot=sidebar]")!.dataset.state;

  it("starts as the icon rail, the switch folded to its letters with the tenants' names", () => {
    renderAt("/admin/prod/materials", "admin", { test: false, prod: true });

    expect(state()).toBe("collapsed");
    expect(menu().getByRole("button", { name: "Expand menu" })).toBeTruthy();
    const group = tenantSwitch("Tenant: Prod");
    expect(group.getByRole("link", { name: "Test" }).textContent).toBe("T");
    expect(group.getByRole("link", { name: "Prod (read-only)" }).textContent).toBe("P");
    expect(group.getByRole("link", { name: "Prod (read-only)" }).getAttribute("aria-current")).toBe("page");
    // The account card is the icon alone, and keeps its name.
    expect(screen.getByRole("button", { name: "Account: alice" }).querySelector("svg[data-account-icon]")).not.toBeNull();
  });

  it("expands from lg and folds again below it, while the account hasn't toggled it", () => {
    renderAt("/admin/test");
    expect(state()).toBe("collapsed");

    resize(1280);
    expect(state()).toBe("expanded");
    expect(tenantSwitch("Tenant: Test").getByRole("link", { name: "Test" }).textContent).toBe("Test");

    resize(900);
    expect(state()).toBe("collapsed");
  });

  it("leaves the sidebar as the account set it for the rest of the page session, and stores nothing", () => {
    const view = renderAt("/admin/test");
    fireEvent.click(menu().getByRole("button", { name: "Expand menu" }));
    expect(state()).toBe("expanded");

    resize(900);
    view.navigate("/admin/test/audit");
    resize(1280);
    resize(800);

    expect(state()).toBe("expanded");
    expect(document.cookie).not.toContain("sidebar");
  });

  it("takes over from the drawer once the window widens into the band", () => {
    viewport(390);
    renderAt("/admin/test");

    resize(800);

    expect(state()).toBe("collapsed");
  });

  it("starts expanded at lg and folds when the window narrows into the band", () => {
    viewport(1280);
    renderAt("/admin/test");
    expect(state()).toBe("expanded");

    resize(1000);

    expect(state()).toBe("collapsed");
  });
});

describe("SidebarNav below 768 px", () => {
  beforeEach(() => viewport(390));
  afterEach(() => viewport(1280));

  const drawer = () => screen.queryByRole("dialog", { name: "Navigation" });
  const openDrawer = () => fireEvent.click(screen.getByRole("button", { name: "Menu" }));

  it("shows a top bar with Menu, the brand and the compact switch", () => {
    renderAt("/admin/test/materials");

    const bar = within(screen.getByRole("banner"));
    expect(bar.getByRole("link", { name: "CPG" }).getAttribute("href")).toBe("/admin/test");
    expect(bar.getByRole("link", { name: "CPG" }).querySelector("svg[data-slot=mammoth-mark]")!.getAttribute("width")).toBe("20");
    // The top bar's switch keeps the names: it is never the rail.
    expect(bar.getByRole("link", { name: "Prod" }).textContent).toBe("Prod");
    expect(bar.getByRole("group", { name: "Tenant: Test" }).className).toContain("w-32");
    expect(bar.getByRole("link", { name: "Prod" }).getAttribute("href")).toBe("/admin/prod/materials");
    expect(drawer()).toBeNull();
  });

  it("opens the menu as a drawer with its own Close button, which gives focus back to Menu", async () => {
    renderAt("/admin/test");
    const button = screen.getByRole("button", { name: "Menu" });
    button.focus();

    openDrawer();

    expect(drawer()!.dataset.side).toBe("left");
    expect(within(drawer()!).getByText("Every screen you can open.")).toBeTruthy();
    expect(within(drawer()!).queryByRole("button", { name: "Collapse menu" })).toBeNull();
    // The sheet's own corner button is hidden by the sidebar's CSS, which jsdom doesn't apply.
    const close = within(drawer()!)
      .getAllByRole("button", { name: "Close" })
      .find((candidate) => candidate.dataset.slot !== "sheet-close")!;
    fireEvent.click(close);
    expect(drawer()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("closes the drawer on Escape", () => {
    renderAt("/admin/test");
    openDrawer();

    fireEvent.keyDown(drawer()!, { key: "Escape" });

    expect(drawer()).toBeNull();
  });

  it("closes the drawer when a link in it is followed, and when the page changes", () => {
    const view = renderAt("/admin/test");
    openDrawer();
    fireEvent.click(within(drawer()!).getByRole("link", { name: "Materials" }));
    expect(drawer()).toBeNull();

    openDrawer();
    view.navigate("/admin/test/audit");
    expect(drawer()).toBeNull();
  });
});
