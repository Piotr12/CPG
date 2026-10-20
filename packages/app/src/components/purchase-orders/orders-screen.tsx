import type { Locale, MaterialSummary, NamedRecordView, OrderView, RequisitionView } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";
import { activeOptions, materialChoices } from "../purchase-requisitions/choices";
import { requisitionChoices } from "./choices";
import { CreateOrderDialog } from "./create-order-dialog";
import { byId, ordersLabels } from "./labels";
import { OrdersTable } from "./orders-table";

interface OrdersScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  orders: OrderView[];
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
export function OrdersScreen({ tenant, orders, suppliers, locations, materials, units, requisitions, locale, messages }: OrdersScreenProps) {
  const labels = ordersLabels(messages);
  const editable = !tenant.readOnly;

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.purchaseOrders.heading(tenant.name)}</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{labels.intro}</p>
        {editable && (
          <CreateOrderDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            suppliers={activeOptions(suppliers)}
            locations={activeOptions(locations)}
            materials={materialChoices(materials, units)}
            requisitions={requisitionChoices(requisitions, byId(materials), labels)}
          />
        )}
      </div>
      <OrdersTable tenant={tenant} orders={orders} suppliers={byId(suppliers)} locations={byId(locations)} labels={labels} editable={editable} />
    </div>
  );
}
