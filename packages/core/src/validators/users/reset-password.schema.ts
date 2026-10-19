import { z } from "zod";
import { passwordSchema } from "./create-user.schema";

/** The admin's Reset password form and the `resetUserPassword` action share this schema. */
export const resetPasswordSchema = z.object({
  userId: z.uuid(),
  password: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
