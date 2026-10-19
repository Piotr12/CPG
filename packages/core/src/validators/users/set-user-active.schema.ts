import { z } from "zod";
import { versionSchema } from "../version.schema";

/** Deactivate (`active: false`) or reactivate a normal user, at the version the caller loaded. */
export const setUserActiveSchema = z.object({
  userId: z.uuid(),
  active: z.boolean(),
  version: versionSchema,
});

export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

/** `PATCH /api/users/{id}`: the user id comes from the path. */
export const setUserActiveBodySchema = setUserActiveSchema.omit({ userId: true });
