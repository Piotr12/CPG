import { z } from "zod";

/** Upper bounds keep a hostile request from making the server hash or compare megabytes. */
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 256;

/** The sign-in form and the `signIn` action share this schema. */
export const signInSchema = z.object({
  username: z.string().trim().min(1, "Enter your username.").max(MAX_USERNAME_LENGTH),
  password: z.string().min(1, "Enter your password.").max(MAX_PASSWORD_LENGTH),
});

export type SignInInput = z.infer<typeof signInSchema>;
