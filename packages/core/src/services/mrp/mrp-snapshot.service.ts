import type { EntityManager } from "@cpg/db";
import { addDays } from "../../domain/demand/demand-buckets";
import type { MrpInputs } from "../../domain/mrp/mrp-inputs";
import { MRP_HORIZON_DAYS } from "../../domain/mrp/projection/horizon";
import { yieldToEventLoop } from "../../http/yield-to-event-loop";
import { readCodes } from "./snapshot/codes";
import { readOrderLines } from "./snapshot/order-lines";
import { readProductionOrders } from "./snapshot/production-orders";
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

  /** The inputs for a run planning `today` (ISO day) and the 89 days after it. */
  async load(today: string): Promise<MrpInputs> {
    const codes = await readCodes(this.em);
    const stock = await readStock(this.em, codes);
    await yieldToEventLoop();
    const before = addDays(today, MRP_HORIZON_DAYS);
    const orderLines = await readOrderLines(this.em, codes, before);
    const productionOrders = await readProductionOrders(this.em, codes, before);
    return { stock, orderLines, productionOrders, transfers: [] };
  }
}
