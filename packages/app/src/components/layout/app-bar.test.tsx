import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { AppBar, AppBarPlaceholder } from "./app-bar";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  currentUser: vi.fn(),
  currentPreferences: vi.fn(),
  getMessages: vi.fn(),
  documentPreferences: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));
vi.mock("../../preferences/current-preferences", () => ({ currentPreferences: mocks.currentPreferences }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../preferences/document-preferences", () => ({
  DocumentPreferences: (props: object) => {
    mocks.documentPreferences(props);
    return null;
  },
}));

function as(user: object | null, locale: "en" | "pl", theme: "light" | "dark") {
  mocks.currentUser.mockResolvedValue(user);
  mocks.currentPreferences.mockResolvedValue({ locale, theme });
  mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });
}

describe("AppBar", () => {
  afterEach(() => vi.clearAllMocks());

  it("links to help in the reader's language and applies a signed-in account's preferences", async () => {
    as({ userId: "u1" }, "pl", "dark");

    render(await AppBar());

    const link = screen.getByRole("link", { name: "Pomoc" });
    expect(link.getAttribute("href")).toBe("/help");
    expect(link.closest("nav")?.getAttribute("lang")).toBe("pl");
    expect(mocks.documentPreferences).toHaveBeenCalledWith({ locale: "pl", theme: "dark", isSignedIn: true });
    expect(mocks.connection).toHaveBeenCalledOnce();
  });

  it("tells the document a visitor is signed out", async () => {
    as(null, "en", "light");

    render(await AppBar());

    expect(screen.getByRole("link", { name: "Help" })).toBeTruthy();
    expect(mocks.documentPreferences).toHaveBeenCalledWith({ locale: "en", theme: "light", isSignedIn: false });
  });

  it("holds its height, without text, while streaming", () => {
    const { container } = render(<AppBarPlaceholder />);

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toBe("");
  });
});
