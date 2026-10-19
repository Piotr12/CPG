import { Session, UniqueConstraintViolationException, User, type EntityManager, type UserRole } from "@cpg/db";
import { ConflictError, NotFoundError } from "../../http/errors";
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
 * every session of that user in the same transaction (R06). Callers check that the actor is the
 * admin (`assertAdmin`) before calling.
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
  async create({ username, password }: NewUser): Promise<UserSummary> {
    const name = username.trim().toLowerCase();
    if (name === BUILT_IN_ADMIN_USERNAME) throw new ConflictError(USERNAME_TAKEN);
    const passwordHash = await hashPassword(password);
    const user = this.em.create(User, { username: name, role: "user", passwordHash });
    try {
      await this.em.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(USERNAME_TAKEN);
      throw error;
    }
    return toSummary(user);
  }

  /** Replaces the password and signs the user out everywhere, atomically. */
  async resetPassword(userId: string, password: string): Promise<UserSummary> {
    // Hash before the transaction: SQLite has one writer, so keep the write lock short.
    const passwordHash = await hashPassword(password);
    return this.changeNormalUser(userId, (user) => {
      user.passwordHash = passwordHash;
      return true;
    });
  }

  /**
   * Deactivates (signing the user out everywhere) or reactivates. Idempotent: setting the current
   * state again succeeds and changes nothing.
   */
  async setActive(userId: string, active: boolean): Promise<UserSummary> {
    return this.changeNormalUser(userId, (user) => {
      user.active = active;
      return !active;
    });
  }

  /** Applies `change` to a normal user in one transaction; ends their sessions when it returns true. */
  private async changeNormalUser(userId: string, change: (user: User) => boolean): Promise<UserSummary> {
    return this.em.transactional(async (em) => {
      const user = await em.findOne(User, { id: userId, role: "user" });
      if (!user) throw new NotFoundError(USER_NOT_FOUND);
      if (change(user)) await em.nativeDelete(Session, { user: user.id });
      await em.flush();
      return toSummary(user);
    });
  }
}

function toSummary({ id, username, role, active, createdAt }: User): UserSummary {
  return { id, username, role, active, createdAt };
}
