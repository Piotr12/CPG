import { defineEntity, type InferEntity } from "@mikro-orm/core";
import { namedRecordDefinition } from "../named-records/named-record-properties";

/** Someone the tenant buys from (E03-S02): an eight-digit ID, a name and an active flag, in one tenant. */
export const Supplier = defineEntity({ name: "Supplier", ...namedRecordDefinition() });

export type Supplier = InferEntity<typeof Supplier>;
