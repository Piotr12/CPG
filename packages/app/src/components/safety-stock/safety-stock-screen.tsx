import { targetStatus, type Locale, type MaterialSummary, type NamedRecordView, type SafetyStockTargetView } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";
import { fill } from "../forms/form-labels";
import { locationOptions, materialOptions, withReferences } from "../planning-parameters/references";
import { AddSafetyStockTargetDialog } from "./add-safety-stock-target-dialog";
import { safetyStockLabels } from "./labels";
import { SafetyStockTable, type SafetyStockRow } from "./safety-stock-table";

interface SafetyStockScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  targets: SafetyStockTargetView[];
  /** The tenant's full lists, for the rows' details and the add form's choices. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  /** The day the status column is about, as `YYYY-MM-DD` (spec Q10: the server's UTC date). */
  today: string;
  locale: Locale;
  messages: Messages;
  /** Only the admin gets Add and the row menus (TEN-004), and only while the tenant isn't read-only (R05). */
  admin: boolean;
}

/** The body of the safety stock page (E03-S03): heading, intro, the admin's Add target, and the list. */
export function SafetyStockScreen({ tenant, targets, materials, locations, today, locale, messages, admin }: SafetyStockScreenProps) {
  const labels = safetyStockLabels(messages);
  const editable = admin && !tenant.readOnly;
  const rows: SafetyStockRow[] = withReferences(targets, materials, locations).map((target) => {
    const series = targets.filter(({ material, location }) => material === target.material && location === target.location);
    return { ...target, status: targetStatus(series, target, today) };
  });

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.safetyStock.heading(tenant.name)}</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{fill(labels.intro, { today })}</p>
        {editable && (
          <AddSafetyStockTargetDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            materials={materialOptions(materials)}
            locations={locationOptions(locations)}
          />
        )}
      </div>
      <SafetyStockTable tenant={tenant} rows={rows} labels={labels} editable={editable} />
    </div>
  );
}
