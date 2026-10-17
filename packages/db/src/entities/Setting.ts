import { defineEntity, p, type InferEntity } from "@mikro-orm/core";

/** Key/value application settings. */
export const Setting = defineEntity({
  name: "Setting",
  properties: {
    key: p.string().primary(),
    value: p.text(),
    updatedAt: p
      .datetime()
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  },
});

export type Setting = InferEntity<typeof Setting>;
