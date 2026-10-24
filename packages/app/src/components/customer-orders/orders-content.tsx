import { ORDER_PAGE_SIZE } from "@cpg/core/validators/customer-orders/customer-order.schema";
import type { Cradle, Locale } from "@cpg/core";
import type { CustomerOrderSort } from "@cpg/core/validators/customer-orders/customer-order-list.schema";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import type { Messages } from "../../i18n/messages/en";
import type { ListSearchState } from "../lists/list-params";
import { orNotFound } from "../../routing/or-not-found";
import { OrdersScreen } from "./order-screen";

interface Props {
  cradle: Cradle; locale: Locale; messages: Messages; id?: string; page?: number;
  /** The list's search and sort (#217); the list without either when left out. */
  search?: ListSearchState; sort?: { sort: CustomerOrderSort; dir: SortDirection };
}
/** Request-time reads only through the tenant's services, shared by the list and detail shells. */
export async function OrdersContent({ cradle, locale, messages, id, page = 1, search = { q: "", typed: "" }, sort }: Props) {
  const order = id === undefined ? undefined : await orNotFound(cradle.customerOrderService.get(id), ["CUSTOMER_ORDER_NOT_FOUND"]);
  const total = id === undefined ? await cradle.customerOrderService.count({ q: search.q }) : 0;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE)));
  const shipments = id === undefined ? [] : await cradle.shipmentService.list({ customerOrder: id });
  return <OrdersScreen page={currentPage} total={total} tenant={cradle.tenant} order={order} shipments={shipments} orders={id === undefined ? await cradle.customerOrderService.list({ page: currentPage, q: search.q, ...sort }) : []}
    search={search} sort={sort}
    materials={await cradle.materialService.list()} units={await cradle.materialService.listUnits()}
    customers={await cradle.customerService.list()} locations={await cradle.locationService.list()} locale={locale} messages={messages} />;
}
