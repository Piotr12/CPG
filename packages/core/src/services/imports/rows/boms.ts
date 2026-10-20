import type { PreparedBom } from "../../../domain/imports/prepare-import";
import { recipeDiff, type DiffLine } from "../../../domain/imports/recipe-diff";
import { columnHeader } from "../../../domain/imports/workbook-layout";
import { BOM_OUTPUT_IMMUTABLE_MESSAGE } from "../../../validators/boms/bom-fields.schema";
import type { BomComponentView, BomView, ComponentLine } from "../../boms/bom.service";
import type { MaterialSummary } from "../../materials/material.service";
import {
  changesBetween,
  existing,
  issueOf,
  noteVersion,
  referenced,
  RowIssueError,
  RowIssuesError,
  runRow,
  type ApplyContext,
  type ImportChange,
} from "../apply-context";

const HEADER_FIELDS = [
  ["revision", "Revision"],
  ["priority", "Priority"],
  ["validFrom", "Valid from"],
  ["validThrough", "Valid through"],
  ["active", "Active"],
] as const;

const LINE_COLUMNS: Record<string, string> = { material: "Component material ID", quantity: "Quantity", unit: "Unit" };
const LINE_FIELD = /^components\.(\d+)\.(\w+)$/;

/**
 * The BOM sheets (spec `2026-10-20--0908UTC-master-data-bom-import`, Q8): a header with a blank ID
 * creates a BOM, a known one saves its complete recipe through `BomService.update`, which adds a
 * revision only for a real change (XLS-020…022) and toggles Active on its own (XLS-028). Every line
 * naming a missing material is reported, on its own row (XLS-008, XLS-009).
 */
export async function importBoms(context: ApplyContext, boms: PreparedBom[]): Promise<void> {
  for (const bom of boms) {
    await runRow(context, "bomHeaders", bom.row, () => importBom(context, bom), {
      field: (field) => {
        const line = LINE_FIELD.exec(field);
        if (line) return { sheet: "BOM lines", row: bom.lines[Number(line[1])].row, column: LINE_COLUMNS[line[2]] };
        return { sheet: "BOM headers", row: bom.row, column: columnHeader("bomHeaders", field) };
      },
      codes: { BOM_PRIORITY_CONFLICT: "Priority" },
    });
  }
}

async function importBom(context: ApplyContext, bom: PreparedBom) {
  const { bomService } = context.services;
  const { id, reference, output, active, ...header } = bom.values;
  const materials = new Map<string, MaterialSummary>();
  const components = await componentsOf(context, bom, materials);
  if (id === null) {
    const product = await referenced(context, () => loadMaterial(context, output!, materials), "MATERIAL_NOT_FOUND", "material", output!, "Output material ID");
    noteVersion(context, "Material", output!, product.version);
    const created = await bomService.create({ output: output!, ...header, components }, context.actor);
    const changes: ImportChange[] = [
      { field: "Output material ID", before: null, after: output },
      ...HEADER_FIELDS.slice(1, 4).map(([field, column]) => ({ field: column, before: null, after: created[field] })),
      ...(await lineChanges(context, materials, [], created.components)),
    ];
    return { sheet: "BOM headers", row: bom.row, action: "create" as const, record: created.id, reference: reference!, label: label(created, product), changes };
  }
  const before = await existing(context, () => bomService.get(id), "BOM_NOT_FOUND", "BOM", id, "BOM ID");
  noteVersion(context, "Bom", id, before.version);
  if (output !== null && output !== before.output) throw new RowIssueError("VALIDATION_FAILED", BOM_OUTPUT_IMMUTABLE_MESSAGE, "Output material ID");
  const after = await bomService.update(id, active === null ? { ...header, components } : { ...header, components, active }, before.version, context.actor);
  const changes = [
    ...changesBetween(before, after, HEADER_FIELDS),
    ...(await lineChanges(context, materials, before.components, after.components)),
  ];
  const action = after.version === before.version ? ("unchanged" as const) : ("update" as const);
  const product = await loadMaterial(context, after.output, materials);
  const result = { sheet: "BOM headers", row: bom.row, action, record: id, label: label(after, product), changes };
  return reference === null ? result : { ...result, reference };
}

/** The header's lines as the service takes them, each component loaded (a blank unit is its base unit). */
async function componentsOf(context: ApplyContext, bom: PreparedBom, materials: Map<string, MaterialSummary>): Promise<ComponentLine[]> {
  const issues = [];
  const components: ComponentLine[] = [];
  for (const { row, values } of bom.lines) {
    try {
      const where = { sheet: "BOM lines", row };
      const material = await referenced(context, () => loadMaterial(context, values.material, materials), "MATERIAL_NOT_FOUND", "material", values.material, "Component material ID", where);
      noteVersion(context, "Material", values.material, material.version);
      components.push({ material: values.material, quantity: values.quantity, unit: values.unit ?? material.baseUnit });
    } catch (error) {
      if (!(error instanceof RowIssueError)) throw error;
      issues.push(issueOf(error, "BOM lines", row));
    }
  }
  if (issues.length > 0) throw new RowIssuesError(issues);
  return components;
}

async function loadMaterial(context: ApplyContext, id: string, materials: Map<string, MaterialSummary>): Promise<MaterialSummary> {
  const known = materials.get(id);
  if (known) return known;
  const material = await context.services.materialService.get(id);
  materials.set(id, material);
  return material;
}

/** Each component the save adds, removes or changes, as `Component 00000002`, in its base unit (XLS-021, XLS-025). */
async function lineChanges(
  context: ApplyContext,
  materials: Map<string, MaterialSummary>,
  before: readonly BomComponentView[],
  after: readonly BomComponentView[],
): Promise<ImportChange[]> {
  const asLines = async (lines: readonly BomComponentView[]): Promise<DiffLine[]> => {
    const result: DiffLine[] = [];
    for (const { material, quantity } of lines) result.push({ material, quantity, unit: (await loadMaterial(context, material, materials)).baseUnit });
    return result;
  };
  return recipeDiff(await asLines(before), await asLines(after)).map(({ material, before: was, after: is }) => ({
    field: `Component ${material}`,
    before: was,
    after: is,
  }));
}

const label = ({ id }: BomView, output: MaterialSummary) => `${id} — ${output.id} ${output.description}`;
