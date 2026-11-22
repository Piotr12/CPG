import { requireApiUser, type ApiCaller } from "../../../auth/require-api-user";
import { apiHandler } from "../../../routing/api-handler";

/** Who `GET /api/me` says the caller is. Never the token's secret or hash: only its id and name. */
export interface Me {
  id: string;
  username: string;
  role: ApiCaller["role"];
  /** The bearer token the request came with, or `null` for a browser session. */
  token: { id: string; name: string } | null;
}

/**
 * The caller's own account, role and token name, so a client such as the MCP server (spec
 * `2026-11-22--0818UTC-local-mcp-server`, Q3) knows which operations it may offer. Any signed-in
 * caller, by session cookie or bearer token; a read, so it needs no key.
 */
export const GET = apiHandler(async (request: Request): Promise<Me> => {
  const caller = await requireApiUser(request);
  const token = "tokenId" in caller ? { id: caller.tokenId, name: caller.tokenName } : null;
  return { id: caller.userId, username: caller.username, role: caller.role, token };
});
