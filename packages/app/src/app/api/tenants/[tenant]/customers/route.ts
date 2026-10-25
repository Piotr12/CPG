import { apiActor, assertAdmin, parseInput, tenantScope } from "@cpg/core";
import { namedRecordApiQuerySchema } from "@cpg/core/validators/named-records/named-record-list.schema";
import { namedRecordCreateSchema } from "@cpg/core/validators/named-records/named-record-create.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/customers">;

/**
 * The tenant's customers by ID, inactive ones included, or by the optional `sort`/`dir`, narrowed by the
 * optional search `q`, as the customers screen lists them (#221). Any signed-in account.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const query = parseInput(namedRecordApiQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  const { cradle } = await tenantScope((await params).tenant);
  return cradle.customerService.list(query);
});

/**
 * Creates a customer with the tenant's next customer ID, as the Create customer form does (R07).
 * Admin only, checked before the key and the body (API-010).
 */
export const POST = tenantApiWrite(
  async ({ caller, body, cradle }: WriteContext<Context>) =>
    cradle.customerService.create(parseInput(namedRecordCreateSchema, body), apiActor(caller)),
  { authorize: assertAdmin },
);
