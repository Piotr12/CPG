import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { ResetTestCard } from "./reset-test-card";

const mocks = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock("../../app/admin/(global)/actions", () => ({ resetTest: mocks.reset }));
afterEach(() => vi.clearAllMocks());
const props = { generation: 4, readOnly: true, labels: en.admin.reset, errors: en.errors };

describe("ResetTestCard", () => {
  it("keeps an open confirmation on its original generation after a stale refresh, and uses the new one only after reopening", async () => {
    const { rerender } = render(<ResetTestCard {...props} />);
    expect(screen.getByText("Generation 4")).toBeTruthy();
    expect(screen.getByText(en.admin.reset.readOnly)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset Test…" }));
    rerender(<ResetTestCard {...props} generation={5} />);
    expect(screen.getByRole("alertdialog").textContent).toContain("generation 4");
    mocks.reset.mockResolvedValueOnce({ ok: false, error: { code: "GENERATION_STALE", message: "stale" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Test" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(en.admin.reset.errors.GENERATION_STALE));
    expect(mocks.reset).toHaveBeenCalledWith({ generation: 4 });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Test…" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("alertdialog").textContent).toContain("generation 5");
    mocks.reset.mockResolvedValueOnce({ ok: true, data: { generation: 6, readOnly: true } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Test" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Test reset to generation 6. Test will remain read-only."));
    expect(mocks.reset).toHaveBeenLastCalledWith({ generation: 5 });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset Test…" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reports a writable result in Polish and blocks repeated submission while pending", async () => {
    let finish!: (result: unknown) => void;
    mocks.reset.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<ResetTestCard {...props} readOnly={false} labels={pl.admin.reset} errors={pl.errors} />);
    expect(screen.getByText(pl.admin.reset.writable)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resetuj Test…" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Resetuj Test" })));
    expect((screen.getByRole("button", { name: "Resetowanie…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish({ ok: true, data: { generation: 5, readOnly: false } }); });
    expect(screen.getByRole("status").textContent).toBe("Test zresetowano do generacji 5. Test pozostanie zapisywalne.");
    expect(mocks.reset).toHaveBeenCalledOnce();
    // All labels can cross the server/client boundary.
    expect(JSON.parse(JSON.stringify(pl.admin.reset))).toEqual(pl.admin.reset);
  });
});
