import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../components/button";
import type { ApiResult } from "../api/result";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";

type Props = Omit<ConfirmDialogProps<string>, "open" | "onOpenChange">;

/** The dialog with its own open state and a trigger button, as a page uses it. */
function Harness(props: Props & { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <ConfirmDialog
      {...props}
      open={open}
      onOpenChange={(next) => {
        props.onOpenChange?.(next);
        setOpen(next);
      }}
      trigger={<Button>Open</Button>}
    />
  );
}

const base: Props = {
  title: "Remove case?",
  description: "Quantities can no longer be entered in case.",
  confirmLabel: "Remove",
  cancelLabel: "Cancel",
  action: vi.fn(async (): Promise<ApiResult<string>> => ({ ok: true, data: "done" })),
};

describe("ConfirmDialog", () => {
  it("opens from its trigger, runs the action on confirm and closes on success", async () => {
    const action = vi.fn(async (): Promise<ApiResult<string>> => ({ ok: true, data: "done" }));
    render(<Harness {...base} action={action} destructive />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("alertdialog", { name: "Remove case?" })).toBeTruthy();
    expect(screen.getByText("Quantities can no longer be entered in case.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove" }).dataset.variant).toBe("destructive");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove" })));

    expect(action).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps the dialog open with the formatted error, and clears it when cancelled", async () => {
    const action = vi.fn(async (): Promise<ApiResult<string>> => ({ ok: false, error: { code: "GONE", message: "Gone." } }));
    render(<Harness {...base} action={action} formatError={({ code }) => `Translated ${code}`} />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("button", { name: "Remove" }).dataset.variant).toBe("default");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove" })));
    expect(screen.getByRole("alert").textContent).toBe("Translated GONE");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the server's message when no formatter is given, and works without a trigger", async () => {
    const action = vi.fn(async (): Promise<ApiResult<string>> => ({ ok: false, error: { code: "X", message: "Server says no." } }));
    render(<ConfirmDialog {...base} action={action} open onOpenChange={vi.fn()} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove" })));

    expect(screen.getByRole("alert").textContent).toBe("Server says no.");
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
  });
});
