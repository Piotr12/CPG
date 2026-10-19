import { z } from "zod";
import { nameSchema } from "./named-record-fields.schema";

/**
 * A new location, customer or supplier: the Create form, its action and `POST /api/tenants/{tenant}/
 * {locations|customers|suppliers}` share it. There is no ID: the server assigns it (spec Q2).
 */
export const namedRecordCreateSchema = z.object({ name: nameSchema });

export type NamedRecordCreateInput = z.infer<typeof namedRecordCreateSchema>;
