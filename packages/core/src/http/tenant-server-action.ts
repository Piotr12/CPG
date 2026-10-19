import { z } from "zod";
import { tenantScope } from "../container/tenant-scope";
import type { AppContainer } from "../container/cradle";
import { assertCurrentGeneration } from "../domain/tenants/generation";
import { generationRequired } from "./idempotency-key";
import { inRequestTransaction } from "./request-transaction";
import type { Result } from "./result";
import { serverAction } from "./server-action";

/** A bound generation is client-supplied like any action argument: a whole number from 1. */
const generationSchema = z.number().int().positive();

/**
 * `serverAction` for tenant data. The page binds its URL's tenant and the dataset generation it
 * rendered (`action.bind(null, tenant.code, tenant.generation)`), so a form always writes to the
 * tenant it was rendered for, even after another tab switched, and never into a newer Test dataset
 * than the one it showed (R07, TEN-030). The code is re-validated here: an unknown one is
 * `TENANT_NOT_FOUND`, before the input is parsed. The handler runs in one transaction on the
 * tenant scope's `em`, after the generation is checked against a fresh read in that same
 * transaction: a stale one is `GENERATION_STALE`, and a Test reset can't commit in between.
 */
export function tenantServerAction<Schema extends z.ZodType, T>(
  schema: Schema,
  handler: (input: z.infer<Schema>, scope: AppContainer) => Promise<T>,
): (tenantCode: string, generation: number, raw: unknown) => Promise<Result<T>> {
  return async (tenantCode, generation, raw) => {
    const scoped = await serverAction(z.unknown(), () => tenantScope(tenantCode))(undefined);
    if (!scoped.ok) return scoped;
    const scope = scoped.data;
    return serverAction(schema, (input) =>
      inRequestTransaction(scope.cradle.em, async () => {
        const sent = generationSchema.safeParse(generation);
        if (!sent.success) throw generationRequired();
        const current = await scope.cradle.tenantService.currentGeneration(scope.cradle.tenant.code);
        assertCurrentGeneration(current, sent.data, true);
        return handler(input, scope);
      }),
    )(raw);
  };
}
