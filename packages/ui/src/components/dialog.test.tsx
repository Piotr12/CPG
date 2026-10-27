import type * as React from "react";
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

  describe("first focus", () => {
    const dialog = (props: React.ComponentProps<typeof DialogContent> = {}, marked = true) => (
      <Dialog open>
        <DialogContent aria-describedby={undefined} {...props}>
          <DialogTitle>Change target</DialogTitle>
          <button type="button">About Target</button>
          <input aria-label="Target" defaultValue="20" data-autofocus={marked ? true : undefined} />
        </DialogContent>
      </Dialog>
    );

    it("goes to the element marked data-autofocus, ahead of an earlier tabbable one, with its value selected (#297)", () => {
      render(dialog());
      const input = screen.getByLabelText("Target") as HTMLInputElement;
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 2]);
    });

    it("focuses a marked control that isn't a text field without selecting anything", () => {
      render(
        <Dialog open>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Edit material</DialogTitle>
            <button type="button">About Base unit</button>
            <select aria-label="Base unit" data-autofocus>
              <option>kg</option>
            </select>
          </DialogContent>
        </Dialog>,
      );
      expect(document.activeElement).toBe(screen.getByLabelText("Base unit"));
    });

    it("goes to the first tabbable element when nothing is marked", () => {
      render(dialog({}, false));
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "About Target" }));
    });

    it("runs the caller's onOpenAutoFocus first and leaves focus alone when it prevents the default", () => {
      const onOpenAutoFocus = vi.fn((event: Event) => event.preventDefault());
      render(dialog({ onOpenAutoFocus }));
      expect(onOpenAutoFocus).toHaveBeenCalledOnce();
      expect(document.activeElement).not.toBe(screen.getByLabelText("Target"));

      const observe = vi.fn();
      render(dialog({ onOpenAutoFocus: observe }));
      expect(observe).toHaveBeenCalledOnce();
      expect(document.activeElement).toBe(screen.getAllByLabelText("Target").at(-1));
    });
  });
});
