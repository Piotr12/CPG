import type { Locale, MaterialSummary, NamedRecordView, OrderView, RequisitionView } from "@cpg/core";
import { PageHeader } from "@cpg/ui/backend/page-header";
import type { Messages } from "../../i18n/messages/en";
import { activeOptions, materialChoices } from "../purchase-requisitions/choices";
import { requisitionChoices } from "./choices";
import { CreateOrderDialog } from "./create-order-dialog";
import { byId, ordersLabels } from "./labels";
import { OrdersTable } from "./orders-table";

interface OrdersScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  orders: OrderView[];
  /** The 1-based page of `orders` and how many pages the tenant's orders make. */
  page: number;
  pages: number;
  /** The form's choices: suppliers, locations, materials with their units, and the requisitions a line may convert. */
  suppliers: NamedRecordView[];
  locations: NamedRecordView[];
  materials: MaterialSummary[];
  units: Record<string, string[]>;
  requisitions: RequisitionView[];
  locale: Locale;
  messages: Messages;
}

/**
 * The body of the Purchase orders page (E09-S01): heading, intro, Create purchase order and the
 * list. Any signed-in account may create, but not while the tenant is read-only (R05).
 */
export function OrdersScreen({ tenant, orders, page, pages, suppliers, locations, materials, units, requisitions, locale, messages }: OrdersScreenProps) {
  const labels = ordersLabels(messages);
  const editable = !tenant.readOnly;

  return (
    <div lang={locale}>
      <PageHeader
        title={messages.purchaseOrders.heading(tenant.name)}
        description={labels.intro}
        actions={editable && (
          <CreateOrderDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            suppliers={activeOptions(suppliers)}
            locations={activeOptions(locations)}
            materials={materialChoices(materials, units)}
            requisitions={requisitionChoices(requisitions, byId(materials), labels)}
          />
        )}
      />
      <OrdersTable tenant={tenant} orders={orders} page={page} pages={pages} suppliers={byId(suppliers)} locations={byId(locations)} labels={labels} editable={editable} />
    </div>
  );
}
