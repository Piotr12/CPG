import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { PreferencesControls } from "./preferences-controls";

const pressed = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name }).getAttribute("aria-pressed");

describe("PreferencesControls", () => {
  it("offers each language in its own name and both themes, the current ones pressed", () => {
    render(<PreferencesControls locale="pl" theme="light" labels={pl.preferences} action={vi.fn()} />);

    expect(pressed("Język", "Polski")).toBe("true");
    expect(pressed("Język", "English")).toBe("false");
    expect(screen.getByRole("button", { name: "English" }).getAttribute("lang")).toBe("en");
    expect(pressed("Motyw", "Jasny")).toBe("true");
    expect(pressed("Motyw", "Ciemny")).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sends exactly the clicked choice", async () => {
    const action = vi.fn(async () => ({}));
    render(<PreferencesControls locale="en" theme="light" labels={en.preferences} action={action} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Dark" })));

    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect([...formData.entries()]).toEqual([["theme", "dark"]]);
  });

  it("shows the action's error", async () => {
    const action = vi.fn(async () => ({ error: "Some fields are invalid." }));
    render(<PreferencesControls locale="en" theme="light" labels={en.preferences} action={action} />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Polski" })));

    expect(screen.getByRole("alert").textContent).toBe("Some fields are invalid.");
  });
});
