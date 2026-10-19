"use server";

import { revalidatePath } from "next/cache";
import {
  assertSignedIn,
  requestScope,
  serverAction,
  type CreatedApiToken,
  type Cradle,
  type Result,
  type SessionUser,
} from "@cpg/core";
import { createApiTokenSchema } from "@cpg/core/validators/api-tokens/create-api-token.schema";
import { revokeApiTokenSchema } from "@cpg/core/validators/api-tokens/revoke-api-token.schema";
import { currentUser } from "../../../../auth/require-admin";

/** The tokens screen, refreshed after every successful change. */
const TOKENS_PATH = "/admin/tokens";

/**
 * Creates a named token for the signed-in account and returns its secret, this once (API-001,
 * API-006). The only way to mint a token: a server action, authenticated by the session cookie,
 * which a bearer token can't reach (R07, API-032; pinned by tests/api-token-minting.test.ts).
 */
export async function createApiToken(values: unknown): Promise<Result<CreatedApiToken>> {
  return asSignedIn((actor, { apiTokenService }) =>
    serverAction(createApiTokenSchema, ({ name }) => apiTokenService.create(assertSignedIn(actor), name))(values),
  );
}

/** Revokes one of the signed-in account's own tokens (API-008). */
export async function revokeApiToken(values: unknown): Promise<Result<{ id: string }>> {
  return asSignedIn((actor, { apiTokenService }) =>
    serverAction(revokeApiTokenSchema, ({ tokenId }) => apiTokenService.revoke(assertSignedIn(actor).userId, tokenId))(
      values,
    ),
  );
}

/**
 * Runs one write for the signed-in account: hands `run` the session's user (checked with
 * `assertSignedIn` inside the `serverAction` wrapper, after parsing) and the request's services,
 * then refreshes the tokens screen when it succeeded. The account always comes from the session,
 * never from the input.
 */
async function asSignedIn<T>(run: (actor: SessionUser | null, cradle: Cradle) => Promise<Result<T>>): Promise<Result<T>> {
  const { cradle } = await requestScope();
  const result = await run(await currentUser(), cradle);
  if (result.ok) revalidatePath(TOKENS_PATH);
  return result;
}
