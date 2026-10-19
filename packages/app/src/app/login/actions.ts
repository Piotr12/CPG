"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestScope, serverAction } from "@cpg/core";
import { signInSchema } from "@cpg/core/validators/auth/sign-in.schema";
import { clientIpFrom } from "../../auth/client-ip";
import { SIGN_IN_PATH } from "../../auth/require-admin";
import { clearSessionCookie, readSessionToken, writeSessionCookie } from "../../auth/session-cookie";

export interface SignInState {
  error?: string;
}

/** Where a successful sign-in lands. */
const AFTER_SIGN_IN_PATH = "/admin";
const MISSING_FIELDS = "Enter your username and password.";

/** The login form's action: on success sets the session cookie and goes to `/admin`. */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const { authService, config } = (await requestScope()).cradle;
  const clientIp = clientIpFrom(await headers());
  const attempt = serverAction(signInSchema, (input) => authService.signIn({ ...input, clientIp }));
  const result = await attempt({ username: formData.get("username"), password: formData.get("password") });

  if (!result.ok) return { error: result.error.code === "VALIDATION_FAILED" ? MISSING_FIELDS : result.error.message };

  await writeSessionCookie(result.data.token, result.data.expiresAt, { secure: config.env === "production" });
  redirect(AFTER_SIGN_IN_PATH);
}

/** Ends the current session (if any), drops the cookie and goes back to sign-in. */
export async function signOut(): Promise<void> {
  const { authService } = (await requestScope()).cradle;
  await authService.signOut(await readSessionToken());
  await clearSessionCookie();
  redirect(SIGN_IN_PATH);
}
