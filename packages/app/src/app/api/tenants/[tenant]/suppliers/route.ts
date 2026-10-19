import { apiActor, apiHandler, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { namedRecordCreateSchema } from "@cpg/core/validators/named-records/named-record-create.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";

type Context = RouteContext<"/api/tenants/[tenant]/suppliers">;

/** The tenant's suppliers by ID, inactive ones included, as the suppliers screen lists them. Any signed-in account. */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.supplierService.list();
});

/**
 * Creates a supplier with the tenant's next supplier ID, as the Create supplier form does (R07).
 * Admin only, checked before the key and the body (API-010).
 */
export const POST = tenantApiWrite(
  async ({ caller, body, cradle }: WriteContext<Context>) =>
    cradle.supplierService.create(parseInput(namedRecordCreateSchema, body), apiActor(caller)),
  { authorize: assertAdmin },
);
