import { ApiToken, Session, Setting, UniqueConstraintViolationException, type EntityManager } from "@cpg/db";
import type { AppConfig } from "../../config";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../http/errors";
import { uiActor, type AuditActor } from "../audit/actor";
import { recordGlobalAudit } from "../audit/audit-recorder";
import type { Actor } from "../auth/actor";
import { ADMIN_PASSWORD_SETTING, verifiedAdminPasswordStamp } from "../auth/admin-password-stamp";
import { generateApiTokenSecret, hashApiTokenSecret } from "../auth/api-token-secret";
import type { SessionUser } from "../auth/auth.service";
import { tokenCreatedEntry, tokenRevokedEntry } from "./api-token-audit";

export const TOKEN_NAME_TAKEN = "You already have a token with that name.";
export const TOKEN_NOT_FOUND = "No such token.";
/** "Last used" is shown to the minute, so recording it more often than this is wasted writes. */
export const LAST_USED_RESOLUTION_MS = 60_000;

/** What the tokens screen and `GET /api/tokens` show about a token. Never the secret or its hash. */
export interface ApiTokenSummary {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** A new token and its secret: the only time the secret leaves the server (API-006). */
export interface CreatedApiToken {
  token: ApiTokenSummary;
  secret: string;
}

/** An account calling the API with a token. The token id and name are for audit attribution. */
export interface ApiActor extends Actor {
  tokenId: string;
  tokenName: string;
}

interface Deps {
  em: EntityManager;
  config: AppConfig;
}

/**
 * Each account's named API tokens: list, create, revoke, and turn a secret back into its owner.
 * Every method works on one account's own tokens, identified by the caller's verified identity,
 * never by client input. Creating needs a browser session (`SessionUser`), so a bearer token can
 * never mint another (R07, API-032).
 */
export class ApiTokenService {
  private readonly em: EntityManager;
  private readonly config: AppConfig;

  constructor({ em, config }: Deps) {
    this.em = em;
    this.config = config;
  }

  /** The account's tokens, newest first. */
  async list(userId: string): Promise<ApiTokenSummary[]> {
    const tokens = await this.em.find(ApiToken, { user: userId }, { orderBy: { createdAt: "desc", name: "asc" } });
    return tokens.map(toSummary);
  }

  /**
   * A new token for the signed-in account, its secret returned this once. The insert happens only
   * while the actor's session still exists and its account is active: a reset or deactivation
   * deletes the sessions, so one that commits mid-request leaves no token behind (R06). For the
   * admin, the password the server runs with must also still be the stamped one (spec Q8).
   * `ConflictError` when the account already has a token with that name. The Global audit records
   * the creation in the same transaction (AUD-014).
   */
  async create(actor: SessionUser, name: string): Promise<CreatedApiToken> {
    // The argon2 check runs before the transaction (SQLite has one writer); the transaction then
    // makes sure the stamp it verified is still the stored one.
    const stamp = actor.role === "admin" ? await this.verifiedAdminStamp() : undefined;
    const secret = generateApiTokenSecret();
    try {
      const token = await this.em.transactional(async (em) => {
        const session = await em.findOne(Session, { id: actor.sessionId }, { populate: ["user"] });
        if (!session || session.user.id !== actor.userId || !session.user.active) throw new UnauthorizedError();
        // A count, not a find: the identity map already holds the stamp read before the transaction.
        if (stamp !== undefined && !(await em.count(Setting, { key: ADMIN_PASSWORD_SETTING, value: stamp }))) {
          throw new UnauthorizedError();
        }
        const created = em.create(ApiToken, { user: session.user, name, tokenHash: hashApiTokenSecret(secret) });
        recordGlobalAudit(em, uiActor(actor), tokenCreatedEntry(created));
        await em.flush();
        return created;
      });
      return { token: toSummary(token), secret };
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(TOKEN_NAME_TAKEN);
      throw error;
    }
  }

  /**
   * Deletes one of the account's tokens and records it in the Global audit, attributed to `actor`
   * (the session, or the token used for the call; AUD-007, AUD-014). `TOKEN_NOT_FOUND` for anything
   * else, without saying why.
   */
  async revoke(userId: string, tokenId: string, actor: AuditActor): Promise<{ id: string }> {
    return this.em.transactional(async (em) => {
      const token = await em.findOne(ApiToken, { id: tokenId, user: userId });
      if (!token) throw new NotFoundError("TOKEN_NOT_FOUND", TOKEN_NOT_FOUND);
      await em.nativeDelete(ApiToken, { id: token.id });
      recordGlobalAudit(em, actor, tokenRevokedEntry(token));
      return { id: token.id };
    });
  }

  /**
   * The account behind a token secret, with its current role, or null when the secret is unknown
   * (never issued, revoked, or deleted by a reset or deactivation) or the account is inactive.
   */
  async authenticate(secret: string): Promise<ApiActor | null> {
    const token = await this.em.findOne(ApiToken, { tokenHash: hashApiTokenSecret(secret) }, { populate: ["user"] });
    if (!token?.user.active) return null;
    await this.recordUse(token);
    const { id: userId, username, role } = token.user;
    return { userId, username, role, tokenId: token.id, tokenName: token.name };
  }

  /** The admin's verified password stamp; `UnauthorizedError` when the server's password isn't it. */
  private async verifiedAdminStamp(): Promise<string> {
    const stamp = await verifiedAdminPasswordStamp(this.em, this.config.adminPassword);
    if (stamp === null) throw new UnauthorizedError();
    return stamp;
  }

  /**
   * Records the use, at most once per `LAST_USED_RESOLUTION_MS` (API-007). Bookkeeping, not an
   * access decision: a failure is logged and the request goes on. `nativeUpdate` never re-creates
   * a row a concurrent revoke just deleted.
   */
  private async recordUse(token: ApiToken): Promise<void> {
    const now = new Date();
    if (token.lastUsedAt && now.getTime() - token.lastUsedAt.getTime() < LAST_USED_RESOLUTION_MS) return;
    try {
      await this.em.nativeUpdate(ApiToken, { id: token.id }, { lastUsedAt: now });
    } catch (error) {
      console.error(`Recording the use of API token ${token.id} failed:`, error);
    }
  }
}

function toSummary({ id, name, createdAt, lastUsedAt }: ApiToken): ApiTokenSummary {
  return { id, name, createdAt, lastUsedAt: lastUsedAt ?? null };
}
