import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Result } from "@cpg/core";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { LifecycleControl, type LifecycleControlProps } from "./lifecycle-control";

function props(overrides: Partial<LifecycleControlProps> = {}): LifecycleControlProps {
  return { available: true, processed: false, subject: "Order 00000001", version: 3, quantities: ["10 kg"], labels: en.lifecycle, errors: en.errors,
    cancel: vi.fn().mockResolvedValue({ ok: true, data: {} }), closeEarly: vi.fn().mockResolvedValue({ ok: true, data: {} }), ...overrides };
}
it("confirms exact abandonment, preserves posted work and closes after successful cancellation", async () => {
  const input = props(); render(<LifecycleControl {...input} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel — Order 00000001" }));
  expect(screen.getByRole("list", { name: "Abandoned quantity" }).textContent).toBe("10 kg");
  expect(screen.getByText(/Recorded work and stock stay unchanged/)).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
  expect(input.cancel).toHaveBeenCalledWith({ version: 3 }); expect(input.closeEarly).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("shows pending and selected line closure in Polish, with a transit notice and no extra writes", async () => {
  let finish!: (result: Result<unknown>) => void;
  const input = props({ processed: true, lines: [1], labels: pl.lifecycle, errors: pl.errors, notice: "3 kg w tranzycie",
    closeEarly: vi.fn().mockImplementation(() => new Promise<Result<unknown>>((resolve) => { finish = resolve; })) });
  render(<LifecycleControl {...input} />);
  fireEvent.click(screen.getByRole("button", { name: /Zamknij wcześniej —/ }));
  expect(screen.getByRole("status").textContent).toBe("3 kg w tranzycie");
  fireEvent.click(screen.getByRole("button", { name: "Zamknij wcześniej" }));
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
  fireEvent.click(screen.getByRole("button", { name: /Cancel —/ }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
  expect((await screen.findByRole("alert")).textContent).toBe(en.errors.VERSION_CONFLICT);
  const refreshed = props({ available: false, processed: true, version: 4, quantities: ["5 kg"] });
  rerender(<LifecycleControl {...refreshed} />);
  expect(screen.getByRole("alert").textContent).toBe(en.errors.VERSION_CONFLICT);
  expect(screen.getByText("10 kg")).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
  expect(original.cancel).toHaveBeenLastCalledWith({ version: 3, lines: ["original-line"] });
  expect(refreshed.closeEarly).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep open" }));
  expect(screen.queryByRole("button")).toBeNull();
  rerender(<LifecycleControl {...refreshed} available />);
  fireEvent.click(screen.getByRole("button", { name: /Close Early —/ }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close Early" })));
  expect(refreshed.closeEarly).toHaveBeenCalledWith({ version: 4 });
});
