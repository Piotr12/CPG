import { z } from "zod";

/** Deactivate (`active: false`) or reactivate a normal user. */
export const setUserActiveSchema = z.object({
  userId: z.uuid(),
  active: z.boolean(),
});

export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;
