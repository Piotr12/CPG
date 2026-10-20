"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductionOrderDetail, ProductionOptions, MaterialSummary, NamedRecordView } from "@cpg/core";
import { productionOrderOptionsSchema } from "@cpg/core/validators/production-orders/production-order.schema";
import { apiCall } from "@cpg/ui/backend/api/api-call";
import { CrudForm, type CrudField } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { createProductionOrder, updateProductionOrder } from "../../app/admin/[tenant]/production-orders/actions";
import { errorFormatter, fill, TALL_DIALOG, type TenantContext } from "../forms/form-labels";
import { productionFieldError, type ProductionLabels } from "./labels";
import { ProductionRequirements } from "./production-requirements";

interface Props { context: TenantContext; labels: ProductionLabels; materials: MaterialSummary[]; locations: NamedRecordView[]; order?: ProductionOrderDetail }
/** Capture the opening order/version; an RSC conflict refresh never upgrades a stale form's version. */
export function ProductionDialog({ context, labels: t, materials, locations, order }: Props) {
  const [open, setOpen] = useState(false);
  const [openedOrder, setOpenedOrder] = useState(order);
  return <Dialog open={open} onOpenChange={(value) => { if (value) setOpenedOrder(order); setOpen(value); }}>
    <DialogTrigger asChild><Button>{order ? t.edit : t.create}</Button></DialogTrigger>
    <DialogContent className={`sm:max-w-2xl ${TALL_DIALOG}`}>
      <DialogHeader><DialogTitle>{order ? t.edit : t.create}</DialogTitle><DialogDescription>{t.intro}</DialogDescription></DialogHeader>
      <ProductionForm context={context} labels={t} materials={materials} locations={locations} order={openedOrder} close={() => setOpen(false)} />
    </DialogContent>
  </Dialog>;
}
function ProductionForm({ context, labels: t, materials, locations, order, close }: Props & { close: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ values: Record<string, string>; options: ProductionOptions } | null>(null);
  const fields: CrudField[] = [
    ...(!order ? [
      { name: "output", label: t.output, type: "select" as const, placeholder: t.choose, options: materials.filter((m) => m.active && m.type !== "raw").map((m) => ({ value: m.id, label: `${m.id} ${m.description} (${m.baseUnit})` })) },
      { name: "location", label: t.location, type: "select" as const, placeholder: t.choose, options: locations.filter((l) => l.active).map((l) => ({ value: l.id, label: `${l.id} ${l.name}` })) },
    ] : []),
    { name: "quantity", label: t.quantity },
    { name: "unit", label: t.unit, description: t.unitHint },
    { name: "plannedFinish", label: t.finish, type: "date", ...(order && { description: fill(t.finishHint, { days: String(order.leadTimeDays) }) }) },
  ];
  const formatting = { formatError: errorFormatter(t), formatFieldError: productionFieldError(t), pendingLabel: t.pending, cancelLabel: t.cancel };
  if (preview) return <div className="flex flex-col gap-4">
    <p className="text-sm">{fill(t.previewDates, { start: preview.options.plannedStart, days: String(preview.options.leadTimeDays) })}</p>
    <p className="text-sm text-muted-foreground">{t.previewNotice}</p>
    {preview.options.alternatives.map((recipe) => <section key={recipe.bom} className="flex flex-col gap-2">
      <h3 className="font-medium">{fill(t.recipeLabel, { bom: recipe.bom, revision: String(recipe.revision), priority: String(recipe.priority) })}</h3>
      <ProductionRequirements components={recipe.components} labels={t} materials={materials} tenant={context.tenant} />
    </section>)}
    <CrudForm fields={[{ name: "bom", label: t.recipe, type: "select", options: preview.options.alternatives.map((recipe) => ({ value: recipe.bom,
      label: fill(t.recipeLabel, { bom: recipe.bom, revision: String(recipe.revision), priority: String(recipe.priority) }) })) }]}
      initialValues={{ bom: preview.options.selected.bom }} {...formatting} submitLabel={t.create}
      action={(values) => {
        const chosen = preview.options.alternatives.find(({ bom }) => bom === values.bom)!;
        return createProductionOrder(context.tenant, context.generation, { ...preview.values, bom: chosen.bom, revision: chosen.revision });
      }} onSuccess={(created) => { close(); router.push(`/admin/${context.tenant}/production-orders/${created.id}`); }} onCancel={() => setPreview(null)} cancelLabel={t.back} />
  </div>;
  return <CrudForm<ProductionOrderDetail | ProductionOptions> fields={fields} schema={order ? undefined : productionOrderOptionsSchema}
    initialValues={order ? { quantity: order.enteredQuantity, unit: order.enteredUnit, plannedFinish: order.plannedFinish } : draft}
    {...formatting} submitLabel={order ? t.save : t.preview}
    action={async (values) => {
      if (order) return updateProductionOrder(context.tenant, context.generation, order.id, order.version, values);
      const result = await apiCall<ProductionOptions>(`/api/tenants/${context.tenant}/production-orders/options?${new URLSearchParams(values)}`);
      if (result.ok) { setDraft(values); setPreview({ values, options: result.data }); }
      return result;
    }} onSuccess={() => { if (order) close(); }} onCancel={close} />;
}
