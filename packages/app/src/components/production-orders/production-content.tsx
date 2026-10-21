import type { Cradle, Locale } from "@cpg/core";
import { PRODUCTION_PAGE_SIZE } from "@cpg/core/validators/production-orders/production-order.schema";
import type { Messages } from "../../i18n/messages/en";
import { orNotFound } from "../../routing/or-not-found";
import { ProductionScreen } from "./production-screen";

export async function ProductionContent({ cradle, locale, messages, id, page = 1, completionsPage = 1 }: { cradle: Cradle; locale: Locale; messages: Messages; id?: string; page?: number; completionsPage?: number }) {
  const order = id === undefined ? undefined : await orNotFound(cradle.productionOrderService.get(id), ["PRODUCTION_ORDER_NOT_FOUND"]);
  const total = id === undefined ? await cradle.productionOrderService.count() : 0;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / PRODUCTION_PAGE_SIZE)));
  const completions = id === undefined ? [] : await cradle.productionCompletionService.list(id, completionsPage);
  const units = id === undefined ? {} : await cradle.materialService.listUnits();
  return <ProductionScreen tenant={cradle.tenant} order={order} orders={id === undefined ? await cradle.productionOrderService.list(currentPage) : []}
    total={total} page={currentPage} materials={await cradle.materialService.list()} locations={await cradle.locationService.list()} messages={messages} locale={locale}
    completions={completions} completionsPage={completionsPage} units={units} />;
}
