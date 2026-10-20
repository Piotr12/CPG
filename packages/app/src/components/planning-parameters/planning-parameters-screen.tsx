import type { Locale, MaterialSummary, NamedRecordView, PlanningParameterView } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";
import { AddPlanningParametersDialog } from "./add-planning-parameters-dialog";
import { planningParametersLabels } from "./labels";
import { PlanningParametersTable } from "./planning-parameters-table";
import { locationOptions, materialOptions, withReferences } from "../master-data/references";

interface PlanningParametersScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  sets: PlanningParameterView[];
  /** The tenant's full lists, for the rows' details and the add form's choices. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  locale: Locale;
  messages: Messages;
  /** Only the admin gets Add and the row menus (TEN-004), and only while the tenant isn't read-only (R05). */
  admin: boolean;
}

/** The body of the planning parameters page (E03-S03): heading, intro, the admin's Add, and the list. */
export function PlanningParametersScreen({ tenant, sets, materials, locations, locale, messages, admin }: PlanningParametersScreenProps) {
  const labels = planningParametersLabels(messages);
  const editable = admin && !tenant.readOnly;

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.planningParameters.heading(tenant.name)}</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{labels.intro}</p>
        {editable && (
          <AddPlanningParametersDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            materials={materialOptions(materials)}
            locations={locationOptions(locations)}
          />
        )}
      </div>
      <PlanningParametersTable tenant={tenant} rows={withReferences(sets, materials, locations)} labels={labels} editable={editable} />
    </div>
  );
}
