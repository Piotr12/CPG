import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { User } from "./user.entity";

/**
 * A signed-in browser. Only the SHA-256 of the session token is stored, so a copy of the database
 * can't be used to sign in; the raw token exists only in the user's cookie.
 */
export const Session = defineEntity({
  name: "Session",
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tokenHash: p.string().length(64).unique(),
    user: () => p.manyToOne(User).deleteRule("cascade"),
    createdAt: p.datetime().onCreate(() => new Date()),
    expiresAt: p.datetime().index(),
  },
});

export type Session = InferEntity<typeof Session>;
