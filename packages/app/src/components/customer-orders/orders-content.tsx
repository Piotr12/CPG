import { ORDER_PAGE_SIZE } from "@cpg/core/validators/customer-orders/customer-order.schema";
import type { Cradle, Locale } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";
import { orNotFound } from "../../routing/or-not-found";
import { OrdersScreen } from "./order-screen";

/** Request-time reads only through the tenant's services, shared by the list and detail shells. */
export async function OrdersContent({ cradle, locale, messages, id, page = 1 }: { cradle: Cradle; locale: Locale; messages: Messages; id?: string; page?: number }) {
  const order = id === undefined ? undefined : await orNotFound(cradle.customerOrderService.get(id), ["CUSTOMER_ORDER_NOT_FOUND"]);
  const total = id === undefined ? await cradle.customerOrderService.count() : 0;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE)));
  return <OrdersScreen page={currentPage} total={total} tenant={cradle.tenant} order={order} orders={id === undefined ? await cradle.customerOrderService.list(currentPage) : []}
    materials={await cradle.materialService.list()} units={await cradle.materialService.listUnits()}
    customers={await cradle.customerService.list()} locations={await cradle.locationService.list()} locale={locale} messages={messages} />;
}
