import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MrpRunAnswer, Result } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { RunMrpButton, type RunMrpLabels } from "./run-mrp-button";

const labels: RunMrpLabels = {
  run: "Run MRP", running: "Running MRP…", ...en.mrp.dialog, description: "Plans every location of Test over 90 days from today.",
  errors: { TENANT_READ_ONLY: "This tenant is read-only." },
};

/** An action whose answer the test hands over when it chooses. */
function deferred() {
  let answer!: (result: Result<MrpRunAnswer>) => void;
  const action = vi.fn((_raw: { mode: "manual" | "automatic" }) => new Promise<Result<MrpRunAnswer>>((resolve) => (answer = resolve)));
  return { action, answer: (result: Result<MrpRunAnswer>) => act(async () => answer(result)) };
}
const open = () => {
  fireEvent.click(screen.getByRole("button", { name: "Run MRP" }));
  return screen.getByRole("alertdialog");
};
const submit = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole("button", { name: "Run MRP" }));

describe("RunMrpButton", () => {
  it("opens a dialog that names the run and explains both modes, on Manual, and runs nothing until confirmed (RUN-003)", () => {
    const { action } = deferred();
    render(<RunMrpButton action={action} labels={labels} />);

    const dialog = open();

    expect(within(dialog).getByRole("heading", { name: "Run MRP" })).toBeTruthy();
    expect(dialog.textContent).toContain("Plans every location of Test over 90 days from today.");
    expect(dialog.textContent).toContain(en.mrp.dialog.help);
    const choice = within(dialog).getByRole("radiogroup", { name: en.mrp.dialog.creation });
    expect((within(choice).getByRole("radio", { name: "Manual" }) as HTMLInputElement).checked).toBe(true);
    expect((within(choice).getByRole("radio", { name: "Automatic" }) as HTMLInputElement).checked).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("runs in the default Manual mode, says so while it runs, and closes on success", async () => {
    const { action, answer } = deferred();
    render(<RunMrpButton action={action} labels={labels} />);

    const dialog = open();
    submit(dialog);

    expect(action).toHaveBeenCalledWith({ mode: "manual" });
    const pending = await within(dialog).findByRole("button", { name: "Running MRP…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    await answer({ ok: true, data: { id: "00000001" } as MrpRunAnswer });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("runs Automatic only when it is chosen, and the next open starts on Manual again (RUN-007)", async () => {
    const { action, answer } = deferred();
    render(<RunMrpButton action={action} labels={labels} />);

    const dialog = open();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Automatic" }));
    submit(dialog);
    expect(action).toHaveBeenCalledWith({ mode: "automatic" });
    await answer({ ok: true, data: { id: "00000002", documents: [] } as unknown as MrpRunAnswer });

    expect((within(open()).getByRole("radio", { name: "Manual" }) as HTMLInputElement).checked).toBe(true);
  });

  it("Cancel closes the dialog and runs nothing", () => {
    const { action } = deferred();
    render(<RunMrpButton action={action} labels={labels} />);

    fireEvent.click(within(open()).getByRole("button", { name: en.mrp.dialog.cancel }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("keeps a refusal in the dialog in the reader's language, keeps the server's text for others, and clears it on the next try", async () => {
    const { action, answer } = deferred();
    render(<RunMrpButton action={action} labels={labels} />);

    const dialog = open();
    submit(dialog);
    await answer({ ok: false, error: { code: "TENANT_READ_ONLY", message: "Read-only (server)." } });
    expect(within(dialog).getByRole("alert").textContent).toBe("This tenant is read-only.");

    submit(dialog);
    expect(within(dialog).queryByRole("alert")).toBeNull();
    await answer({ ok: false, error: { code: "INTERNAL", message: "Something went wrong. Try again." } });
    expect(within(dialog).getByRole("alert").textContent).toBe("Something went wrong. Try again.");
  });

  it("takes plain-data labels only, so the page can pass them to this client component (lesson 2026-10-24)", () => {
    expect(Object.values(en.mrp.dialog).every((value) => typeof value === "string")).toBe(true);
  });
});
