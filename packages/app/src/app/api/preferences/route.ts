import { apiActor, parseInput, requestScope } from "@cpg/core";
import { userPreferenceUpdateSchema } from "@cpg/core/validators/preferences/user-preference-update.schema";
import { apiWrite } from "../../../auth/api-write";
import { requireApiUser } from "../../../auth/require-api-user";
import { apiHandler } from "../../../routing/api-handler";

/** The caller's own language and theme, or the defaults when they never chose. */
export const GET = apiHandler(async (request: Request) => {
  const caller = await requireApiUser(request);
  return (await requestScope()).cradle.userPreferenceService.get(caller.userId);
});

/**
 * Changes the caller's own language and/or theme, as the signed-in header does. Only the fields sent
 * change, so two clients changing different fields never undo each other: no version needed.
 */
export const PATCH = apiWrite(async ({ caller, body, cradle }) =>
  cradle.userPreferenceService.update(caller.userId, parseInput(userPreferenceUpdateSchema, body), apiActor(caller)),
);
