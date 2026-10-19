import { Session, UniqueConstraintViolationException, User, type EntityManager, type UserRole } from "@cpg/db";
import { ConflictError, NotFoundError } from "../../http/errors";
import type { AuditActor } from "../audit/actor";
import { recordGlobalAudit, type AuditEntry } from "../audit/audit-recorder";
import { BUILT_IN_ADMIN_USERNAME } from "../auth/auth.service";
import { hashPassword } from "../auth/password-hash";

/** One message for a taken name and the reserved `admin`: neither says more than "pick another". */
export const USERNAME_TAKEN = "That username is taken.";
export const USER_NOT_FOUND = "No such user.";

/** What the users screen shows about an account. Never carries the password hash. */
export interface UserSummary {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
}

export interface NewUser {
  username: string;
  password: string;
}

interface Deps {
  em: EntityManager;
}

/**
 * The admin's account management: create normal users, reset their passwords, deactivate and
 * reactivate them. Only `role = user` rows are ever written here, so no path creates a second
 * admin or touches the built-in one, and nothing deletes an account. A reset or deactivation ends
 * every session of that user in the same transaction (R06). Every change records its Global audit
 * entry in that same flush (R08). Callers check that the actor is the admin (`assertAdmin`) before
 * calling.
 */
export class UserService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /** Every account, the built-in admin first, then by username. */
  async list(): Promise<UserSummary[]> {
    const users = await this.em.find(User, {}, { orderBy: { role: "asc", username: "asc" } });
    return users.map(toSummary);
  }

  /** A new, active normal user. `ConflictError` when the name is taken or reserved. */
  async create({ username, password }: NewUser, actor: AuditActor): Promise<UserSummary> {
    const name = username.trim().toLowerCase();
    if (name === BUILT_IN_ADMIN_USERNAME) throw new ConflictError(USERNAME_TAKEN);
    const passwordHash = await hashPassword(password);
    const user = this.em.create(User, { username: name, role: "user", passwordHash });
    recordGlobalAudit(this.em, actor, userEntry("users.user.created", user, null, snapshot(user)));
    try {
      await this.em.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(USERNAME_TAKEN);
      throw error;
    }
    return toSummary(user);
  }

  /**
   * Replaces the password and signs the user out everywhere, atomically. The audit records that it
   * happened and to whom, never the password or its hash (AUD-015, AUD-028).
   */
  async resetPassword(userId: string, password: string, actor: AuditActor): Promise<UserSummary> {
    // Hash before the transaction: SQLite has one writer, so keep the write lock short.
    const passwordHash = await hashPassword(password);
    return this.changeNormalUser(userId, actor, (user) => {
      user.passwordHash = passwordHash;
      return { endSessions: true, audit: userEntry("users.user.password-reset", user, null, null) };
    });
  }

  /**
   * Deactivates (signing the user out everywhere) or reactivates. Idempotent: setting the current
   * state again succeeds, changes nothing and records nothing.
   */
  async setActive(userId: string, active: boolean, actor: AuditActor): Promise<UserSummary> {
    return this.changeNormalUser(userId, actor, (user) => {
      if (user.active === active) return { endSessions: false, audit: null };
      const before = snapshot(user);
      user.active = active;
      const action = active ? "users.user.reactivated" : "users.user.deactivated";
      return { endSessions: !active, audit: userEntry(action, user, { active: before.active }, { active }) };
    });
  }

  /**
   * Applies `change` to a normal user in one transaction: ends their sessions and records the audit
   * entry it returns, together with the change itself.
   */
  private async changeNormalUser(userId: string, actor: AuditActor, change: (user: User) => Change): Promise<UserSummary> {
    return this.em.transactional(async (em) => {
      const user = await em.findOne(User, { id: userId, role: "user" });
      if (!user) throw new NotFoundError("NOT_FOUND", USER_NOT_FOUND);
      const { endSessions, audit } = change(user);
      if (endSessions) await em.nativeDelete(Session, { user: user.id });
      if (audit) recordGlobalAudit(em, actor, audit);
      await em.flush();
      return toSummary(user);
    });
  }
}

/** What a change to a normal user did: whether it ends their sessions, and its audit entry, if any. */
interface Change {
  endSessions: boolean;
  audit: AuditEntry | null;
}

/** The fields of an account the audit may show. An allowlist: never the password hash. */
function snapshot({ username, role, active }: User) {
  return { username, role, active };
}

function userEntry(action: string, user: User, before: AuditEntry["before"], after: AuditEntry["after"]): AuditEntry {
  return { action, subject: { type: "User", id: user.id, label: user.username }, before, after };
}

function toSummary({ id, username, role, active, createdAt }: User): UserSummary {
  return { id, username, role, active, createdAt };
}
