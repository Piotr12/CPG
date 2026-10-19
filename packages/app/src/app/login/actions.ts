"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { INVALID_CREDENTIALS, requestScope, serverAction, type Theme } from "@cpg/core";
import { signInSchema } from "@cpg/core/validators/auth/sign-in.schema";
import { clientIpFrom } from "../../auth/client-ip";
import { writeSessionCookie } from "../../auth/session-cookie";
import { writeThemeCookie } from "../../preferences/theme-cookie";

export interface SignInState {
  error?: string;
}

/** Where a successful sign-in lands. */
const AFTER_SIGN_IN_PATH = "/admin";
const MISSING_FIELDS = "Enter your username and password.";

/** The login form's action: on success sets the session cookie and goes to `/admin`. */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const { authService, userPreferenceService, config } = (await requestScope()).cradle;
  const clientIp = clientIpFrom(await headers());
  const attempt = serverAction(signInSchema, (input) => authService.signIn({ ...input, clientIp }));
  const result = await attempt({ username: formData.get("username"), password: formData.get("password") });

  if (!result.ok) return { error: errorMessage(result.error, formData) };

  const secure = config.env === "production";
  await writeSessionCookie(result.data.token, result.data.expiresAt, { secure });
  await writeThemeCookie(await storedTheme(() => userPreferenceService.get(result.data.userId)), { secure });
  redirect(AFTER_SIGN_IN_PATH);
}

/** The account's theme for the first paint. A failed read never blocks sign-in: it falls back to light. */
async function storedTheme(read: () => Promise<{ theme: Theme }>): Promise<Theme> {
  try {
    return (await read()).theme;
  } catch (error) {
    console.error("Preference lookup at sign-in failed:", error);
    return "light";
  }
}

/** Missing fields get a prompt; anything else the schema refuses reads like any wrong credentials. */
function errorMessage(error: { code: string; message: string }, formData: FormData): string {
  if (error.code !== "VALIDATION_FAILED") return error.message;
  const isFilled = (name: string) => String(formData.get(name) ?? "").trim() !== "";
  return isFilled("username") && isFilled("password") ? INVALID_CREDENTIALS : MISSING_FIELDS;
}
