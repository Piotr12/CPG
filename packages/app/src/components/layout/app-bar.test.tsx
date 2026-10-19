import { describe, expect, it, vi } from "vitest";
import { DocumentPreferences } from "../preferences/document-preferences";
import { AppBar } from "./app-bar";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), currentUser: vi.fn(), currentPreferences: vi.fn() }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));
vi.mock("../../preferences/current-preferences", () => ({ currentPreferences: mocks.currentPreferences }));

describe("AppBar", () => {
  it("applies a signed-in account's preferences to the document, at request time", async () => {
    mocks.currentUser.mockResolvedValue({ userId: "u1" });
    mocks.currentPreferences.mockResolvedValue({ locale: "pl", theme: "dark" });

    expect(await AppBar()).toEqual(<DocumentPreferences locale="pl" theme="dark" isSignedIn />);
    expect(mocks.connection).toHaveBeenCalledOnce();
  });

  it("tells the document a visitor is signed out", async () => {
    mocks.currentUser.mockResolvedValue(null);
    mocks.currentPreferences.mockResolvedValue({ locale: "en", theme: "light" });

    expect(await AppBar()).toEqual(<DocumentPreferences locale="en" theme="light" isSignedIn={false} />);
  });
});
