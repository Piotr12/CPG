import type { AuditChannel } from "@cpg/db";
import type { ApiActor } from "../api-tokens/api-token.service";
import type { SessionUser } from "../auth/auth.service";

/**
 * Who made a change, as the audit records it (R08): the account, the session it came through, and
 * the channel. Two people sharing one account in two browsers are two sessions (AUD-008). A
 * bearer-token write (E01-S03) names its token; never its secret.
 */
export interface AuditActor {
  userId: string;
  username: string;
  sessionId: string | null;
  channel: AuditChannel;
  token: { id: string; name: string } | null;
}

/** The actor for a change made on CPG's own screens, from the validated session. */
export function uiActor({ userId, username, sessionId }: SessionUser): AuditActor {
  return { userId, username, sessionId, channel: "ui", token: null };
}

/** The actor for a change made with an API token (AUD-007): its id and name, never its secret. */
export function apiActor({ userId, username, tokenId, tokenName }: ApiActor): AuditActor {
  return { userId, username, sessionId: null, channel: "api", token: { id: tokenId, name: tokenName } };
}

/** The actor for an API route's caller: a token, or (on safe requests only) a browser session. */
export function callerActor(caller: ApiActor | SessionUser): AuditActor {
  return "tokenId" in caller ? apiActor(caller) : uiActor(caller);
}
