import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Result } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { LifecycleControl, type LifecycleControlProps } from "./lifecycle-control";

function props(overrides: Partial<LifecycleControlProps> = {}): LifecycleControlProps {
  return { kind: "order", available: true, processed: false, subject: "Order 00000001", version: 3, quantities: ["10 kg"], labels: en.lifecycle, errors: en.errors,
    cancel: vi.fn().mockResolvedValue({ ok: true, data: {} }), closeEarly: vi.fn().mockResolvedValue({ ok: true, data: {} }), ...overrides };
}
it("confirms exact abandonment, preserves posted work and closes after successful cancellation", async () => {
  const input = props(); render(<LifecycleControl {...input} />);
  const trigger = screen.getByRole("button", { name: "Cancel order… — Order 00000001" });
  expect(trigger.textContent).toBe("Cancel order…"); expect(trigger.getAttribute("data-variant")).toBe("destructive");
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog", { name: "Cancel order — Order 00000001" })).toBeTruthy();
  expect(screen.getByRole("list", { name: "Abandoned quantity" }).textContent).toBe("10 kg");
  expect(screen.getByText(/Recorded work and stock stay unchanged/)).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel order" })));
  expect(input.cancel).toHaveBeenCalledWith({ version: 3 }); expect(input.closeEarly).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("shows pending and selected line closure in Polish, with a transit notice and no extra writes", async () => {
  let finish!: (result: Result<unknown>) => void;
  const input = props({ kind: "line", processed: true, lines: [1], labels: pl.lifecycle, errors: pl.errors, notice: "3 kg w tranzycie",
    closeEarly: vi.fn().mockImplementation(() => new Promise<Result<unknown>>((resolve) => { finish = resolve; })) });
  render(<LifecycleControl {...input} />);
  fireEvent.click(screen.getByRole("button", { name: "Zamknij wiersz wcześniej… — Order 00000001" }));
  expect(screen.getByRole("status").textContent).toBe("3 kg w tranzycie");
  expect(screen.getByRole("status").getAttribute("data-tone")).toBe("neutral");
  fireEvent.click(screen.getByRole("button", { name: "Zamknij wiersz wcześniej" }));
  await waitFor(() => expect((screen.getByRole("button", { name: pl.lifecycle.pending }) as HTMLButtonElement).disabled).toBe(true));
  expect(input.closeEarly).toHaveBeenCalledWith({ version: 3, lines: [1] });
  await act(async () => finish({ ok: false, error: { code: "TRANSFER_IN_TRANSIT", message: "Transit", params: { quantity: "3", unit: "kg" } } }));
  expect(screen.getByRole("alert").textContent).toBe("Najpierw przyjmij lub spisz pozostałe w tranzycie 3 kg.");
  fireEvent.click(screen.getByRole("button", { name: pl.lifecycle.keepOpen }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(input.closeEarly).toHaveBeenCalledTimes(1);
});
it("keeps the captured target and action when a conflict refresh changes or closes the record", async () => {
  const original = props({ lines: ["original-line"], cancel: vi.fn().mockResolvedValue({ ok: false, error: { code: "VERSION_CONFLICT", message: "stale" } }) });
  const { rerender } = render(<LifecycleControl {...original} />);
  fireEvent.click(screen.getByRole("button", { name: /Cancel order… —/ }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel order" })));
  expect((await screen.findByRole("alert")).textContent).toBe(en.errors.VERSION_CONFLICT);
  const refreshed = props({ available: false, processed: true, version: 4, quantities: ["5 kg"] });
  rerender(<LifecycleControl {...refreshed} />);
  expect(screen.getByRole("alert").textContent).toBe(en.errors.VERSION_CONFLICT);
  expect(screen.getByText("10 kg")).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel order" })));
  expect(original.cancel).toHaveBeenLastCalledWith({ version: 3, lines: ["original-line"] });
  expect(refreshed.closeEarly).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep open" }));
  expect(screen.queryByRole("button")).toBeNull();
  rerender(<LifecycleControl {...refreshed} available />);
  fireEvent.click(screen.getByRole("button", { name: /Close order early… —/ }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close order early" })));
  expect(refreshed.closeEarly).toHaveBeenCalledWith({ version: 4 });
});
it("names every kind's trigger and confirmation in both languages, without a bare Cancel", () => {
  for (const labels of [en.lifecycle, pl.lifecycle]) {
    for (const kind of Object.keys(labels.open) as (keyof typeof labels.open)[]) {
      for (const action of ["cancel", "closeEarly"] as const) {
        expect(labels.open[kind][action]).toBe(`${labels.confirm[kind][action]}…`);
        expect(labels.confirm[kind][action]).not.toMatch(/^(Cancel|Anuluj)$/);
      }
    }
  }
  expect(Object.values(en.lifecycle.open).map(({ cancel, closeEarly }) => `${cancel} / ${closeEarly}`)).toEqual([
    "Cancel order… / Close order early…", "Cancel order… / Close order early…", "Cancel transfer… / Close transfer early…",
    "Cancel requisition… / Close requisition early…", "Cancel line… / Close line early…",
  ]);
});
