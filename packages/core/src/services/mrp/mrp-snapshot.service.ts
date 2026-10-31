import type { EntityManager } from "@cpg/db";
import { addDays, addMonths, monthStart } from "../../domain/demand/demand-buckets";
import type { MrpInputs } from "../../domain/mrp/mrp-inputs";
import { MRP_HORIZON_DAYS } from "../../domain/mrp/projection/horizon";
import { yieldToEventLoop } from "../../http/yield-to-event-loop";
import { readCodes } from "./snapshot/codes";
import { readForecasts } from "./snapshot/forecasts";
import { readConsumingLines, readOrderLines } from "./snapshot/order-lines";
import { readPurchaseOrderLines, readRequisitions } from "./snapshot/purchasing";
import { readSafetyTargets } from "./snapshot/safety-targets";
import { readStock } from "./snapshot/stock";

/**
 * Builds the snapshot `planMrp` plans from (#273), for every location of the scope's tenant, in a
 * bounded number of partial reads that yield between them. One seam per input under `snapshot/`, as
 * the engine has one per figure: a later story adds its read there and one line in `load`.
 */
export class MrpSnapshotService {
  private readonly em: EntityManager;

  constructor({ em }: { em: EntityManager }) {
    this.em = em;
  }

  /**
   * The inputs for a run planning `today` (ISO day) and the 89 days after it. Forecasts count from today's
   * month (earlier ones expired, D08) to the horizon's last day, and the lines that consume them are read
   * to the end of that day's month, so a forecast late in the horizon sees its whole month (#275).
   */
  async load(today: string): Promise<MrpInputs> {
    const last = addDays(today, MRP_HORIZON_DAYS - 1);
    const from = monthStart(today);
    const before = addMonths(last, 1);
    const codes = await readCodes(this.em);
    const stock = await readStock(this.em, codes);
    const safetyTargets = await readSafetyTargets(this.em, codes, last);
    await yieldToEventLoop();
    const orderLines = [...(await readOrderLines(this.em, codes, before)), ...(await readConsumingLines(this.em, codes, from, before))];
    const forecasts = await readForecasts(this.em, codes, from, last);
    const requisitions = await readRequisitions(this.em, codes);
    const purchaseOrderLines = await readPurchaseOrderLines(this.em, codes);
    return { stock, orderLines, forecasts, safetyTargets, requisitions, purchaseOrderLines };
  }
}
