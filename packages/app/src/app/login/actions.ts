"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestScope, serverAction, type Theme } from "@cpg/core";
import { signInSchema } from "@cpg/core/validators/auth/sign-in.schema";
import { clientIpFrom } from "../../auth/client-ip";
import { en } from "../../i18n/messages/en";
import { writeSessionCookie } from "../../auth/session-cookie";
import { writeThemeCookie } from "../../preferences/theme-cookie";

export interface SignInState {
  error?: string;
  /** The username as typed, so a refused attempt keeps it in the field (React resets the form after an action). */
  username?: string;
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

  if (!result.ok) return { error: errorMessage(result.error, formData), username: String(formData.get("username") ?? "") };

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

/**
 * Wrong credentials read as the screen's refusal, with what to do next (the service's message stays
 * terse for the API). Missing fields get a prompt; anything else the schema refuses reads like wrong
 * credentials. The sign-in screen speaks the default language, like its page.
 */
function errorMessage(error: { code: string; message: string }, formData: FormData): string {
  if (error.code === "UNAUTHORIZED") return en.login.invalidCredentials;
  if (error.code !== "VALIDATION_FAILED") return error.message;
  const isFilled = (name: string) => String(formData.get(name) ?? "").trim() !== "";
  return isFilled("username") && isFilled("password") ? en.login.invalidCredentials : MISSING_FIELDS;
}
