import type { Locale, MaterialSummary, NamedRecordView, RequisitionView } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";
import { activeOptions, materialChoices } from "./choices";
import { CreateRequisitionDialog } from "./create-requisition-dialog";
import { byId, requisitionsLabels } from "./labels";
import { RequisitionsTable } from "./requisitions-table";

interface RequisitionsScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  requisitions: RequisitionView[];
  /** The tenant's materials and locations, for the rows' details and the form's choices, and each material's units. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  units: Record<string, string[]>;
  locale: Locale;
  messages: Messages;
}

/**
 * The body of the Purchase requisitions page (E09-S01): heading, intro, Create requisition and the
 * list. Any signed-in account may create, but not while the tenant is read-only (R05).
 */
export function RequisitionsScreen({ tenant, requisitions, materials, locations, units, locale, messages }: RequisitionsScreenProps) {
  const labels = requisitionsLabels(messages);
  const editable = !tenant.readOnly;

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.purchaseRequisitions.heading(tenant.name)}</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{labels.intro}</p>
        {editable && (
          <CreateRequisitionDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            materials={materialChoices(materials, units)}
            locations={activeOptions(locations)}
          />
        )}
      </div>
      <RequisitionsTable
        tenant={tenant}
        requisitions={requisitions}
        materials={byId(materials)}
        locations={byId(locations)}
        labels={labels}
        editable={editable}
      />
    </div>
  );
}
