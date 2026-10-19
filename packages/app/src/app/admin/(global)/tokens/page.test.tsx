import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../../../tests/setup/server-components";
import { en } from "../../../../i18n/messages/en";
import { pl } from "../../../../i18n/messages/pl";
import TokensPage, { metadata } from "./page";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  list: vi.fn(),
  requireUser: vi.fn(),
  getMessages: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@cpg/core", () => ({
  requestScope: async () => ({ cradle: { apiTokenService: { list: mocks.list } } }),
}));
vi.mock("../../../../auth/require-admin", () => ({ requireUser: mocks.requireUser }));
vi.mock("../../../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));
vi.mock("../../../../components/api-tokens/create-token-dialog", () => ({
  CreateTokenDialog: ({ labels }: { labels: { create: { open: string } } }) => <button>{labels.create.open}</button>,
}));
vi.mock("../../../../components/api-tokens/tokens-table", () => ({
  TokensTable: ({ tokens, labels }: { tokens: { name: string }[]; labels: { heading: string } }) => (
    <p>
      {labels.heading} table: {tokens.map((token) => token.name).join(", ")}
    </p>
  ),
}));

const tokens = [{ id: "t1", name: "agent1", createdAt: new Date("2026-10-19T11:00:00Z"), lastUsedAt: null }];

describe("TokensPage", () => {
  beforeEach(() => {
    mocks.requireUser.mockResolvedValue({ sessionId: "s2", userId: "u2", username: "alice", role: "user" });
    mocks.list.mockResolvedValue(tokens);
    mocks.getMessages.mockResolvedValue({ locale: "en", messages: en });
  });
  afterEach(() => vi.clearAllMocks());

  it("lists the signed-in account's own tokens and offers Create token", async () => {
    render(await resolveServerComponents(TokensPage()));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.list).toHaveBeenCalledWith("u2");
    expect(screen.getByRole("heading", { name: "API tokens" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cave control" }).getAttribute("href")).toBe("/admin");
    expect(screen.getByText(/as you, in Test and Prod, until you revoke it\. Tokens never expire\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create token" })).toBeTruthy();
    expect(screen.getByText("API tokens table: agent1")).toBeTruthy();
  });

  it("speaks Polish to a Polish account", async () => {
    mocks.getMessages.mockResolvedValue({ locale: "pl", messages: pl });

    render(await resolveServerComponents(TokensPage()));

    const heading = screen.getByRole("heading", { name: "Tokeny API" });
    expect(heading.closest("[lang]")?.getAttribute("lang")).toBe("pl");
    expect(screen.getByRole("button", { name: "Utwórz token" })).toBeTruthy();
  });

  it("renders no data when the gate refuses the visitor", async () => {
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));

    await expect(resolveServerComponents(TokensPage())).rejects.toThrow("NEXT_REDIRECT /login");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("has its own title", () => {
    expect(metadata.title).toBe("API tokens · Caveman Planning Good");
  });
});
