import { createHash, timingSafeEqual } from "node:crypto";
import { Session, User, type EntityManager, type UserRole } from "@cpg/db";
import type { AppConfig } from "../../config";
import { TooManyRequestsError, UnauthorizedError } from "../../http/errors";
import type { LoginThrottle } from "./login-throttle";
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
  /** The signed-in account, so the caller can apply its preferences. */
  userId: string;
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

/** Signs the built-in admin in and out, and turns a session token back into its user. */
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
    const account = username === BUILT_IN_ADMIN_USERNAME ? username : null;
    if (this.loginThrottle.isBlocked(clientIp, account)) throw new TooManyRequestsError();

    if (!account || !this.isAdminPassword(password)) {
      this.loginThrottle.recordFailure(clientIp, account);
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }
    this.loginThrottle.recordSuccess(clientIp, account);

    const user = await this.ensureBuiltInAdmin();
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    this.em.create(Session, { tokenHash: hashSessionToken(token), user, expiresAt });
    await this.em.flush();
    return { token, expiresAt, userId: user.id };
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
    return { sessionId: session.id, userId: user.id, username: user.username, role: user.role };
  }

  /** Ends the session behind `token`. Safe to call twice or with no token. */
  async signOut(token: string | undefined): Promise<void> {
    if (token) await this.em.nativeDelete(Session, { tokenHash: hashSessionToken(token) });
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
    const where = { username: BUILT_IN_ADMIN_USERNAME };
    await this.em.upsert(User, { ...where, role: "admin" }, { onConflictFields: ["username"], onConflictAction: "ignore" });
    return this.em.findOneOrFail(User, where);
  }
}
