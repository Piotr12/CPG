import type { ApiToken } from "@cpg/db";
import type { AuditEntry } from "../audit/audit-recorder";

/** The token fields an audit entry may show: its id and name, never the secret or its hash (AUD-028). */
type AuditedToken = Pick<ApiToken, "id" | "name">;

/** The Global audit entry for a new token (AUD-014). */
export function tokenCreatedEntry(token: AuditedToken): AuditEntry {
  return tokenEntry("tokens.api-token.created", token, null, { name: token.name });
}

/**
 * The Global audit entry for a token that ended: revoked by its owner, or deleted by a password
 * reset or a deactivation (AUD-014). The same entry either way; the account change recorded beside
 * it says why.
 */
export function tokenRevokedEntry(token: AuditedToken): AuditEntry {
  return tokenEntry("tokens.api-token.revoked", token, { name: token.name }, null);
}

function tokenEntry(action: string, token: AuditedToken, before: AuditEntry["before"], after: AuditEntry["after"]): AuditEntry {
  return { action, subject: { type: "ApiToken", id: token.id, label: token.name }, before, after };
}
