import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { tokensLabels } from "./labels";
import { RevokeTokenDialog } from "./revoke-token-dialog";

const mocks = vi.hoisted(() => ({ revokeApiToken: vi.fn() }));
vi.mock("../../app/admin/(global)/tokens/actions", () => ({ revokeApiToken: mocks.revokeApiToken }));

const token = { id: "t1", name: "agent1", createdAt: new Date("2026-10-19T11:00:00Z"), lastUsedAt: null };

describe("RevokeTokenDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("asks for confirmation, then revokes and closes (API-008)", async () => {
    mocks.revokeApiToken.mockResolvedValue({ ok: true, data: { id: "t1" } });
    render(<RevokeTokenDialog token={token} labels={tokensLabels(en)} />);

    const opener = screen.getByRole("button", { name: "Revoke agent1" });
    expect(opener.dataset.variant).toBe("outline");
    fireEvent.click(opener);
    const dialog = screen.getByRole("alertdialog", { name: "Revoke agent1?" });
    expect(dialog.textContent).toContain("Anything using it stops working at once.");
    const confirm = screen.getByRole("button", { name: "Revoke" });
    // The opener only opens the dialog; the confirm inside it is the one solid danger button.
    expect(confirm.dataset.variant).toBe("destructive-solid");
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.revokeApiToken).toHaveBeenCalledWith({ tokenId: "t1" });
  });

  it("shows why it failed and stays open, and forgets the error when reopened", async () => {
    mocks.revokeApiToken.mockResolvedValue({ ok: false, error: { code: "TOKEN_NOT_FOUND", message: "No such token." } });
    render(<RevokeTokenDialog token={token} labels={tokensLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke agent1" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect((await screen.findByRole("alert")).textContent).toBe("That token no longer exists.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke agent1" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cancels without revoking", () => {
    render(<RevokeTokenDialog token={token} labels={tokensLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke agent1" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.revokeApiToken).not.toHaveBeenCalled();
  });

  it("speaks Polish", () => {
    render(<RevokeTokenDialog token={token} labels={tokensLabels(pl)} />);

    fireEvent.click(screen.getByRole("button", { name: "Unieważnij agent1" }));

    expect(screen.getByRole("alertdialog", { name: "Unieważnić agent1?" })).toBeTruthy();
  });
});
