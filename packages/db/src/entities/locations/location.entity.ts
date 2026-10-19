import { defineEntity, type InferEntity } from "@mikro-orm/core";
import { namedRecordDefinition } from "../named-records/named-record-properties";

/** A production or stock site (E03-S02): an eight-digit ID, a name and an active flag, in one tenant. */
export const Location = defineEntity({ name: "Location", ...namedRecordDefinition() });

export type Location = InferEntity<typeof Location>;
