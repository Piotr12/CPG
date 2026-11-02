import { Bom, BomComponent, BomRevision, type EntityManager } from "@cpg/db";
import type { MrpBom, MrpComponentLine, MrpPlanningParameters } from "../../../domain/mrp/mrp-inputs";
import { compareCodes } from "../../../domain/mrp/projection/pairs";
import { yieldToEventLoop } from "../../../http/yield-to-event-loop";
import { isCalendarDate } from "../../../validators/dates/calendar-date.schema";
import type { SnapshotCodes } from "./codes";
import { readRow, type UnreadableRows } from "./readable";

/** How many BOMs one chunk takes: one read of their current revisions' lines, then a yield. */
export const BOM_CHUNK = 100;

/**
 * How many `(bom, number)` terms one revision read takes: the most SQLite still seeks one by one through
 * the `(bom, number)` unique index, a `MULTI-INDEX OR`. Without ANALYZE statistics, from three on it walks
 * the tenant's revisions through `bom_revision_tenant_code_index` and tests every term per row, so chunks
 * of 100 cost BOMs × revisions: 2.7 s at 10,000 BOMs of three revisions, against 0.6 s two at a time (#321).
 */
export const REVISION_TERMS = 2;

/**
 * The current revision of every active BOM, by output (E16-S03, E17-S01): its validity for MRP's Missing
 * BOM check, which reads it through `isRevisionValidOn`, the production dialog's own rule, and its lines
 * for the explosion. An inactive BOM, and any revision but the current one, can never be made with, so
 * neither is read. Per chunk of BOMs, the current revisions are sought `REVISION_TERMS` at a time by
 * `(bom, number)`, then their lines are read through `bom_component_revision_id_index`, each step followed
 * by a yield.
 *
 * A revision whose validity dates aren't real days, or with a line that can't be read, is left out, so it
 * covers no date and a Make pair relying on it raises Missing BOM, never a proposal against a broken
 * window or a guessed recipe (#316 review, #281 spec Q8). An unreadable line is also reported at its
 * component, at every location where the output has a Make set (`parameters`), the pairs it would feed.
 * `inactiveComponents` lists the lines' inactive materials, which make the revision unusable (E17-S02).
 */
export async function readBoms(
  em: EntityManager,
  codes: SnapshotCodes,
  parameters: readonly MrpPlanningParameters[],
  unreadable: UnreadableRows,
): Promise<MrpBom[]> {
  const boms = await em.find(Bom, { active: true }, { fields: ["code", "output", "revision"], disableIdentityMap: true });
  const bomOf = new Map(boms.map((bom) => [bom.id, bom]));
  const read: MrpBom[] = [];
  for (let start = 0; start < boms.length; start += BOM_CHUNK) {
    const revisions = await readCurrentRevisions(em, boms.slice(start, start + BOM_CHUNK));
    await yieldToEventLoop();
    const found = await em.find(
      BomComponent,
      { revision: { $in: revisions.map(({ id }) => id) } },
      { fields: ["revision", "position", "material", "quantity", "numerator", "denominator"], disableIdentityMap: true },
    );
    const lines = new Map(revisions.map(({ id }) => [id, [] as typeof found]));
    for (const line of found) lines.get(line.revision.id)!.push(line);
    await yieldToEventLoop();
    for (const revision of revisions) {
      const bom = bomOf.get(revision.bom.id)!;
      const output = codes.materials.get(bom.output.id)!;
      const components: MrpComponentLine[] = [];
      let readable = true;
      for (const line of lines.get(revision.id)!.sort((a, b) => a.position - b.position)) {
        const material = codes.materials.get(line.material.id)!;
        const row = readRow({ quantities: { perOutput: line.quantity }, factor: line });
        if (row) {
          components.push({ material, perOutput: row.perOutput });
          continue;
        }
        readable = false;
        for (const set of parameters) {
          if (set.material === output && set.procurement === "make") {
            unreadable.push({ material, location: set.location, record: "bom-line", document: `${bom.code}/${revision.number}/${line.position}` });
          }
        }
      }
      const { validFrom } = revision;
      const validThrough = revision.validThrough ?? null;
      if (!readable || !isCalendarDate(validFrom) || (validThrough !== null && !isCalendarDate(validThrough))) continue;
      const inactiveComponents = lines
        .get(revision.id)!
        .filter((line) => codes.inactiveMaterials.has(line.material.id))
        .map((line) => codes.materials.get(line.material.id)!)
        .sort(compareCodes);
      read.push({ bom: bom.code, revision: revision.number, priority: revision.priority, output, validFrom, validThrough, inactiveComponents, components });
    }
  }
  return read;
}

/** The current revision of each of `boms`, `REVISION_TERMS` BOMs per read. */
async function readCurrentRevisions(em: EntityManager, boms: readonly { id: string; revision: number }[]) {
  const revisions = [];
  for (let start = 0; start < boms.length; start += REVISION_TERMS) {
    const terms = boms.slice(start, start + REVISION_TERMS).map(({ id, revision }) => ({ bom: id, number: revision }));
    revisions.push(...(await em.find(BomRevision, { $or: terms }, { fields: ["bom", "number", "priority", "validFrom", "validThrough"], disableIdentityMap: true })));
  }
  return revisions;
}
