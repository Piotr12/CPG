import { apiActor, parseInput, tenantScope } from "@cpg/core";
import { transferCreateSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { transferApiQuerySchema } from "@cpg/core/validators/transfers/transfer-list.schema";
import { tenantApiWrite, type WriteContext } from "../../../../../auth/api-write";
import { requireApiUser } from "../../../../../auth/require-api-user";
import { apiHandler } from "../../../../../routing/api-handler";

type Context = RouteContext<"/api/tenants/[tenant]/transfers">;

/**
 * One page of the tenant's transfers by ID (`?page=N`, 100 each), or by the optional `sort`/`dir`, narrowed
 * by the optional search `q`, as the Transfers screen lists them (#221). Any signed-in account.
 */
export const GET = apiHandler(async (request: Request, { params }: Context) => {
  await requireApiUser(request);
  const { cradle } = await tenantScope((await params).tenant);
  const query = parseInput(transferApiQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
  return cradle.transferService.list(query);
});

/**
 * Creates an Open single-material transfer between two different locations, with the tenant's next
 * ID (R07, TRF-001, TRF-002, TRF-026). It changes no stock (TRF-003). Any account with a token may.
 */
export const POST = tenantApiWrite(async ({ caller, body, cradle }: WriteContext<Context>) =>
  cradle.transferService.create(parseInput(transferCreateSchema, body), apiActor(caller)),
);
