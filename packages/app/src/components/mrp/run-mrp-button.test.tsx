import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MrpRunView, Result } from "@cpg/core";
import { RunMrpButton } from "./run-mrp-button";

const labels = { run: "Run MRP", running: "Running MRP…", errors: { TENANT_READ_ONLY: "This tenant is read-only." } };

/** An action whose answer the test hands over when it chooses. */
function deferred() {
  let answer!: (result: Result<MrpRunView>) => void;
  const action = vi.fn(() => new Promise<Result<MrpRunView>>((resolve) => (answer = resolve)));
  return { action, answer: (result: Result<MrpRunView>) => act(async () => answer(result)) };
}

describe("RunMrpButton", () => {
  it("runs at once, with no confirmation, and is disabled and says so while it runs", async () => {
    const { action, answer } = deferred();
    render(<RunMrpButton action={action} labels={labels} />);

    fireEvent.click(screen.getByRole("button", { name: "Run MRP" }));

    expect(action).toHaveBeenCalledTimes(1);
    const pending = await screen.findByRole("button", { name: "Running MRP…" });
    expect((pending as HTMLButtonElement).disabled).toBe(true);
    await answer({ ok: true, data: { id: "00000001" } as MrpRunView });
    expect((screen.getByRole("button", { name: "Run MRP" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says a refusal in the reader's language under the button, keeps the server's text for others, and clears it on the next try", async () => {
    const { action, answer } = deferred();
    render(<RunMrpButton action={action} labels={labels} />);

    fireEvent.click(screen.getByRole("button", { name: "Run MRP" }));
    await answer({ ok: false, error: { code: "TENANT_READ_ONLY", message: "Read-only (server)." } });
    expect(screen.getByRole("alert").textContent).toBe("This tenant is read-only.");

    fireEvent.click(screen.getByRole("button", { name: "Run MRP" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await answer({ ok: false, error: { code: "INTERNAL", message: "Something went wrong. Try again." } });
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong. Try again.");
  });
});
