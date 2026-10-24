import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

describe("Dialog", () => {
  it("opens from its trigger and renders every part with its slot", () => {
    render(
      <Dialog>
        <DialogTrigger>open</DialogTrigger>
        <DialogContent className="ct">
          <DialogHeader className="hd">
            <DialogTitle className="tt">title</DialogTitle>
            <DialogDescription className="ds">description</DialogDescription>
          </DialogHeader>
          <DialogFooter className="ft" showCloseButton>
            <DialogClose>done</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    fireEvent.click(screen.getByText("open"));

    const dialog = screen.getByRole("dialog", { name: "title" });
    expect(dialog.dataset.slot).toBe("dialog-content");
    expect(dialog.classList).toContain("ct");
    expect(screen.getByText("description").dataset.slot).toBe("dialog-description");
    expect(screen.getByText("title").parentElement!.dataset.slot).toBe("dialog-header");
    expect(screen.getByText("done").parentElement!.dataset.slot).toBe("dialog-footer");
    // Design system v1: an opaque scrim, no blur.
    const overlay = document.querySelector<HTMLElement>("[data-slot=dialog-overlay]")!;
    expect(overlay.classList).toContain("bg-scrim");
    expect(overlay.className).not.toMatch(/backdrop-blur|bg-black/);
    // The corner close button and the footer's.
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2);
  });

  it("can drop the corner close button, and closes through DialogClose", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>title</DialogTitle>
          <DialogDescription>description</DialogDescription>
          <DialogFooter>
            <DialogClose>done</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByText("Close")).toBeNull();
    fireEvent.click(screen.getByText("done"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
