import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { User } from "../auth/user.entity";

/** Longest token name: a label the user picks, such as `agent1` or `build`. */
export const API_TOKEN_NAME_MAX = 64;

/**
 * A named bearer credential for the API, owned by one account. Only the SHA-256 of the secret is
 * stored; the secret is shown once at creation. Global, never tenant-scoped: a token reaches both
 * tenants and survives a Test reset (PRD §05). Revoking deletes the row, as do a password reset
 * and a deactivation (R06), so a row that exists is a token that works.
 */
export const ApiToken = defineEntity({
  name: "ApiToken",
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    user: () => p.manyToOne(User).deleteRule("cascade"),
    name: p.string().length(API_TOKEN_NAME_MAX),
    tokenHash: p.string().length(64).unique(),
    createdAt: p.datetime().onCreate(() => new Date()),
    lastUsedAt: p.datetime().nullable(),
  },
  // Names are unique per account, not system-wide (API-003, API-004).
  uniques: [{ properties: ["user", "name"] }],
});

export type ApiToken = InferEntity<typeof ApiToken>;
