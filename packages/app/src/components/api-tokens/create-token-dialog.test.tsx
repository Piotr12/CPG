import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { CreateTokenDialog } from "./create-token-dialog";
import { tokensLabels } from "./labels";

const mocks = vi.hoisted(() => ({ createApiToken: vi.fn() }));
vi.mock("../../app/admin/(global)/tokens/actions", () => ({ createApiToken: mocks.createApiToken }));

const SECRET = "cpg_q7N2xVd0Lr8mKcE4Zt1HbYw9sPaGfJ3uXoQiR5eTl6M";
const created = {
  token: { id: "t1", name: "agent1", createdAt: new Date("2026-10-19T11:00:00Z"), lastUsedAt: null },
  secret: SECRET,
};

function create(name: string, submit = "Create token") {
  fireEvent.change(screen.getByLabelText(/^Name|^Nazwa/), { target: { value: name } });
  fireEvent.click(screen.getAllByRole("button", { name: submit }).at(-1)!);
}

describe("CreateTokenDialog", () => {
  afterEach(() => vi.clearAllMocks());

  it("warns what a token can do, then shows the new secret once (API-001, API-006)", async () => {
    mocks.createApiToken.mockResolvedValue({ ok: true, data: created });
    render(<CreateTokenDialog labels={tokensLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    expect(screen.getByRole("dialog", { name: "Create token" }).textContent).toContain(
      "This token can do everything you can, in both tenants, until you revoke it.",
    );
    create("agent1");

    expect(await screen.findByRole("dialog", { name: "Token “agent1” created" })).toBeTruthy();
    expect((screen.getByLabelText("Secret") as HTMLInputElement).value).toBe(SECRET);
    expect(mocks.createApiToken).toHaveBeenCalledWith({ name: "agent1" });
  });

  it("forgets the secret when closed: reopening shows an empty form", async () => {
    mocks.createApiToken.mockResolvedValue({ ok: true, data: created });
    render(<CreateTokenDialog labels={tokensLabels(en)} />);
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    create("agent1");
    await screen.findByLabelText("Secret");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));

    expect(screen.queryByLabelText("Secret")).toBeNull();
    expect(screen.queryByText(SECRET)).toBeNull();
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("");
  });

  it("says when the name is taken and stays on the form (API-003)", async () => {
    mocks.createApiToken.mockResolvedValue({
      ok: false,
      error: { code: "CONFLICT", message: "You already have a token with that name." },
    });
    render(<CreateTokenDialog labels={tokensLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    create("agent1");

    expect((await screen.findByRole("alert")).textContent).toBe("You already have a token with that name.");
    expect(screen.queryByLabelText("Secret")).toBeNull();
  });

  it("checks the name before sending it", async () => {
    render(<CreateTokenDialog labels={tokensLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    create("   ");

    expect(await screen.findByText("Enter a name.")).toBeTruthy();
    expect(mocks.createApiToken).not.toHaveBeenCalled();
  });

  it("closes on cancel without creating anything", () => {
    render(<CreateTokenDialog labels={tokensLabels(en)} />);

    fireEvent.click(screen.getByRole("button", { name: "Create token" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.createApiToken).not.toHaveBeenCalled();
  });

  it("speaks Polish, a taken name included", async () => {
    mocks.createApiToken.mockResolvedValue({
      ok: false,
      error: { code: "CONFLICT", message: "You already have a token with that name." },
    });
    render(<CreateTokenDialog labels={tokensLabels(pl)} />);

    fireEvent.click(screen.getByRole("button", { name: "Utwórz token" }));
    create("agent1", "Utwórz token");

    expect((await screen.findByRole("alert")).textContent).toBe("Masz już token o tej nazwie.");
  });
});
