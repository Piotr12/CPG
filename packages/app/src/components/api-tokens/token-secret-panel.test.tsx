import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent } from "@cpg/ui/components/dialog";
import { en } from "../../i18n/messages/en";
import { tokensLabels } from "./labels";
import { TokenSecretPanel } from "./token-secret-panel";

const SECRET = "cpg_secret";

function renderPanel(onDone = vi.fn()) {
  render(
    <Dialog open>
      <DialogContent>
        <TokenSecretPanel name="agent1" secret={SECRET} labels={tokensLabels(en)} onDone={onDone} />
      </DialogContent>
    </Dialog>,
  );
  return onDone;
}

describe("TokenSecretPanel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the secret, how to send it, and that it won't be shown again", () => {
    renderPanel();

    expect(screen.getByRole("dialog", { name: "Token “agent1” created" })).toBeTruthy();
    const secret = screen.getByLabelText("Secret") as HTMLInputElement;
    expect(secret.value).toBe(SECRET);
    expect(secret.readOnly).toBe(true);
    const warning = screen.getByRole("note");
    expect(warning.dataset.tone).toBe("warning");
    expect(warning.textContent).toBe("Copy this token nowYou won't see it again.");
    expect(within(warning).getByText("Copy this token now").className).toContain("font-medium");
    expect(screen.getByText("Send it as Authorization: Bearer <secret>.")).toBeTruthy();
  });

  it("selects the whole secret when focused", () => {
    renderPanel();
    const secret = screen.getByLabelText("Secret") as HTMLInputElement;

    fireEvent.focus(secret);

    expect([secret.selectionStart, secret.selectionEnd]).toEqual([0, SECRET.length]);
  });

  it("copies the secret to the clipboard and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(SECRET);
  });

  it.each([
    ["the clipboard refuses", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } }],
    ["there is no clipboard (no secure context)", {}],
  ])("says to copy by hand when %s", async (_case, navigator) => {
    vi.stubGlobal("navigator", navigator);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't copy. Select the secret and copy it yourself.");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  it("calls onDone from Done", () => {
    const onDone = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onDone).toHaveBeenCalledOnce();
  });
});
