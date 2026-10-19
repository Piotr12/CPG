"use server";

import { revalidatePath } from "next/cache";
import {
  assertAdmin,
  requestScope,
  serverAction,
  uiActor,
  type Cradle,
  type Result,
  type SessionUser,
  type UserSummary,
} from "@cpg/core";
import { createUserSchema } from "@cpg/core/validators/users/create-user.schema";
import { resetPasswordSchema } from "@cpg/core/validators/users/reset-password.schema";
import { setUserActiveSchema } from "@cpg/core/validators/users/set-user-active.schema";
import { currentUser } from "../../../../auth/require-admin";

/** The users screen, refreshed after every successful change. */
const USERS_PATH = "/admin/users";

/** Creates a normal user (TEN-004). Admin only. */
export async function createUser(values: unknown): Promise<Result<UserSummary>> {
  return asAdmin((actor, { userService }) =>
    serverAction(createUserSchema, (input) => {
      return userService.create(input, uiActor(assertAdmin(actor)));
    })(values),
  );
}

/** Replaces a normal user's password and signs them out everywhere (TEN-006). Admin only. */
export async function resetUserPassword(values: unknown): Promise<Result<UserSummary>> {
  return asAdmin((actor, { userService }) =>
    serverAction(resetPasswordSchema, ({ userId, password, version }) => {
      return userService.resetPassword(userId, password, version, uiActor(assertAdmin(actor)));
    })(values),
  );
}

/** Deactivates (signing out everywhere, TEN-007) or reactivates a normal user. Admin only. */
export async function setUserActive(values: unknown): Promise<Result<UserSummary>> {
  return asAdmin((actor, { userService }) =>
    serverAction(setUserActiveSchema, ({ userId, active, version }) => {
      return userService.setActive(userId, active, version, uiActor(assertAdmin(actor)));
    })(values),
  );
}

/**
 * Runs one admin write: hands `run` the signed-in account (checked with `assertAdmin` inside the
 * `serverAction` wrapper, after parsing, and recorded as the audit's actor) and the request's
 * services, then refreshes the users screen when it succeeded, or when the row was stale
 * (`VERSION_CONFLICT`), so the admin sees what changed and a retry carries the new version.
 */
async function asAdmin<T>(run: (actor: SessionUser | null, cradle: Cradle) => Promise<Result<T>>): Promise<Result<T>> {
  const { cradle } = await requestScope();
  const result = await run(await currentUser(), cradle);
  if (result.ok || result.error.code === "VERSION_CONFLICT") revalidatePath(USERS_PATH);
  return result;
}
