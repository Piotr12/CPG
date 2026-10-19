import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";

/** `admin` is only ever the built-in administrator; every other account is a `user`. */
export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * An account that can sign in. The built-in admin's password lives in the environment, not here;
 * a normal user's is an argon2id PHC string in `passwordHash`. Accounts are never deleted, only
 * deactivated (`active: false`), so history keeps their name.
 */
export const User = defineEntity({
  name: "User",
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    username: p.string().unique(),
    role: p.enum(USER_ROLES),
    passwordHash: p.string().nullable(),
    active: p.boolean().default(true),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export type User = InferEntity<typeof User>;
