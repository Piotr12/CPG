import { describe, expect, it } from "vitest";
import { orderCreateSchema } from "../../validators/purchasing/purchase-order.schema";
import { requisitionCreateSchema } from "../../validators/purchasing/purchase-requisition.schema";
import { formatSequentialId } from "../business-ids/sequential-id";
import { DEMO_ORDERS, DEMO_REQUISITIONS } from "./demo-purchasing";

describe("demo purchasing documents", () => {
  it("are valid requisitions, as a person could have entered them", () => {
    for (const demo of DEMO_REQUISITIONS) expect(requisitionCreateSchema.parse(demo)).toEqual(demo);
  });

  it("are valid orders, and every converted requisition is one of the demo requisitions", () => {
    for (const demo of DEMO_ORDERS) {
      const lines = demo.lines.map(({ requisition, ...rest }) => ({ ...rest, requisition: requisition === undefined ? null : formatSequentialId(requisition) }));
      expect(orderCreateSchema.safeParse({ ...demo, lines }).success).toBe(true);
      for (const { requisition } of demo.lines) {
        if (requisition !== undefined) expect(requisition).toBeLessThanOrEqual(DEMO_REQUISITIONS.length);
      }
    }
  });
});
