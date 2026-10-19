import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { CreateNamedRecordDialog } from "./create-named-record-dialog";
import { namedRecordsLabels } from "./labels";

const context = { tenant: "prod", generation: 1 };

describe("CreateNamedRecordDialog", () => {
  it("creates a record from the name, in the page's tenant and generation, and closes", async () => {
    const create = vi.fn().mockResolvedValue({ ok: true, data: { id: "00000004" } });
    render(<CreateNamedRecordDialog context={context} labels={namedRecordsLabels(en, "locations")} create={create} />);

    fireEvent.click(screen.getByRole("button", { name: "Create location" }));
    expect(screen.getByRole("dialog", { name: "Create location" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " North site " } });
    fireEvent.click(screen.getAllByRole("button", { name: "Create location" }).at(-1)!);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(create).toHaveBeenCalledWith("prod", 1, { name: " North site " });
  });

  it("shows the missing name in the reader's language and creates nothing", async () => {
    const create = vi.fn();
    render(<CreateNamedRecordDialog context={context} labels={namedRecordsLabels(pl, "customers")} create={create} />);

    fireEvent.click(screen.getByRole("button", { name: "Utwórz klienta" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Utwórz klienta" }).at(-1)!);

    expect(await screen.findByText("Wpisz nazwę.")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("shows a server error in the screen's words, and closes on cancel", async () => {
    const create = vi.fn().mockResolvedValue({ ok: false, error: { code: "FORBIDDEN", message: "x" } });
    render(<CreateNamedRecordDialog context={context} labels={namedRecordsLabels(en, "suppliers")} create={create} />);

    fireEvent.click(screen.getByRole("button", { name: "Create supplier" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Create supplier" }).at(-1)!);

    expect((await screen.findByRole("alert")).textContent).toBe("Only the administrator can change suppliers.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
