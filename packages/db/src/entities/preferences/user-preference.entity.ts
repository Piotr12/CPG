import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { User } from "../auth/user.entity";

/** The languages CPG speaks. English is the default (UX-001). */
export const LOCALES = ["en", "pl"] as const;
export type Locale = (typeof LOCALES)[number];

/** The two colour modes the PRD names; light is what CPG looked like before the choice existed. */
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * One account's display choices. Global, never tenant-scoped: it survives a Test reset (PRD §05).
 * An account with no row has never chosen and gets the defaults.
 */
export const UserPreference = defineEntity({
  name: "UserPreference",
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    user: () => p.oneToOne(User).owner().unique().deleteRule("cascade"),
    locale: p.enum(LOCALES),
    theme: p.enum(THEMES),
    updatedAt: p
      .datetime()
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  },
});

export type UserPreference = InferEntity<typeof UserPreference>;
