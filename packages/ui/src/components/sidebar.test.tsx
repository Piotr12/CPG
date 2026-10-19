import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./sidebar";
import { TooltipProvider } from "./tooltip";

const SHEET = { sheetTitle: "Menu", sheetDescription: "Every screen you can open" };

beforeAll(() => {
  // Radix positions tooltips with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

/** Sets the viewport width that `useIsMobile` reads (jsdom has no matchMedia). */
function viewport(width: number) {
  window.innerWidth = width;
  window.matchMedia = vi.fn().mockReturnValue({ addEventListener: vi.fn(), removeEventListener: vi.fn() });
}

function renderInProvider(children: ReactNode, provider: Partial<Parameters<typeof SidebarProvider>[0]> = {}) {
  return render(
    <TooltipProvider>
      <SidebarProvider {...provider}>{children}</SidebarProvider>
    </TooltipProvider>,
  );
}

const sidebarRoot = () => document.querySelector<HTMLElement>("[data-slot=sidebar]")!;

describe("SidebarProvider and Sidebar", () => {
  beforeEach(() => viewport(1280));
  afterEach(() => {
    document.cookie = "";
  });

  it("starts expanded and collapses to the icon rail from the trigger, without writing a cookie (Q8)", () => {
    const onClick = vi.fn();
    renderInProvider(
      <>
        <Sidebar collapsible="icon" className="sb" {...SHEET}>
          <SidebarContent>body</SidebarContent>
          <SidebarRail label="Collapse menu" />
        </Sidebar>
        <SidebarTrigger label="Collapse menu" onClick={onClick} />
      </>,
    );
    const wrapper = document.querySelector<HTMLElement>("[data-slot=sidebar-wrapper]")!;
    expect(wrapper.style.getPropertyValue("--sidebar-width")).toBe("16rem");
    expect(sidebarRoot().dataset.state).toBe("expanded");
    expect(sidebarRoot().dataset.collapsible).toBe("");
    expect(document.querySelector("[data-slot=sidebar-container]")!.classList).toContain("sb");

    const trigger = document.querySelector<HTMLElement>("[data-slot=sidebar-trigger]")!;
    expect(screen.getAllByText("Collapse menu")[0].parentElement).toBe(trigger);
    fireEvent.click(trigger);

    expect(onClick).toHaveBeenCalledOnce();
    expect(sidebarRoot().dataset.state).toBe("collapsed");
    expect(sidebarRoot().dataset.collapsible).toBe("icon");
    expect(document.cookie).toBe("");

    const rail = document.querySelector<HTMLElement>("[data-slot=sidebar-rail]")!;
    expect(rail.getAttribute("aria-label")).toBe("Collapse menu");
    expect(rail.getAttribute("title")).toBe("Collapse menu");
    fireEvent.click(rail);
    expect(sidebarRoot().dataset.state).toBe("expanded");
  });

  it("toggles with Ctrl+B and ⌘B, and ignores other keys", () => {
    renderInProvider(<Sidebar {...SHEET}>body</Sidebar>);

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(sidebarRoot().dataset.state).toBe("collapsed");
    expect(sidebarRoot().dataset.collapsible).toBe("offcanvas");
    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(sidebarRoot().dataset.state).toBe("expanded");
    fireEvent.keyDown(window, { key: "b" });
    fireEvent.keyDown(window, { key: "x", ctrlKey: true });
    expect(sidebarRoot().dataset.state).toBe("expanded");
  });

  it("reports changes to a controlling parent instead of changing itself", () => {
    const onOpenChange = vi.fn();
    renderInProvider(
      <>
        <Sidebar {...SHEET}>body</Sidebar>
        <SidebarTrigger label="Toggle" />
      </>,
      { open: true, onOpenChange },
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(sidebarRoot().dataset.state).toBe("expanded");
  });

  it("can start collapsed and be opened through the context's setOpen", () => {
    function Opener() {
      const { setOpen, open } = useSidebar();
      return (
        <button type="button" onClick={() => setOpen(true)}>
          {open ? "open" : "closed"}
        </button>
      );
    }
    renderInProvider(
      <>
        <Sidebar side="right" variant="floating" {...SHEET}>
          body
        </Sidebar>
        <Opener />
      </>,
      { defaultOpen: false },
    );
    expect(sidebarRoot().dataset.side).toBe("right");
    expect(sidebarRoot().dataset.variant).toBe("floating");
    fireEvent.click(screen.getByRole("button", { name: "closed" }));
    expect(screen.getByRole("button", { name: "open" })).toBeTruthy();
  });

  it("renders a fixed column when it can't collapse", () => {
    renderInProvider(
      <Sidebar collapsible="none" variant="inset" className="fixed-col" {...SHEET}>
        body
      </Sidebar>,
    );
    expect(sidebarRoot().classList).toContain("fixed-col");
    expect(sidebarRoot().dataset.state).toBeUndefined();
  });

  it("refuses to be used outside its provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SidebarTrigger label="Toggle" />)).toThrow("useSidebar must be used within a SidebarProvider.");
  });
});

describe("Sidebar below 768 px", () => {
  beforeEach(() => viewport(390));
  afterEach(() => viewport(1280));

  it("becomes a drawer with the translated title and description, opened by the trigger", () => {
    renderInProvider(
      <>
        <Sidebar {...SHEET}>
          <a href="https://example.com/">entry</a>
        </Sidebar>
        <SidebarTrigger label="Menu" />
      </>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    const drawer = screen.getByRole("dialog", { name: "Menu" });
    expect(drawer.dataset.mobile).toBe("true");
    expect(drawer.dataset.side).toBe("left");
    expect(screen.getByText("Every screen you can open")).toBeTruthy();
    expect(screen.getByRole("link", { name: "entry" })).toBeTruthy();

    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows no rail tooltip on a phone", async () => {
    renderInProvider(
      <SidebarMenuButton tooltip="Materials" data-testid="leaf">
        Materials
      </SidebarMenuButton>,
      { defaultOpen: false },
    );
    await act(async () => fireEvent.focus(screen.getByTestId("leaf")));
    expect(document.querySelector("[data-slot=tooltip-content]")!.hasAttribute("hidden")).toBe(true);
  });
});

describe("Sidebar parts", () => {
  beforeEach(() => viewport(1280));

  it("render with their slots and pass their props through", () => {
    renderInProvider(
      <>
        <Sidebar {...SHEET}>
          <SidebarHeader className="hd">head</SidebarHeader>
          <SidebarInput placeholder="Search" />
          <SidebarSeparator />
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Plain label</SidebarGroupLabel>
              <SidebarGroupLabel asChild>
                <h2>Heading label</h2>
              </SidebarGroupLabel>
              <SidebarGroupAction title="Plain action" />
              <SidebarGroupAction asChild>
                <a href="https://example.com/">Link action</a>
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive size="lg" variant="outline">
                      Active
                    </SidebarMenuButton>
                    <SidebarMenuAction>plain menu action</SidebarMenuAction>
                    <SidebarMenuAction asChild showOnHover>
                      <a href="https://example.com/">hover menu action</a>
                    </SidebarMenuAction>
                    <SidebarMenuBadge>3</SidebarMenuBadge>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton href="https://example.com/sub" isActive size="sm">
                          Sub link
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild>
                          <button type="button">Sub button</button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <a href="https://example.com/leaf">Leaf</a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
                <SidebarMenuSkeleton />
                <SidebarMenuSkeleton showIcon />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>foot</SidebarFooter>
        </Sidebar>
        <SidebarInset>page</SidebarInset>
      </>,
    );

    const slot = (name: string) => document.querySelectorAll<HTMLElement>(`[data-slot=${name}]`);
    expect(screen.getByText("head").classList).toContain("hd");
    expect(screen.getByPlaceholderText("Search").dataset.slot).toBe("sidebar-input");
    expect(slot("sidebar-separator")).toHaveLength(1);
    expect(screen.getByText("Plain label").dataset.slot).toBe("sidebar-group-label");
    expect(screen.getByRole("heading", { name: "Heading label" }).dataset.slot).toBe("sidebar-group-label");
    expect(screen.getByTitle("Plain action").dataset.slot).toBe("sidebar-group-action");
    expect(screen.getByRole("link", { name: "Link action" }).dataset.slot).toBe("sidebar-group-action");
    expect(slot("sidebar-group-content")).toHaveLength(1);
    const active = screen.getByRole("button", { name: "Active" });
    expect(active.dataset.active).toBe("true");
    expect(active.dataset.size).toBe("lg");
    expect(screen.getByText("plain menu action").dataset.slot).toBe("sidebar-menu-action");
    expect(screen.getByRole("link", { name: "hover menu action" }).className).toContain("md:opacity-0");
    expect(screen.getByText("3").dataset.slot).toBe("sidebar-menu-badge");
    const subLink = screen.getByRole("link", { name: "Sub link" });
    expect(subLink.dataset.active).toBe("true");
    expect(subLink.dataset.size).toBe("sm");
    expect(screen.getByRole("button", { name: "Sub button" }).dataset.size).toBe("md");
    expect(slot("sidebar-menu-sub")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Leaf" }).dataset.slot).toBe("sidebar-menu-button");
    const skeletons = slot("sidebar-menu-skeleton");
    expect(skeletons[0].querySelector("[data-sidebar=menu-skeleton-icon]")).toBeNull();
    expect(skeletons[1].querySelector("[data-sidebar=menu-skeleton-icon]")).not.toBeNull();
    expect(screen.getByText("foot").dataset.slot).toBe("sidebar-footer");
    expect(screen.getByRole("main").dataset.slot).toBe("sidebar-inset");
  });

  it("gives leaves a tooltip that shows only in the rail", async () => {
    renderInProvider(
      <>
        <SidebarMenuButton tooltip="Materials" data-testid="string-tip">
          M
        </SidebarMenuButton>
        <SidebarMenuButton tooltip={{ children: "Audit", className: "tip" }} data-testid="object-tip">
          A
        </SidebarMenuButton>
        <SidebarTrigger label="Toggle" />
      </>,
    );
    const tip = () => document.querySelector<HTMLElement>("[data-slot=tooltip-content]")!;

    await act(async () => fireEvent.focus(screen.getByTestId("string-tip")));
    expect(tip().hasAttribute("hidden")).toBe(true);
    await act(async () => fireEvent.blur(screen.getByTestId("string-tip")));

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    await act(async () => fireEvent.focus(screen.getByTestId("object-tip")));
    expect(tip().hasAttribute("hidden")).toBe(false);
    expect(tip().classList).toContain("tip");
    expect(screen.getByRole("tooltip").textContent).toBe("Audit");
  });
});
