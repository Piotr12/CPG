import { parseDecimal } from "../quantities/decimal";
import { pairKey, toBase } from "./supply-plan";
import { byId, type TestTenantConfig } from "./test-tenant-config.schema";
import type { Unstamped } from "./timeline";

/** One stock movement a timeline event posts: a signed base-unit quantity of a material at a location. */
export interface Movement {
  material: string;
  location: string;
  quantity: bigint;
}

/**
 * The stock a timeline posts, followed event by event the way the ledger will see it: openings,
 * receipts and completed output add, consumed components and goods issues take away. It remembers
 * the documents the timeline creates, so a posting finds its location and materials through the
 * document it names, as the services do. Entered quantities are converted to base units through the
 * catalogue's conversions.
 */
export class Ledger {
  private readonly balances = new Map<string, bigint>();
  private readonly customerOrders = new Map<string, Extract<Unstamped, { kind: "customerOrder" }>>();
  private readonly shipments = new Map<string, Extract<Unstamped, { kind: "shipment" }>>();
  private readonly purchaseOrders = new Map<string, Extract<Unstamped, { kind: "purchaseOrder" }>>();
  private readonly productionOrders = new Map<string, Extract<Unstamped, { kind: "productionOrder" }>>();

  constructor(private readonly config: TestTenantConfig) {}

  /** A pair's balance so far, in base micro-units. */
  balance(material: string, location: string): bigint {
    return this.balances.get(pairKey(material, location)) ?? 0n;
  }

  /** Records `event` and returns the movements it posts, zero quantities left out, after applying them. */
  apply(event: Unstamped): Movement[] {
    const movements = this.movementsOf(event).filter(({ quantity }) => quantity !== 0n);
    for (const { material, location, quantity } of movements) this.balances.set(pairKey(material, location), this.balance(material, location) + quantity);
    return movements;
  }

  private movementsOf(event: Unstamped): Movement[] {
    switch (event.kind) {
      case "opening":
        return event.lines.map((line) => this.move(line.material, event.location, line.quantity, line.unit, 1n));
      case "customerOrder":
        this.customerOrders.set(event.key, event);
        return [];
      case "shipment":
        this.shipments.set(event.key, event);
        return [];
      case "purchaseOrder":
        this.purchaseOrders.set(event.key, event);
        return [];
      case "productionOrder":
        this.productionOrders.set(event.key, event);
        return [];
      case "goodsIssue": {
        const shipment = this.shipments.get(event.shipment)!;
        const order = this.customerOrders.get(shipment.order)!;
        return event.lines.map((line) => {
          const material = order.lines[shipment.lines[line.line - 1].orderLine].material;
          return this.move(material, order.location, line.quantity, line.unit, -1n);
        });
      }
      case "goodsReceipt": {
        const order = this.purchaseOrders.get(event.order)!;
        return event.lines.map((line) => this.move(order.lines[line.line - 1].material, order.location, line.quantity, line.unit, 1n));
      }
      case "completion": {
        const order = this.productionOrders.get(event.order)!;
        return [
          this.move(order.output, order.location, event.quantity, event.unit, 1n),
          ...event.components.map((line) => this.move(line.material, order.location, line.quantity, line.unit, -1n)),
        ];
      }
      case "requisition":
        return [];
    }
  }

  private move(material: string, location: string, quantity: string, unit: string, sign: bigint): Movement {
    return { material, location, quantity: sign * toBase(byId(this.config.catalogue.materials, material)!, parseDecimal(quantity)!, unit) };
  }
}
