import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog";

describe("AlertDialog", () => {
  it("opens from its trigger and renders every part with its slot", () => {
    render(
      <AlertDialog>
        <AlertDialogTrigger>ask</AlertDialogTrigger>
        <AlertDialogContent className="ct">
          <AlertDialogHeader className="hd">
            <AlertDialogMedia className="md">!</AlertDialogMedia>
            <AlertDialogTitle className="tt">Sure?</AlertDialogTitle>
            <AlertDialogDescription className="ds">It can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="ft">
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    );

    fireEvent.click(screen.getByText("ask"));

    const dialog = screen.getByRole("alertdialog", { name: "Sure?" });
    expect(dialog.dataset).toMatchObject({ slot: "alert-dialog-content", size: "default" });
    expect(dialog.classList).toContain("ct");
    expect(screen.getByText("!").dataset.slot).toBe("alert-dialog-media");
    expect(screen.getByText("It can't be undone.").dataset.slot).toBe("alert-dialog-description");
    expect(screen.getByText("Sure?").parentElement!.dataset.slot).toBe("alert-dialog-header");
    expect(screen.getByText("Yes").parentElement!.dataset.slot).toBe("alert-dialog-footer");
    expect(screen.getByRole("button", { name: "Yes" }).dataset).toMatchObject({ slot: "alert-dialog-action", variant: "default" });
    expect(screen.getByRole("button", { name: "No" }).dataset).toMatchObject({ slot: "alert-dialog-cancel", variant: "outline" });
    expect(document.querySelector("[data-slot=alert-dialog-overlay]")).not.toBeNull();
  });

  it("takes a small size and button variants, and closes on cancel", () => {
    const onOpenChange = vi.fn();
    render(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent size="sm">
          <AlertDialogTitle>Sure?</AlertDialogTitle>
          <AlertDialogDescription>Really.</AlertDialogDescription>
          <AlertDialogCancel variant="ghost" size="sm">No</AlertDialogCancel>
          <AlertDialogAction variant="destructive" size="sm">Yes</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.getByRole("alertdialog").dataset.size).toBe("sm");
    expect(screen.getByRole("button", { name: "Yes" }).dataset.variant).toBe("destructive");
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
