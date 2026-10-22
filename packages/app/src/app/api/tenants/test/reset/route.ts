import { apiActor, parseInput, readGeneration } from "@cpg/core";
import { testResetBodySchema } from "@cpg/core/validators/tenants/test-reset.schema";
import { testResetApiWrite } from "../../../../../auth/api-write";

/** Atomically replaces Test only, with the body's dataset (tiny when absent); the wrapper has validated its generation before key lookup. */
export const POST = testResetApiWrite(async ({ request, body, cradle, caller }) => {
  const { dataset } = parseInput(testResetBodySchema, body);
  return cradle.testResetService.reset(readGeneration(request)!, apiActor(caller), dataset);
});
