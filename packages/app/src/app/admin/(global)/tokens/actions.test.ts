import { ConflictError, NotFoundError } from "@cpg/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiToken, revokeApiToken } from "./actions";

const TOKEN_ID = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";
const alice = { sessionId: "s2", userId: "u2", username: "alice", role: "user" };
const created = {
  token: { id: TOKEN_ID, name: "agent1", createdAt: new Date("2026-10-19T11:00:00Z"), lastUsedAt: null },
  secret: "cpg_secret",
};

const mocks = vi.hoisted(() => ({
  apiTokenService: { create: vi.fn(), revoke: vi.fn() },
  currentUser: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@cpg/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cpg/core")>()),
  requestScope: async () => ({ cradle: { apiTokenService: mocks.apiTokenService } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("../../../../auth/require-admin", () => ({ currentUser: mocks.currentUser }));

describe("API token actions", () => {
  beforeEach(() => {
    mocks.currentUser.mockResolvedValue(alice);
    mocks.apiTokenService.create.mockResolvedValue(created);
    mocks.apiTokenService.revoke.mockResolvedValue({ id: TOKEN_ID });
  });
  afterEach(() => vi.clearAllMocks());

  it("creates a token for the session's account and returns its secret once (API-001)", async () => {
    await expect(createApiToken({ name: "  agent1 " })).resolves.toEqual({ ok: true, data: created });

    expect(mocks.apiTokenService.create).toHaveBeenCalledWith(alice, "agent1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/tokens");
  });

  it("takes the owner from the session, never from the input", async () => {
    await createApiToken({ name: "agent1", userId: "u1", sessionId: "s1" });
    await revokeApiToken({ tokenId: TOKEN_ID, userId: "u1" });

    expect(mocks.apiTokenService.create).toHaveBeenCalledWith(alice, "agent1");
    expect(mocks.apiTokenService.revoke).toHaveBeenCalledWith("u2", TOKEN_ID, {
      userId: "u2",
      username: "alice",
      sessionId: "s2",
      channel: "ui",
      token: null,
    });
  });

  it("reports a taken name and a vanished token without refreshing", async () => {
    mocks.apiTokenService.create.mockRejectedValue(new ConflictError("You already have a token with that name."));
    mocks.apiTokenService.revoke.mockRejectedValue(new NotFoundError("TOKEN_NOT_FOUND", "No such token."));

    await expect(createApiToken({ name: "agent1" })).resolves.toEqual({
      ok: false,
      error: { code: "CONFLICT", message: "You already have a token with that name." },
    });
    await expect(revokeApiToken({ tokenId: TOKEN_ID })).resolves.toEqual({
      ok: false,
      error: { code: "TOKEN_NOT_FOUND", message: "No such token." },
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("validates the input before touching the service", async () => {
    await expect(createApiToken({ name: " " })).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    await expect(revokeApiToken({ tokenId: "x" })).resolves.toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });

    expect(mocks.apiTokenService.create).not.toHaveBeenCalled();
    expect(mocks.apiTokenService.revoke).not.toHaveBeenCalled();
  });

  it("refuses without a session and changes nothing", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const error = { code: "UNAUTHORIZED", message: "You need to sign in." };

    await expect(createApiToken({ name: "agent1" })).resolves.toEqual({ ok: false, error });
    await expect(revokeApiToken({ tokenId: TOKEN_ID })).resolves.toEqual({ ok: false, error });

    expect(mocks.apiTokenService.create).not.toHaveBeenCalled();
    expect(mocks.apiTokenService.revoke).not.toHaveBeenCalled();
  });
});
