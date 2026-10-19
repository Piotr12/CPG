import { defineEntity, type InferEntity } from "@mikro-orm/core";
import { idempotencyKeyProperties } from "./idempotency-key";

/**
 * The idempotency key of an API write outside any tenant (accounts, tokens, preferences). A key
 * belongs to one account (spec Q3): the unique index makes a second write with it impossible, even
 * from two processes at once (Q6).
 */
export const GlobalIdempotencyKey = defineEntity({
  name: "GlobalIdempotencyKey",
  properties: idempotencyKeyProperties(),
  uniques: [{ properties: ["userId", "key"] }],
  indexes: [{ properties: ["createdAt"] }],
});

export type GlobalIdempotencyKey = InferEntity<typeof GlobalIdempotencyKey>;
