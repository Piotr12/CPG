import type { Cradle, Locale } from "@cpg/core";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import { PRODUCTION_PAGE_SIZE } from "@cpg/core/validators/production-orders/production-order.schema";
import type { ProductionOrderSort } from "@cpg/core/validators/production-orders/production-order-list.schema";
import type { Messages } from "../../i18n/messages/en";
import type { ListSearchState } from "../lists/list-params";
import { orNotFound } from "../../routing/or-not-found";
import { ProductionScreen } from "./production-screen";

interface Props {
  cradle: Cradle; locale: Locale; messages: Messages; id?: string; page?: number; completionsPage?: number;
  /** The list's search and sort (#217); the list without either when left out. */
  search?: ListSearchState; sort?: { sort: ProductionOrderSort; dir: SortDirection };
}
export async function ProductionContent({ cradle, locale, messages, id, page = 1, completionsPage = 1, search = { q: "", typed: "" }, sort }: Props) {
  const order = id === undefined ? undefined : await orNotFound(cradle.productionOrderService.get(id), ["PRODUCTION_ORDER_NOT_FOUND"]);
  const total = id === undefined ? await cradle.productionOrderService.count({ q: search.q }) : 0;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / PRODUCTION_PAGE_SIZE)));
  const completions = id === undefined ? [] : await cradle.productionCompletionService.list(id, completionsPage);
  // The detail page's completion lines and both pages' production forms (Planned quantity's tooltip names the units, #290).
  const units = await cradle.materialService.listUnits();
  return <ProductionScreen tenant={cradle.tenant} order={order} orders={id === undefined ? await cradle.productionOrderService.list({ page: currentPage, q: search.q, ...sort }) : []}
    search={search} sort={sort}
    total={total} page={currentPage} materials={await cradle.materialService.list()} locations={await cradle.locationService.list()} messages={messages} locale={locale}
    completions={completions} completionsPage={completionsPage} units={units} />;
}
