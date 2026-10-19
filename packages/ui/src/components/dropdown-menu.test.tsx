import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";

beforeAll(() => {
  // Radix positions menus with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("DropdownMenu", () => {
  it("renders every part with its slot when open", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent className="ct">
          <DropdownMenuLabel inset>label</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem inset>
              plain <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive">danger</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked inset>
            checked
          </DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="a">
            <DropdownMenuRadioItem value="a" inset>
              radio
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger inset>more</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="sub">nested</DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByRole("menu", { name: "menu" }).classList).toContain("ct");
    expect(screen.getByText("label").dataset).toMatchObject({ slot: "dropdown-menu-label", inset: "true" });
    expect(screen.getByText("⌘P").dataset.slot).toBe("dropdown-menu-shortcut");
    expect(screen.getByText("danger").dataset).toMatchObject({ slot: "dropdown-menu-item", variant: "destructive" });
    expect(screen.getByRole("separator").dataset.slot).toBe("dropdown-menu-separator");
    expect(screen.getByRole("menuitemcheckbox").dataset.state).toBe("checked");
    expect(screen.getByRole("menuitemradio").dataset.state).toBe("checked");
    expect(screen.getByText("more").dataset.slot).toBe("dropdown-menu-sub-trigger");
    expect(screen.getByText("nested").classList).toContain("sub");
  });

  it("reports a selected item", () => {
    const onSelect = vi.fn();
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>pick</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "pick" }));

    expect(onSelect).toHaveBeenCalledOnce();
  });
});
