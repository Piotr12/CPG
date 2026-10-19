"use server";

import { redirect } from "next/navigation";
import { requestScope } from "@cpg/core";
import { SIGN_IN_PATH } from "../../auth/require-admin";
import { clearSessionCookie, readSessionToken } from "../../auth/session-cookie";

/** Ends the current session (if any), drops the cookie and goes back to sign-in. */
export async function signOut(): Promise<void> {
  const { authService } = (await requestScope()).cradle;
  await authService.signOut(await readSessionToken());
  await clearSessionCookie();
  redirect(SIGN_IN_PATH);
}
