import { createHash, timingSafeEqual } from "node:crypto";
import { Session, User, type EntityManager, type UserRole } from "@cpg/db";
import type { AppConfig } from "../../config";
import { TooManyRequestsError, UnauthorizedError } from "../../http/errors";
import type { LoginThrottle } from "./login-throttle";
import { verifyDummy, verifyPassword } from "./password-hash";
import { generateSessionToken, hashSessionToken } from "./session-token";

/** The built-in administrator's fixed username. */
export const BUILT_IN_ADMIN_USERNAME = "admin";
/** Sessions end 12 hours after sign-in: a working day, then sign in again. No renewal. */
export const SESSION_TTL_MS = 12 * 60 * 60_000;
/** One message for every credential failure, so it never reveals whether an account exists. */
export const INVALID_CREDENTIALS = "Invalid username or password.";

export interface SignInRequest {
  username: string;
  password: string;
  /** Where the attempt came from, for brute-force throttling. */
  clientIp: string;
}

export interface SignedIn {
  /** The raw session token: goes into the cookie and nowhere else. */
  token: string;
  expiresAt: Date;
}

export interface SessionUser {
  sessionId: string;
  userId: string;
  username: string;
  role: UserRole;
}

interface Deps {
  em: EntityManager;
  config: AppConfig;
  loginThrottle: LoginThrottle;
}

/** Who a password check proved: the built-in admin, or a normal user and the hash that matched. */
type Verified = { kind: "admin" } | { kind: "user"; userId: string; passwordHash: string };

/**
 * Signs accounts in and out, and turns a session token back into its user. The built-in admin's
 * password is `CPG_ADMIN_PASSWORD`; normal users' are argon2id hashes. Unknown, inactive and
 * wrong-password attempts look the same: one message, a dummy hash for the time, and throttle
 * buckets keyed by the submitted name whether or not it exists.
 */
export class AuthService {
  private readonly em: EntityManager;
  private readonly config: AppConfig;
  private readonly loginThrottle: LoginThrottle;

  constructor({ em, config, loginThrottle }: Deps) {
    this.em = em;
    this.config = config;
    this.loginThrottle = loginThrottle;
  }

  /** Checks the credentials and opens a session. Throws `UnauthorizedError` or `TooManyRequestsError`. */
  async signIn({ username, password, clientIp }: SignInRequest): Promise<SignedIn> {
    const name = username.trim().toLowerCase();
    if (this.loginThrottle.isBlocked(clientIp, name)) throw new TooManyRequestsError();

    const verified = await this.verify(name, password);
    if (!verified) {
      this.loginThrottle.recordFailure(clientIp, name);
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    this.loginThrottle.recordSuccess(clientIp, name);

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const tokenHash = hashSessionToken(token);
    if (verified.kind === "admin") {
      this.em.create(Session, { tokenHash, user: await this.ensureBuiltInAdmin(), expiresAt });
      await this.em.flush();
    } else {
      await this.openUserSession(verified, tokenHash, expiresAt);
    }
    return { token, expiresAt };
  }

  /** The signed-in user for a session token, or null when it is missing, unknown or expired. */
  async validateSession(token: string | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    const session = await this.em.findOne(Session, { tokenHash: hashSessionToken(token) }, { populate: ["user"] });
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.em.nativeDelete(Session, { id: session.id });
      return null;
    }
    const { user } = session;
    if (!user.active) {
      // Deactivation already deleted it; a leftover is a bug or a manual edit, so fail closed.
      await this.em.nativeDelete(Session, { id: session.id });
      return null;
    }
    return { sessionId: session.id, userId: user.id, username: user.username, role: user.role };
  }

  /** Ends the session behind `token`. Safe to call twice or with no token. */
  async signOut(token: string | undefined): Promise<void> {
    if (token) await this.em.nativeDelete(Session, { tokenHash: hashSessionToken(token) });
  }

  /** Checks the password against the admin's or the user's credential; null when it doesn't match. */
  private async verify(name: string, password: string): Promise<Verified | null> {
    if (name === BUILT_IN_ADMIN_USERNAME) return this.isAdminPassword(password) ? { kind: "admin" } : null;
    const user = await this.em.findOne(User, { username: name, role: "user" });
    if (!user?.active || !user.passwordHash) return verifyDummy(password).then(() => null);
    return (await verifyPassword(password, user.passwordHash))
      ? { kind: "user", userId: user.id, passwordHash: user.passwordHash }
      : null;
  }

  /**
   * Inserts the session only if the account is still active with the hash just verified. A reset
   * or deactivation that commits during the hash check makes this fail rather than leave a
   * session opened with the old credential behind (R06).
   */
  private async openUserSession(verified: { userId: string; passwordHash: string }, tokenHash: string, expiresAt: Date) {
    await this.em.transactional(async (em) => {
      const user = await em.findOne(User, { id: verified.userId, active: true, passwordHash: verified.passwordHash });
      if (!user) throw new UnauthorizedError(INVALID_CREDENTIALS);
      em.create(Session, { tokenHash, user, expiresAt });
    });
  }

  /** Constant-time comparison of SHA-256 digests (equal length whatever the input). Fails closed. */
  private isAdminPassword(password: string): boolean {
    const expected = this.config.adminPassword;
    if (!expected) return false;
    const digest = (value: string) => createHash("sha256").update(value).digest();
    return timingSafeEqual(digest(password), digest(expected));
  }

  /** The admin's row, created on the first successful sign-in; the unique username keeps it single. */
  private async ensureBuiltInAdmin(): Promise<User> {
    const where = { username: BUILT_IN_ADMIN_USERNAME, role: "admin" } as const;
    await this.em.upsert(User, where, { onConflictFields: ["username"], onConflictAction: "ignore" });
    return this.em.findOneOrFail(User, where);
  }
}
