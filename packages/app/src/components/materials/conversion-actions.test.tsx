import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { ConversionActions } from "./conversion-actions";
import { materialsLabels } from "./labels";

const mocks = vi.hoisted(() => ({ changeConversion: vi.fn(), removeConversion: vi.fn() }));
vi.mock("../../app/admin/[tenant]/materials/actions", () => mocks);

beforeAll(() => {
  // Radix positions menus with ResizeObserver, which jsdom doesn't have.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const context = { tenant: "test", generation: 1 };
const bolt = { id: "00000002", type: "raw" as const, description: "Bolt", baseUnit: "each", active: true, createdAt: new Date(), version: 1 };
const caseConversion = { unit: "case", numerator: "12", denominator: "1", inverse: "0.083333", version: 2 };

function open(item: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: "Actions for case" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
}

describe("ConversionActions", () => {
  afterEach(() => vi.clearAllMocks());

  it("offers Change factor and Remove", () => {
    render(<ConversionActions material={bolt} conversion={caseConversion} context={context} labels={materialsLabels(en)} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for case" }), { key: "Enter" });

    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Change factor", "Remove"]);
  });

  it("changes the factor from a prefilled form, at the conversion's version (MAT-027)", async () => {
    mocks.changeConversion.mockResolvedValue({ ok: true, data: {} });
    render(<ConversionActions material={bolt} conversion={caseConversion} context={context} labels={materialsLabels(en)} />);

    open("Change factor");
    expect(screen.getByRole("dialog", { name: "Change the factor of case" })).toBeTruthy();
    expect(screen.queryByLabelText("Unit")).toBeNull();
    expect((screen.getByLabelText("Base quantity") as HTMLInputElement).value).toBe("12");
    fireEvent.change(screen.getByLabelText("Base quantity"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.changeConversion).toHaveBeenCalledWith("test", 1, "00000002", "case", 2, { numerator: "10", denominator: "1" });
  });

  it("closes the factor form on cancel", () => {
    render(<ConversionActions material={bolt} conversion={caseConversion} context={context} labels={materialsLabels(en)} />);

    open("Change factor");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("removes the conversion after confirming", async () => {
    mocks.removeConversion.mockResolvedValue({ ok: true, data: { unit: "case" } });
    render(<ConversionActions material={bolt} conversion={caseConversion} context={context} labels={materialsLabels(en)} />);

    open("Remove");
    expect(screen.getByRole("alertdialog", { name: "Remove the conversion for case?" })).toBeTruthy();
    expect(screen.getByText(/^Quantities can no longer be entered in case\./)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove" })));

    expect(mocks.removeConversion).toHaveBeenCalledWith("test", 1, "00000002", "case", 2);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
