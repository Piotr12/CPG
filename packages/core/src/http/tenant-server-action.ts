import { z } from "zod";
import { tenantScope } from "../container/tenant-scope";
import type { AppContainer } from "../container/cradle";
import type { Result } from "./result";
import { serverAction } from "./server-action";

/**
 * `serverAction` for tenant data. The page binds its URL's tenant as the first argument
 * (`action.bind(null, tenant)`), so a form always writes to the tenant it was rendered for, even
 * after another tab switched. The code is re-validated here: an unknown one is `TENANT_NOT_FOUND`,
 * before the input is parsed. The handler gets the tenant's scope to resolve services from.
 */
export function tenantServerAction<Schema extends z.ZodType, T>(
  schema: Schema,
  handler: (input: z.infer<Schema>, scope: AppContainer) => Promise<T>,
): (tenantCode: string, raw: unknown) => Promise<Result<T>> {
  return async (tenantCode, raw) => {
    const scoped = await serverAction(z.unknown(), () => tenantScope(tenantCode))(undefined);
    if (!scoped.ok) return scoped;
    return serverAction(schema, (input) => handler(input, scoped.data))(raw);
  };
}
