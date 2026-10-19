import { defineEntity, type InferEntity } from "@mikro-orm/core";
import { namedRecordDefinition } from "../named-records/named-record-properties";

/** Someone the tenant sells to (E03-S02): an eight-digit ID, a name and an active flag, in one tenant. */
export const Customer = defineEntity({ name: "Customer", ...namedRecordDefinition() });

export type Customer = InferEntity<typeof Customer>;
