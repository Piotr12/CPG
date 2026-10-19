import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../tests/setup/server-components";
import LoginPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  currentUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../../auth/require-admin", () => ({ currentUser: mocks.currentUser, HOME_PATH: "/admin" }));
vi.mock("./actions", () => ({ signIn: vi.fn() }));

describe("LoginPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows the sign-in form to a visitor", async () => {
    mocks.currentUser.mockResolvedValue(null);

    render(await resolveServerComponents(LoginPage()));

    expect(screen.getByText("🦣 Sign in to CPG")).toBeTruthy();
    expect(screen.getByLabelText("Username")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(mocks.currentUser.mock.invocationCallOrder[0]);
  });

  it.each([
    ["the admin", { role: "admin" }],
    ["a normal user", { role: "user" }],
  ])("sends %s, already signed in, to /admin", async (_case, user) => {
    mocks.currentUser.mockResolvedValue(user);

    await expect(resolveServerComponents(LoginPage())).rejects.toThrow("NEXT_REDIRECT /admin");
  });

  it("has its own title", () => {
    expect(metadata.title).toBe("Sign in · Caveman Planning Good");
  });
});
