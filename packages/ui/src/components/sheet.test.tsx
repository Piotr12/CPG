import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

describe("Sheet", () => {
  it("opens from its trigger on the right and renders every part with its slot", () => {
    render(
      <Sheet>
        <SheetTrigger>open</SheetTrigger>
        <SheetContent className="ct">
          <SheetHeader className="hd">
            <SheetTitle className="tt">title</SheetTitle>
            <SheetDescription className="ds">description</SheetDescription>
          </SheetHeader>
          <SheetFooter className="ft">
            <SheetClose>done</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>,
    );

    fireEvent.click(screen.getByText("open"));

    const sheet = screen.getByRole("dialog", { name: "title" });
    expect(sheet.dataset.slot).toBe("sheet-content");
    expect(sheet.dataset.side).toBe("right");
    expect(sheet.classList).toContain("ct");
    expect(screen.getByText("description").dataset.slot).toBe("sheet-description");
    expect(screen.getByText("title").parentElement!.dataset.slot).toBe("sheet-header");
    expect(screen.getByText("done").parentElement!.dataset.slot).toBe("sheet-footer");
    // Design system v1: an opaque scrim, no blur.
    const overlay = document.querySelector<HTMLElement>("[data-slot=sheet-overlay]")!;
    expect(overlay.classList).toContain("bg-scrim");
    expect(overlay.className).not.toMatch(/backdrop-blur|bg-black/);
    expect(screen.getByRole("button", { name: "Close" }).dataset.slot).toBe("sheet-close");
  });

  it("opens on another side, can drop the corner close button, and closes through SheetClose", () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent side="left" showCloseButton={false}>
          <SheetTitle>title</SheetTitle>
          <SheetDescription>description</SheetDescription>
          <SheetClose>done</SheetClose>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("dialog").dataset.side).toBe("left");
    expect(screen.queryByText("Close")).toBeNull();
    fireEvent.click(screen.getByText("done"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape and gives focus back to its trigger", async () => {
    render(
      <Sheet>
        <SheetTrigger>open</SheetTrigger>
        <SheetContent>
          <SheetTitle>title</SheetTitle>
          <SheetDescription>description</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    const trigger = screen.getByText("open");

    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    // Radix moves focus back once the content has unmounted.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
