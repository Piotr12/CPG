import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  initOrm,
  Location,
  Material,
  MaterialConversion,
  OptimisticLockError,
  selectTenant,
  StockMovement,
  StockReversal,
  Tenant,
  TenantAuditEvent,
  Transfer,
  TransferPosting,
  TransferReversal,
  TRANSFER_POSTING_IMMUTABLE,
  UniqueConstraintViolationException,
  type EntityManager,
  type Orm,
  type TenantCode,
} from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { formatDecimal, parseDecimal } from "../../domain/quantities/decimal";
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";
import { UNIT_NOT_CONVERTIBLE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import { CORRECTION_TRANSIT_MESSAGE, stockCorrectionSchema } from "../../validators/stock/stock-correction.schema";
import { TRANSFER_PAGE_SIZE, type TransferCreateInput } from "../../validators/transfers/transfer.schema";
import { parseInput } from "../../http/parse-input";
import type { AuditActor } from "../audit/actor";
import { LocationService } from "../locations/location.service";
import { MaterialService } from "../materials/material.service";
import { StockService } from "../stock/stock.service";
import {
  TRANSFER_DISPATCH_MOVEMENT,
  TRANSFER_ID_RACE,
  TRANSFER_POSTINGS_SHOWN,
  TRANSFER_RECEIPT_MOVEMENT,
  TransferService,
} from "./transfer.service";

/** The audit action whose recording crashes, to fail a posting between its legs; null when none does. */
const crash = vi.hoisted(() => ({ action: null as string | null }));
vi.mock("../audit/audit-recorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audit/audit-recorder")>();
  return {
    ...actual,
    recordTenantAudit: (...args: Parameters<typeof actual.recordTenantAudit>) => {
      if (args[2].action === crash.action) throw new Error(`crash while recording ${crash.action}`);
      actual.recordTenantAudit(...args);
    },
  };
});

const ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: "user-session", channel: "ui", token: null };
const API_ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: null, channel: "api", token: { id: "t", name: "ci" } };

/** 100 kg of steel from the main plant (A) to the warehouse (B), planned yesterday → in two days. */
const TRANSFER: TransferCreateInput = {
  material: "00000001",
  source: "00000001",
  destination: "00000002",
  quantity: "100",
  unit: "kg",
  plannedDispatch: "2026-10-19",
  plannedArrival: "2026-10-22",
};
const A = "00000001";
const B = "00000002";
const kg = (quantity: string) => ({ quantity, unit: "kg" });
const today = () => new Date().toISOString().slice(0, 10);

describe("TransferService", () => {
  let orm: Orm;
  let directory: string;
  const scoped = (tenant: TenantCode = "prod", from: Orm = orm) => {
    const em = from.em.fork();
    selectTenant(em, tenant);
    return em;
  };
  const service = (tenant: TenantCode = "prod") => new TransferService({ em: scoped(tenant) });
  const stock = (location: string, material = "00000001", tenant: TenantCode = "prod") => new StockService({ em: scoped(tenant) }).get({ material, location });
  const physical = async (location: string, tenant: TenantCode = "prod") => (await stock(location, "00000001", tenant)).quantity;
  const correct = (location: string, quantity: string, tenant: TenantCode = "prod") =>
    new StockService({ em: scoped(tenant) }).correct({ material: "00000001", location, quantity, unit: "kg", reason: "Count" }, ACTOR);
  const entries = async (action: string) =>
    (await scoped().find(TenantAuditEvent, { action }, { orderBy: { occurredAt: "asc", id: "asc" } })).map(({ subjectId, subjectLabel, before, after }) => ({
      subjectId,
      subjectLabel,
      before,
      after,
    }));
  /** Creates the standard transfer with `stocked` kg at A. */
  const created = async (stocked = "100", input: TransferCreateInput = TRANSFER) => {
    if (stocked !== "0") await correct(A, stocked);
    return service().create(input, ACTOR);
  };

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), "cpg-transfer-service-"));
    const config = loadConfig({ DATA_DIR: directory });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    for (const tenant of ["prod", "test"] as const) {
      const em = scoped(tenant);
      const steel = em.create(Material, { code: "00000001", type: "raw", description: "Steel sheet", baseUnit: "kg" });
      em.create(MaterialConversion, { material: steel, unit: "t", numerator: "1000", denominator: "1" });
      em.create(Material, { code: "00000002", type: "raw", description: "Bolt M8", baseUnit: "each" });
      em.create(Location, { code: "00000001", name: "Main plant" });
      em.create(Location, { code: "00000002", name: "Warehouse" });
      if (tenant === "prod") em.create(Location, { code: "00000003", name: "Prod-only depot" });
      await em.flush();
    }
  });
  afterEach(async () => {
    crash.action = null;
    vi.restoreAllMocks();
    await orm.close();
  });

  it("cancels before dispatch, audits abandonment and prevents all later writes", async () => {
    const original = await created();
    await expect(service().closeEarly(original.id, original.version, ACTOR)).rejects.toMatchObject({ code: "DOCUMENT_UNPROCESSED" });
    const cancelled = await service().cancel(original.id, original.version, ACTOR);
    expect(cancelled).toMatchObject({ status: "cancelled", abandoned: "100.000000", outstanding: "0.000000", undispatched: "0.000000", version: 2 });
    expect(await physical(A)).toBe("100.000000"); expect(await physical(B)).toBe("0.000000");
    expect(await entries("transfers.transfer.cancelled")).toEqual([expect.objectContaining({
      before: expect.objectContaining({ status: "open", abandoned: "0.000000" }),
      after: expect.objectContaining({ status: "cancelled", abandoned: "100.000000" }),
    })]);
    await expect(service().cancel(original.id, 1, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(service().cancel(original.id, 2, ACTOR)).rejects.toMatchObject({ code: "TRANSFER_NOT_OPEN" });
    await expect(service().dispatch(original.id, kg("1"), ACTOR)).rejects.toMatchObject({ code: "TRANSFER_NOT_OPEN" });
    await expect(service("test").cancel(original.id, 2, ACTOR)).rejects.toMatchObject({ code: "TRANSFER_NOT_FOUND" });
  });

  it("requires settled transit, preserves postings and includes loss plus undispatched quantity in abandonment", async () => {
    const original = await created();
    await service().dispatch(original.id, kg("60"), ACTOR);
    const dispatched = await service().get(original.id);
    await expect(service().cancel(original.id, dispatched.version, ACTOR)).rejects.toMatchObject({ code: "DOCUMENT_PROCESSED" });
    await expect(service().closeEarly(original.id, dispatched.version, ACTOR)).rejects.toMatchObject({ code: "TRANSFER_IN_TRANSIT", messageParams: { quantity: "60.000000", unit: "kg" } });
    await service().receive(original.id, kg("50"), ACTOR);
    await service().writeOff(original.id, { ...kg("10"), reason: "Lost" }, ACTOR);
    const settled = await service().get(original.id);
    const movements = await scoped().count(StockMovement, {});
    const closed = await service().closeEarly(original.id, settled.version, ACTOR);
    expect(closed).toMatchObject({ status: "closed-early", dispatched: "60.000000", received: "50.000000", writtenOff: "10.000000",
      abandoned: "50.000000", outstanding: "0.000000", undispatched: "0.000000", inTransit: "0.000000" });
    expect((await service().get(original.id)).postings).toEqual(settled.postings);
    expect(await scoped().count(StockMovement, {})).toBe(movements);
    expect(await physical(A)).toBe("40.000000"); expect(await physical(B)).toBe("50.000000");
    expect(await entries("transfers.transfer.closed-early")).toHaveLength(1);
    await expect(service().receive(original.id, kg("1"), ACTOR)).rejects.toMatchObject({ code: "TRANSFER_NOT_OPEN" });
  });

  it("refuses Close Early with 60 dispatched, 50 received and 10 in transit, naming the 10, and changes nothing (TRF-012)", async () => {
    const original = await created("100", { ...TRANSFER, quantity: "60" });
    await service().dispatch(original.id, kg("60"), ACTOR);
    await service().receive(original.id, kg("50"), ACTOR);
    const partial = await service().get(original.id);
    expect(partial).toMatchObject({ dispatched: "60.000000", received: "50.000000", inTransit: "10.000000", status: "open" });

    await expect(service().closeEarly(original.id, partial.version, ACTOR)).rejects.toMatchObject({
      code: "TRANSFER_IN_TRANSIT",
      status: 409,
      message: "Receive or write off the 10.000000 kg still in transit first.",
      messageParams: { quantity: "10.000000", unit: "kg" },
    });
    expect(await service().get(original.id)).toEqual(partial);
    expect(await entries("transfers.transfer.closed-early")).toEqual([]);
  });

  it("takes a 60 kg plan through 55 received and 5 written off to Closed Early, the loss linked in its posting and audit (E2E-009)", async () => {
    const original = await created("100", { ...TRANSFER, quantity: "60" });
    expect([await physical(A), await physical(B)]).toEqual(["100.000000", "0.000000"]);
    await service().dispatch(original.id, kg("60"), ACTOR);
    await service().receive(original.id, kg("55"), ACTOR);
    const { posting: loss } = await service().writeOff(original.id, { ...kg("5"), reason: "Crate lost" }, ACTOR);
    // Every dispatched unit is accounted for, yet the loss keeps it from Completed.
    const settled = await service().get(original.id);
    expect(settled).toMatchObject({ inTransit: "0.000000", status: "open" });

    const closed = await service().closeEarly(original.id, settled.version, ACTOR);

    expect(closed).toMatchObject({ status: "closed-early", quantity: "60.000000", dispatched: "60.000000", received: "55.000000", writtenOff: "5.000000",
      inTransit: "0.000000", abandoned: "5.000000", outstanding: "0.000000" });
    expect([await physical(A), await physical(B)]).toEqual(["40.000000", "55.000000"]);
    expect((await service().get(original.id)).postings.find(({ id }) => id === loss.id)).toMatchObject({
      kind: "write-off", reason: "Crate lost", legs: [{ place: "transit", location: null, quantity: "-5.000000", before: "5.000000", after: "0.000000" }],
    });
    expect(await entries("transfers.transfer.written-off")).toEqual([
      expect.objectContaining({ subjectId: original.id, after: expect.objectContaining({ posting: loss.id, moved: "5.000000", reason: "Crate lost", writtenOff: "5.000000" }) }),
    ]);
    expect(await entries("transfers.transfer.closed-early")).toEqual([
      expect.objectContaining({ subjectId: original.id, after: expect.objectContaining({ status: "closed-early", abandoned: "5.000000", writtenOff: "5.000000" }) }),
    ]);
  });

  it("never calls a transfer with loss Completed and rolls back closure when audit fails", async () => {
    const original = await created();
    await service().dispatch(original.id, kg("100"), ACTOR);
    await service().receive(original.id, kg("90"), ACTOR);
    await service().writeOff(original.id, { ...kg("10"), reason: "Lost" }, ACTOR);
    const settled = await service().get(original.id);
    expect(settled.status).toBe("open");
    crash.action = "transfers.transfer.closed-early";
    await expect(service().closeEarly(original.id, settled.version, ACTOR)).rejects.toThrow("crash while recording");
    expect(await service().get(original.id)).toEqual(settled);
    expect(await entries(crash.action)).toEqual([]);
    crash.action = null;
    expect(await service().closeEarly(original.id, settled.version, ACTOR)).toMatchObject({ status: "closed-early", abandoned: "10.000000" });
  });

  describe("create", () => {
    it("saves an Open single-material transfer with its locations and dates, and changes no balance (TRF-001, TRF-003, LFC-001)", async () => {
      await correct(A, "100");

      const transfer = await service().create({ ...TRANSFER, quantity: "0.05", unit: "t" }, ACTOR);

      expect(transfer).toEqual({
        id: "00000001",
        material: "00000001",
        source: A,
        destination: B,
        quantity: "50.000000",
        enteredQuantity: "0.05",
        enteredUnit: "t",
        numerator: "1000",
        denominator: "1",
        plannedDispatch: "2026-10-19",
        plannedArrival: "2026-10-22",
        dispatched: "0.000000",
        received: "0.000000",
        writtenOff: "0.000000",
        inTransit: "0.000000",
        undispatched: "50.000000",
        abandoned: "0.000000",
        outstanding: "50.000000",
        status: "open",
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        version: 1,
      });
      expect(await physical(A)).toBe("100.000000");
      expect(await physical(B)).toBe("0.000000");
      expect(await scoped().count(StockMovement, { type: { $ne: "correction" } })).toBe(0);
      expect((await service().create(TRANSFER, ACTOR)).id).toBe("00000002");
      expect(await entries("transfers.transfer.created")).toContainEqual({
        subjectId: "00000001",
        subjectLabel: "00000001 — 00000001 Steel sheet: 00000001 → 00000002",
        before: null,
        after: {
          id: "00000001", material: "00000001", source: A, destination: B, quantity: "50.000000", unit: "kg",
          plannedDispatch: "2026-10-19", plannedArrival: "2026-10-22", status: "open",
        },
      });
    });

    it("refuses inactive or unknown masters and a unit the material doesn't convert, writing nothing", async () => {
      const em = scoped();
      (await em.findOneOrFail(Location, { code: B })).active = false;
      await em.flush();

      await expect(service().create(TRANSFER, ACTOR)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });
      await expect(service().create({ ...TRANSFER, destination: "00000009" }, ACTOR)).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
      await expect(service().create({ ...TRANSFER, destination: "00000003", unit: "box" }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { unit: [UNIT_NOT_CONVERTIBLE_MESSAGE] },
      });
      expect(await scoped().count(Transfer, {})).toBe(0);
      expect(await entries("transfers.transfer.created")).toEqual([]);
    });

    it("refuses a location of another tenant, and neither tenant changes (TRF-022, R05)", async () => {
      await correct(A, "100");

      // Location 00000003 exists in Prod only: from Test it is not found.
      await expect(service("test").create({ ...TRANSFER, destination: "00000003" }, ACTOR)).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });

      expect(await scoped("test").count(Transfer, {})).toBe(0);
      expect(await scoped("prod").count(Transfer, {})).toBe(0);
      expect(await physical(A)).toBe("100.000000");
      expect(await physical(A, "test")).toBe("0.000000");
    });

    it("maps a transfer ID taken at the same moment to a conflict, and rethrows anything else", async () => {
      const em = scoped();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      await expect(new TransferService({ em }).create(TRANSFER, ACTOR)).rejects.toMatchObject({ code: "TRANSFER_ID_RACE", message: TRANSFER_ID_RACE });
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new Error("disk full"));
      await expect(new TransferService({ em }).create(TRANSFER, ACTOR)).rejects.toThrow("disk full");
    });
  });

  describe("dispatch", () => {
    it("lowers the source and raises transit, leaving the destination, then dispatches the rest (TRF-004, TRF-005, INV-009)", async () => {
      const transfer = await created();

      const first = await service().dispatch(transfer.id, kg("60"), ACTOR);

      expect(first.transfer).toMatchObject({ dispatched: "60.000000", inTransit: "60.000000", undispatched: "40.000000", status: "open" });
      expect(first.posting).toEqual({
        id: expect.any(String),
        kind: "dispatch",
        businessDate: today(),
        occurredAt: expect.any(Date),
        quantity: "60.000000",
        enteredQuantity: "60",
        enteredUnit: "kg",
        numerator: "1",
        denominator: "1",
        reason: "Transfer 00000001 dispatch from 00000001 to 00000002",
        actorUsername: "alice",
        channel: "ui",
        legs: [
          { place: "source", location: A, quantity: "-60.000000", before: "100.000000", after: "40.000000" },
          { place: "transit", location: null, quantity: "60.000000", before: "0.000000", after: "60.000000" },
        ],
        reversedBy: null,
        canReverse: true,
      });
      expect(await physical(A)).toBe("40.000000");
      expect(await physical(B)).toBe("0.000000");

      const second = await service().dispatch(transfer.id, kg("40"), ACTOR);
      expect(second.transfer).toMatchObject({ dispatched: "100.000000", inTransit: "100.000000", undispatched: "0.000000", status: "open" });
      expect(await physical(A)).toBe("0.000000");
      expect(await physical(B)).toBe("0.000000");
      const [movement] = await scoped().find(StockMovement, { postingId: first.posting.id });
      expect(movement).toMatchObject({ type: TRANSFER_DISPATCH_MOVEMENT, quantity: "-60.000000", businessDate: today() });
    });

    it("converts the entered unit and keeps what was entered (R03, MAT-019)", async () => {
      const transfer = await created();

      const { posting } = await service().dispatch(transfer.id, { quantity: "0.025", unit: "t" }, ACTOR);

      expect(posting).toMatchObject({ quantity: "25.000000", enteredQuantity: "0.025", enteredUnit: "t", numerator: "1000" });
      expect(await physical(A)).toBe("75.000000");
    });

    it("allows a partial dispatch of all the source holds and keeps the rest undispatched (TRF-009)", async () => {
      const transfer = await created("60");

      const { transfer: after } = await service().dispatch(transfer.id, kg("60"), ACTOR);

      expect(after).toMatchObject({ undispatched: "40.000000", inTransit: "60.000000", status: "open" });
    });

    it("refuses more than the source physically holds, leaving source and transit unchanged (TRF-008, R09)", async () => {
      const transfer = await created("75");
      await service().dispatch(transfer.id, kg("60"), ACTOR);

      await expect(service().dispatch(transfer.id, kg("20"), ACTOR)).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK",
        messageParams: { material: "00000001", location: A, available: "15.000000", requested: "20.000000", unit: "kg" },
      });

      expect(await physical(A)).toBe("15.000000");
      expect((await service().get(transfer.id))).toMatchObject({ dispatched: "60.000000", inTransit: "60.000000" });
      expect(await scoped().count(TransferPosting, {})).toBe(1);
    });

    it("refuses more than is left to dispatch (spec Q4)", async () => {
      const transfer = await created("200");
      await service().dispatch(transfer.id, kg("60"), ACTOR);

      await expect(service().dispatch(transfer.id, kg("40.000001"), ACTOR)).rejects.toMatchObject({
        code: "TRANSFER_OVER_DISPATCH",
        message: "Transfer 00000001: only 40.000000 kg is left to dispatch.",
        messageParams: { transfer: "00000001", available: "40.000000", requested: "40.000001", unit: "kg" },
      });
      expect(await physical(A)).toBe("140.000000");
    });

    it("dates the movement today and keeps the planned dates (TRF-023, INV-010)", async () => {
      const transfer = await created();

      const { posting, transfer: after } = await service().dispatch(transfer.id, kg("10"), ACTOR);

      expect(posting.businessDate).toBe(today());
      expect([after.plannedDispatch, after.plannedArrival]).toEqual(["2026-10-19", "2026-10-22"]);
    });

    it("refuses a unit the material doesn't convert as a field error, and an unknown transfer", async () => {
      const transfer = await created();

      await expect(service().dispatch(transfer.id, { quantity: "1", unit: "box" }, ACTOR)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { unit: [UNIT_NOT_CONVERTIBLE_MESSAGE] },
      });
      await expect(service().dispatch("00000009", kg("1"), ACTOR)).rejects.toMatchObject({ code: "TRANSFER_NOT_FOUND" });
      await expect(service("test").dispatch(transfer.id, kg("1"), ACTOR)).rejects.toMatchObject({ code: "TRANSFER_NOT_FOUND" });
    });

    it("rolls both legs back when the posting fails after the source leg was flushed (AUD-019)", async () => {
      const transfer = await created();
      crash.action = "transfers.transfer.dispatched";

      await expect(service().dispatch(transfer.id, kg("60"), ACTOR)).rejects.toThrow("crash while recording");

      expect(await physical(A)).toBe("100.000000");
      expect(await scoped().count(StockMovement, { type: TRANSFER_DISPATCH_MOVEMENT })).toBe(0);
      expect(await scoped().count(TransferPosting, {})).toBe(0);
      expect((await service().get(transfer.id)).inTransit).toBe("0.000000");
      expect(await entries("stock.movement.posted")).toHaveLength(1); // The opening correction only.
    });

    it("dispatches both of two racing postings, the second retried on what the first committed", async () => {
      const transfer = await created();
      const other = await initOrm(toDbOptions(loadConfig({ DATA_DIR: directory })));
      let raced = false;
      try {
        const em = scoped();
        const posted = await retryingStaleSnapshot(() =>
          inRequestTransaction(em, async () => {
            await new TransferService({ em }).get(transfer.id);
            if (!raced) {
              raced = true;
              await new TransferService({ em: scoped("prod", other) }).dispatch(transfer.id, kg("60"), ACTOR);
            }
            return new TransferService({ em }).dispatch(transfer.id, kg("40"), ACTOR);
          }),
        );
        expect(posted.transfer).toMatchObject({ dispatched: "100.000000", inTransit: "100.000000" });
        expect(await physical(A)).toBe("0.000000");
      } finally {
        await other.close();
      }
    });

    it("refuses the second of two racing postings that together would overdraw the source", async () => {
      const transfer = await created("70");
      const other = await initOrm(toDbOptions(loadConfig({ DATA_DIR: directory })));
      let raced = false;
      try {
        const em = scoped();
        await expect(
          retryingStaleSnapshot(() =>
            inRequestTransaction(em, async () => {
              await new TransferService({ em }).get(transfer.id);
              if (!raced) {
                raced = true;
                await new TransferService({ em: scoped("prod", other) }).dispatch(transfer.id, kg("60"), ACTOR);
              }
              return new TransferService({ em }).dispatch(transfer.id, kg("40"), ACTOR);
            }),
          ),
        ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
        expect(await physical(A)).toBe("10.000000");
        expect((await service().get(transfer.id)).inTransit).toBe("60.000000");
      } finally {
        await other.close();
      }
    });
  });

  describe("receive", () => {
    it("lowers transit and raises the destination, leaving the source, and refuses more than is in transit (TRF-006, TRF-007)", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("60"), ACTOR);

      const { transfer: after, posting } = await service().receive(transfer.id, kg("50"), ACTOR);

      expect(after).toMatchObject({ received: "50.000000", inTransit: "10.000000", status: "open" });
      expect(posting.legs).toEqual([
        { place: "transit", location: null, quantity: "-50.000000", before: "60.000000", after: "10.000000" },
        { place: "destination", location: B, quantity: "50.000000", before: "0.000000", after: "50.000000" },
      ]);
      expect(posting.reason).toBe("Transfer 00000001 receipt at 00000002 from 00000001");
      expect(await physical(A)).toBe("40.000000");
      expect(await physical(B)).toBe("50.000000");

      await expect(service().receive(transfer.id, kg("11"), ACTOR)).rejects.toMatchObject({
        code: "TRANSFER_OVER_RECEIPT",
        message: "Transfer 00000001: only 10.000000 kg is in transit.",
        messageParams: { available: "10.000000", requested: "11.000000" },
      });
      expect(await physical(B)).toBe("50.000000");
      expect((await service().get(transfer.id)).inTransit).toBe("10.000000");
      const [movement] = await scoped().find(StockMovement, { postingId: posting.id });
      expect(movement.type).toBe(TRANSFER_RECEIPT_MOVEMENT);
    });

    it("completes the transfer when the last receipt lands the planned quantity with no write-off (spec Q7)", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("100"), ACTOR);
      await service().receive(transfer.id, kg("70"), ACTOR);
      expect((await service().get(transfer.id)).status).toBe("open");

      const { transfer: after } = await service().receive(transfer.id, kg("30"), ACTOR);

      expect(after).toMatchObject({ status: "completed", received: "100.000000", inTransit: "0.000000", writtenOff: "0.000000" });
      await expect(service().dispatch(transfer.id, kg("1"), ACTOR)).rejects.toMatchObject({
        code: "TRANSFER_NOT_OPEN",
        message: "Transfer 00000001 is completed, so it can't change.",
      });
      await expect(service().setPlannedDates(transfer.id, { plannedDispatch: "2026-11-01", plannedArrival: "2026-11-02" }, after.version, ACTOR)).rejects.toMatchObject({
        code: "TRANSFER_NOT_OPEN",
      });
    });

    it("rolls both legs back when the receipt fails while writing the destination (AUD-020)", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("60"), ACTOR);
      crash.action = "transfers.transfer.received";

      await expect(service().receive(transfer.id, kg("50"), ACTOR)).rejects.toThrow("crash while recording");

      expect(await physical(B)).toBe("0.000000");
      expect((await service().get(transfer.id))).toMatchObject({ inTransit: "60.000000", received: "0.000000" });
      expect(await scoped().count(StockMovement, { type: TRANSFER_RECEIPT_MOVEMENT })).toBe(0);
      expect(await scoped().count(TransferPosting, { kind: "receipt" })).toBe(0);
    });
  });

  describe("writeOff", () => {
    it("clears lost transit with its reason, in the ledger and the audit, and changes no location (TRF-013)", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("60"), ACTOR);
      await service().receive(transfer.id, kg("50"), ACTOR);

      const { transfer: after, posting } = await service().writeOff(transfer.id, { ...kg("10"), reason: "Pallet lost in transit" }, API_ACTOR);

      expect(after).toMatchObject({ inTransit: "0.000000", writtenOff: "10.000000", status: "open" });
      expect(posting).toMatchObject({
        kind: "write-off",
        reason: "Pallet lost in transit",
        channel: "api",
        businessDate: today(),
        legs: [{ place: "transit", location: null, quantity: "-10.000000", before: "10.000000", after: "0.000000" }],
      });
      expect(await physical(A)).toBe("40.000000");
      expect(await physical(B)).toBe("50.000000");
      expect(await entries("transfers.transfer.written-off")).toEqual([
        {
          subjectId: "00000001",
          subjectLabel: "00000001 — 00000001 Steel sheet: 00000001 → 00000002",
          before: { dispatched: "60.000000", received: "50.000000", writtenOff: "0.000000", inTransit: "10.000000", status: "open" },
          after: {
            dispatched: "60.000000", received: "50.000000", writtenOff: "10.000000", inTransit: "0.000000", status: "open",
            moved: "10.000000", businessDate: today(), posting: posting.id, reason: "Pallet lost in transit",
          },
        },
      ]);
      // A written-off transfer never becomes Completed; Close Early (E11-S01) resolves it.
      await service().dispatch(transfer.id, kg("40"), ACTOR);
      const { transfer: last } = await service().receive(transfer.id, kg("40"), ACTOR);
      expect(last).toMatchObject({ received: "90.000000", inTransit: "0.000000", undispatched: "0.000000", status: "open" });
    });

    it("refuses more than is in transit (TRF-013)", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("10"), ACTOR);

      await expect(service().writeOff(transfer.id, { ...kg("10.5"), reason: "Lost" }, ACTOR)).rejects.toMatchObject({
        code: "TRANSFER_OVER_WRITE_OFF",
        message: "Transfer 00000001: only 10.000000 kg is in transit.",
      });
      expect((await service().get(transfer.id)).inTransit).toBe("10.000000");
    });
  });

  describe("transit and physical stock", () => {
    it("keeps transit usable at neither site: corrections are limited to physical stock (TRF-010, TRF-011)", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("60"), ACTOR);

      await expect(correct(A, "-41")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", messageParams: { available: "40.000000" } });
      await expect(correct(B, "-5")).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", messageParams: { available: "0.000000" } });
      expect((await service().get(transfer.id)).inTransit).toBe("60.000000");
    });

    it("refuses a correction that names a transfer: transit is written off on its transfer (TRF-014)", async () => {
      expect(() => parseInput(stockCorrectionSchema, { material: "00000001", location: A, quantity: "-10", unit: "kg", reason: "Lost", transfer: "00000001" })).toThrow(
        expect.objectContaining({ code: "VALIDATION_FAILED", fieldErrors: { transfer: [CORRECTION_TRANSIT_MESSAGE] } }),
      );
    });

    it("shows what is in transit from and to a location next to its physical stock (UX-017, INV-009)", async () => {
      const first = await created();
      await correct(B, "30");
      const back = await service().create({ ...TRANSFER, source: B, destination: A, quantity: "30" }, ACTOR);
      await service().dispatch(first.id, kg("60"), ACTOR);
      await service().dispatch(back.id, kg("20"), ACTOR);
      // A completed transfer has nothing in transit; a write-off takes its part out.
      await service().writeOff(first.id, { ...kg("5"), reason: "Lost" }, ACTOR);

      // A transfer with nothing in transit is no holder of it.
      const idle = await service().create({ ...TRANSFER, quantity: "1" }, ACTOR);
      expect(await stock(A)).toMatchObject({ quantity: "40.000000", inTransitFrom: "55.000000", inTransitTo: "20.000000", transitTransfers: [first.id, back.id] });
      expect(await stock(B)).toMatchObject({ quantity: "10.000000", inTransitFrom: "20.000000", inTransitTo: "55.000000", transitTransfers: [first.id, back.id] });
      expect(await stock(A, "00000002")).toMatchObject({ quantity: "0.000000", inTransitFrom: "0.000000", inTransitTo: "0.000000", transitTransfers: [] });
      expect((await stock(A)).transitTransfers).not.toContain(idle.id);
    });

    it("adds up transit over more transfers than one read holds", async () => {
      const em = scoped();
      const material = await em.findOneOrFail(Material, { code: "00000001" });
      const [source, destination] = await em.find(Location, { code: { $in: [A, B] } }, { orderBy: { code: "asc" } });
      for (let index = 1; index <= 101; index += 1) {
        em.create(Transfer, {
          code: String(index).padStart(8, "0"), material, source, destination, quantity: "2.000000", enteredQuantity: "2", enteredUnit: "kg",
          numerator: "1", denominator: "1", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-22", dispatched: "1.000000",
        });
      }
      await em.flush();

      expect((await stock(A)).inTransitFrom).toBe("101.000000");
    });
  });

  describe("setPlannedDates", () => {
    it("changes both dates at the loaded version, audits them, and records nothing for the same dates (TRF-026, spec Q3)", async () => {
      const transfer = await created("0");

      const after = await service().setPlannedDates(transfer.id, { plannedDispatch: "2026-10-25", plannedArrival: "2026-10-27" }, transfer.version, ACTOR);

      expect(after).toMatchObject({ plannedDispatch: "2026-10-25", plannedArrival: "2026-10-27", version: 2 });
      expect(await entries("transfers.transfer.updated")).toEqual([
        {
          subjectId: "00000001",
          subjectLabel: "00000001 — 00000001 Steel sheet: 00000001 → 00000002",
          before: { plannedDispatch: "2026-10-19", plannedArrival: "2026-10-22" },
          after: { plannedDispatch: "2026-10-25", plannedArrival: "2026-10-27" },
        },
      ]);
      const same = await service().setPlannedDates(transfer.id, { plannedDispatch: "2026-10-25", plannedArrival: "2026-10-27" }, after.version, ACTOR);
      expect(same.version).toBe(2);
      expect(await entries("transfers.transfer.updated")).toHaveLength(1);
    });

    it("says a Completed transfer is completed even to a stale version, so the refused dialog isn't refreshed away", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("100"), ACTOR);
      await service().receive(transfer.id, kg("100"), ACTOR);

      await expect(service().setPlannedDates(transfer.id, { plannedDispatch: "2026-10-25", plannedArrival: "2026-10-27" }, transfer.version, ACTOR)).rejects.toMatchObject({
        code: "TRANSFER_NOT_OPEN",
      });
    });

    it("refuses a stale version, including one a posting advanced (AUD-025)", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("10"), ACTOR);

      await expect(service().setPlannedDates(transfer.id, { plannedDispatch: "2026-10-25", plannedArrival: "2026-10-27" }, transfer.version, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
      expect((await service().get(transfer.id)).plannedDispatch).toBe("2026-10-19");
    });

    it("maps a version a racing write advanced at flush to a conflict", async () => {
      const transfer = await created("0");
      const em = scoped();
      vi.spyOn(em, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));

      await expect(new TransferService({ em }).setPlannedDates(transfer.id, { plannedDispatch: "2026-10-25", plannedArrival: "2026-10-27" }, 1, ACTOR)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });
    });
  });

  describe("audit", () => {
    it("audits each posting with the transfer's progress, and each physical leg in the ledger's own entry (R08, TRF-024)", async () => {
      const transfer = await created();
      const dispatch = (await service().dispatch(transfer.id, kg("60"), ACTOR)).posting;
      const receipt = (await service().receive(transfer.id, kg("50"), ACTOR)).posting;

      expect(await entries("transfers.transfer.dispatched")).toEqual([
        {
          subjectId: "00000001",
          subjectLabel: "00000001 — 00000001 Steel sheet: 00000001 → 00000002",
          before: { dispatched: "0.000000", received: "0.000000", writtenOff: "0.000000", inTransit: "0.000000", status: "open" },
          after: { dispatched: "60.000000", received: "0.000000", writtenOff: "0.000000", inTransit: "60.000000", status: "open", moved: "60.000000", businessDate: today(), posting: dispatch.id },
        },
      ]);
      expect((await entries("transfers.transfer.received"))[0].after).toMatchObject({ received: "50.000000", inTransit: "10.000000", moved: "50.000000", posting: receipt.id });
      const ledger = await entries("stock.movement.posted");
      expect(ledger.map(({ after }) => [after!.location, after!.movement, after!.type])).toEqual([
        [A, "100.000000", "correction"],
        [A, "-60.000000", TRANSFER_DISPATCH_MOVEMENT],
        [B, "50.000000", TRANSFER_RECEIPT_MOVEMENT],
      ]);
    });

    it("keeps postings immutable in the database", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("10"), ACTOR);

      await expect(scoped().getConnection().execute("update transfer_posting set quantity = '1.000000'")).rejects.toThrow(TRANSFER_POSTING_IMMUTABLE);
    });
  });

  describe("list and get", () => {
    it("pages the tenant's transfers by ID, counts them, and reads one with its newest postings first (TEN-014)", async () => {
      const first = await created();
      await service().create(TRANSFER, ACTOR);
      await service().dispatch(first.id, kg("60"), ACTOR);
      await service().receive(first.id, kg("50"), ACTOR);

      expect((await service().list()).map(({ id }) => id)).toEqual(["00000001", "00000002"]);
      expect(await service().list({ page: 2 })).toEqual([]);
      expect(await service().count()).toBe(2);
      expect(await service("test").list()).toEqual([]);
      const detail = await service().get(first.id);
      expect(detail.postings.map(({ kind }) => kind)).toEqual(["receipt", "dispatch"]);
      expect(detail.postings.flatMap(({ legs }) => legs.map(({ place, quantity }) => `${place} ${quantity}`)).reverse()).toEqual([
        "transit 60.000000",
        "source -60.000000",
        "destination 50.000000",
        "transit -50.000000",
      ]);
      expect((await service().get("00000002")).postings).toEqual([]);
      await expect(service("test").get(first.id)).rejects.toMatchObject({ code: "TRANSFER_NOT_FOUND" });
    });

    describe("sorted and searched (#217)", () => {
      /** Stores a transfer as it stands, bypassing the create rules (any status). */
      const store = async (em: EntityManager, code: string, material: string, source: string, destination: string, plannedDispatch: string, status: string) => {
        em.create(Transfer, {
          code,
          material: await em.findOneOrFail(Material, { code: material }),
          source: await em.findOneOrFail(Location, { code: source }),
          destination: await em.findOneOrFail(Location, { code: destination }),
          quantity: "1.000000", enteredQuantity: "1", enteredUnit: "kg", numerator: "1", denominator: "1", plannedDispatch, plannedArrival: "2027-04-01", status,
        });
      };
      const ids = (transfers: { id: string }[]) => transfers.map(({ id }) => id);

      beforeEach(async () => {
        // Inserted out of ID order, so an unordered read wouldn't look sorted.
        const em = scoped();
        await store(em, "00000003", "00000002", A, B, "2027-01-10", "open");
        await store(em, "00000001", "00000001", B, "00000003", "2027-03-01", "completed");
        await store(em, "00000002", "00000002", A, "00000003", "2027-02-01", "cancelled");
        await store(em, "00000004", "00000001", A, B, "2027-02-01", "open");
        await em.flush();
        await service("test").create(TRANSFER, ACTOR);
      });

      it("sorts by each column, both ways, by ID within equal values", async () => {
        expect(ids(await service().list({ sort: "id", dir: "desc" }))).toEqual(["00000004", "00000003", "00000002", "00000001"]);
        expect(ids(await service().list({ sort: "material" }))).toEqual(["00000001", "00000004", "00000002", "00000003"]);
        expect(ids(await service().list({ sort: "material", dir: "desc" }))).toEqual(["00000002", "00000003", "00000001", "00000004"]);
        expect(ids(await service().list({ sort: "source" }))).toEqual(["00000002", "00000003", "00000004", "00000001"]);
        expect(ids(await service().list({ sort: "source", dir: "desc" }))).toEqual(["00000001", "00000002", "00000003", "00000004"]);
        expect(ids(await service().list({ sort: "plannedDispatch" }))).toEqual(["00000003", "00000002", "00000004", "00000001"]);
        expect(ids(await service().list({ sort: "plannedDispatch", dir: "desc" }))).toEqual(["00000001", "00000002", "00000004", "00000003"]);
        expect(ids(await service().list({ sort: "status" }))).toEqual(["00000002", "00000001", "00000003", "00000004"]);
        expect(ids(await service().list({ sort: "status", dir: "desc" }))).toEqual(["00000003", "00000004", "00000001", "00000002"]);
      });

      it("sorts by each stored quantity by its value, not its text, by ID within equal values (#224)", async () => {
        const em = scoped();
        const fixed = (text: string) => formatDecimal(parseDecimal(text)!, { fixed: true });
        const amounts = { "00000001": ["100", "25", "9.5"], "00000002": ["25", "0", "0"], "00000003": ["9.5", "9.5", "0"], "00000004": ["100", "100", "25"] };
        for (const [code, [quantity, dispatched, received]] of Object.entries(amounts)) {
          Object.assign(await em.findOneOrFail(Transfer, { code }), { quantity: fixed(quantity), dispatched: fixed(dispatched), received: fixed(received) });
        }
        await em.flush();
        expect(ids(await service().list({ sort: "quantity" }))).toEqual(["00000003", "00000002", "00000001", "00000004"]);
        expect(ids(await service().list({ sort: "quantity", dir: "desc" }))).toEqual(["00000001", "00000004", "00000002", "00000003"]);
        expect(ids(await service().list({ sort: "dispatched" }))).toEqual(["00000002", "00000003", "00000001", "00000004"]);
        expect(ids(await service().list({ sort: "dispatched", dir: "desc" }))).toEqual(["00000004", "00000001", "00000003", "00000002"]);
        expect(ids(await service().list({ sort: "received" }))).toEqual(["00000002", "00000003", "00000001", "00000004"]);
        expect(ids(await service().list({ sort: "received", dir: "desc" }))).toEqual(["00000004", "00000001", "00000002", "00000003"]);
      });

      it("keeps transfers whose ID, material, source or destination holds every word, ignoring case, in this tenant only", async () => {
        expect(ids(await service().list({ q: "STEEL" }))).toEqual(["00000001", "00000004"]);
        expect(ids(await service().list({ q: "depot" }))).toEqual(["00000001", "00000002"]);
        expect(ids(await service().list({ q: "warehouse" }))).toEqual(["00000001", "00000003", "00000004"]);
        expect(ids(await service().list({ q: "0003" }))).toEqual(["00000001", "00000002", "00000003"]);
        expect(ids(await service().list({ q: "bolt depot" }))).toEqual(["00000002"]);
        expect(ids(await service().list({ q: "steel bolt" }))).toEqual([]);
        expect(ids(await service().list({ q: "warehouse", sort: "source", dir: "desc" }))).toEqual(["00000001", "00000003", "00000004"]);
        expect(await service().count({ q: "warehouse" })).toBe(3);
        expect(await service().count({ q: "\\" })).toBe(4);
        expect(ids(await service("test").list({ q: "steel" }))).toEqual(["00000001"]);
      });

      it("pages a sort with equal values by ID, so no transfer shows twice or never (lesson 2026-10-21)", async () => {
        const em = scoped();
        for (let index = 105; index >= 5; index--) await store(em, String(index).padStart(8, "0"), "00000002", A, B, "2027-01-10", "open");
        await em.flush();

        const first = await service().list({ sort: "material", dir: "desc", q: "bolt" });
        const second = await service().list({ sort: "material", dir: "desc", q: "bolt", page: 2 });
        expect(ids(first).slice(0, 3)).toEqual(["00000002", "00000003", "00000005"]);
        expect(ids(second)).toEqual(["00000103", "00000104", "00000105"]);
        expect(await service().count({ q: "bolt" })).toBe(first.length + second.length);
      });
    });

    it("shows at most the newest postings, and pages past the first page", async () => {
      expect(TRANSFER_POSTINGS_SHOWN).toBe(100);
      expect(TRANSFER_PAGE_SIZE).toBe(100);
      const transfer = await created("0", { ...TRANSFER, quantity: "200" });
      await correct(A, "200");
      for (let index = 0; index < 101; index += 1) await service().dispatch(transfer.id, kg("1"), ACTOR);

      const detail = await service().get(transfer.id);

      expect(detail.postings).toHaveLength(100);
      expect(detail.dispatched).toBe("101.000000");
    });
  });

  describe("deactivating masters (LFC-017, LFC-018)", () => {
    const locations = () => new LocationService({ em: scoped() });
    const materials = () => new MaterialService({ em: scoped() });

    it("refuses deactivating a location with in-transit stock from or to it, even at zero physical stock", async () => {
      const transfer = await created("60");
      await service().dispatch(transfer.id, kg("60"), ACTOR);
      expect(await physical(A)).toBe("0.000000");

      for (const location of [A, B]) {
        const { version } = await locations().get(location);
        await expect(locations().update(location, { active: false }, version, ACTOR)).rejects.toMatchObject({
          code: "LOCATION_HAS_OPEN_TRANSFERS",
          message: "Transfer 00000001 is still Open from or to this location.",
          messageParams: { transfer: "00000001" },
        });
      }
    });

    it("refuses deactivating a location of an unfinished transfer, naming the lowest one, and allows it once completed", async () => {
      await created("0");
      await correct("00000003", "10");
      const back = await service().create({ ...TRANSFER, source: "00000003", destination: B, quantity: "10" }, ACTOR);

      const { version } = await locations().get(B);
      await expect(locations().update(B, { active: false }, version, ACTOR)).rejects.toMatchObject({ messageParams: { transfer: "00000001" } });
      await service().dispatch(back.id, kg("10"), ACTOR);
      const depot = await locations().get("00000003");
      await expect(locations().update("00000003", { active: false }, depot.version, ACTOR)).rejects.toMatchObject({ messageParams: { transfer: back.id } });

      await service().receive(back.id, kg("10"), ACTOR);
      expect((await locations().update("00000003", { active: false }, depot.version, ACTOR)).active).toBe(false);
    });

    it("refuses deactivating a material with an Open transfer, and changing its base unit once any transfer holds it", async () => {
      const transfer = await created("0");

      const material = await materials().get("00000001");
      await expect(materials().update("00000001", { active: false }, material.version, ACTOR)).rejects.toMatchObject({
        code: "MATERIAL_IN_OPEN_TRANSFER",
        messageParams: { transfer: transfer.id },
      });
      await materials().removeConversion("00000001", "t", 1, ACTOR);
      await expect(materials().update("00000001", { baseUnit: "g" }, material.version, ACTOR)).rejects.toMatchObject({
        code: "BASE_UNIT_IN_USE",
        message: "Transfers use this material, so its base unit can't change: their quantities are stored in it.",
      });
    });
  });

  describe("reverse", () => {
    const reason = { reason: "Posted on the wrong transfer" };
    const sixty = { ...TRANSFER, quantity: "60" };
    const postingOf = async (id: string, kind: string) => (await service().get(id)).postings.find((posting) => posting.kind === kind)!;
    const untouched = async (id: string) => ({
      a: await physical(A), b: await physical(B), transfer: await service().get(id),
      reversals: await scoped().count(TransferReversal, {}), links: await scoped().count(StockReversal, {}), audit: await scoped().count(TenantAuditEvent, {}),
    });

    it("lands a reversed receipt back in transit, linked, audited and once only (TRF-019)", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("60"), ACTOR);
      const receipt = (await service().receive(transfer.id, kg("50"), ACTOR)).posting;
      const reversed = await service().reverse(transfer.id, receipt.id, { reason: " Posted on the wrong transfer " }, API_ACTOR);

      expect(reversed.transfer).toMatchObject({ dispatched: "60.000000", received: "0.000000", inTransit: "60.000000", status: "open", version: transfer.version + 3 });
      expect(reversed.reversal).toEqual({
        id: expect.any(String), original: receipt.id, kind: "receipt", businessDate: today(), occurredAt: expect.any(Date), quantity: "50.000000",
        reason: reason.reason, actorUsername: "alice", channel: "api",
        legs: [
          { place: "destination", location: B, quantity: "-50.000000", before: "50.000000", after: "0.000000" },
          { place: "transit", location: null, quantity: "50.000000", before: "10.000000", after: "60.000000" },
        ],
      });
      expect([await physical(A), await physical(B)]).toEqual(["40.000000", "0.000000"]);
      const [inverse] = await scoped().find(StockMovement, { postingId: reversed.reversal.id }, { populate: ["location"] });
      expect(inverse).toMatchObject({ type: "reversal", quantity: "-50.000000", reason: reason.reason, location: { code: B } });
      expect(await scoped().findOneOrFail(StockReversal, { inverse }, { populate: ["original"] })).toMatchObject({ original: { postingId: receipt.id } });
      const detail = await service().get(transfer.id);
      expect(detail.postings.find(({ id }) => id === receipt.id)).toMatchObject({ reversedBy: reversed.reversal.id, canReverse: false });
      expect(detail.reversals).toEqual([reversed.reversal]);
      expect(await entries("transfers.transfer.reversed")).toEqual([{
        subjectId: transfer.id, subjectLabel: "00000001 — 00000001 Steel sheet: 00000001 → 00000002",
        before: { dispatched: "60.000000", received: "50.000000", writtenOff: "0.000000", inTransit: "10.000000", status: "open", abandoned: "0.000000" },
        after: { dispatched: "60.000000", received: "0.000000", writtenOff: "0.000000", inTransit: "60.000000", status: "open", abandoned: "0.000000",
          posting: receipt.id, kind: "receipt", reversal: reversed.reversal.id, quantity: "50.000000", businessDate: today(), reason: reason.reason },
      }]);
      await expect(service().reverse(transfer.id, receipt.id, reason, ACTOR)).rejects.toMatchObject({
        code: "TRANSFER_POSTING_ALREADY_REVERSED", status: 409, messageParams: { reversal: reversed.reversal.id },
      });
      expect(await scoped().count(TransferReversal, {})).toBe(1);
    });

    it("reverses a dispatch only after its receipts and write-offs, restoring the source (TRF-020, TRF-021)", async () => {
      const transfer = await created();
      const dispatch = (await service().dispatch(transfer.id, kg("60"), ACTOR)).posting;
      const receipt = (await service().receive(transfer.id, kg("50"), ACTOR)).posting;
      expect(await postingOf(transfer.id, "dispatch")).toMatchObject({ canReverse: false });
      const before = await untouched(transfer.id);
      await expect(service().reverse(transfer.id, dispatch.id, reason, ACTOR)).rejects.toMatchObject({
        code: "TRANSFER_REVERSAL_ORDER", status: 409, messageParams: { transfer: transfer.id, received: "50.000000", writtenOff: "0.000000", unit: "kg" },
      });
      expect(await untouched(transfer.id)).toEqual(before);
      await service().reverse(transfer.id, receipt.id, reason, ACTOR);
      expect(await postingOf(transfer.id, "dispatch")).toMatchObject({ canReverse: true });
      const reversed = await service().reverse(transfer.id, dispatch.id, reason, ACTOR);
      expect(reversed.transfer).toMatchObject({ dispatched: "0.000000", received: "0.000000", inTransit: "0.000000", undispatched: "100.000000", status: "open" });
      expect(reversed.reversal.legs).toEqual([
        { place: "transit", location: null, quantity: "-60.000000", before: "60.000000", after: "0.000000" },
        { place: "source", location: A, quantity: "60.000000", before: "40.000000", after: "100.000000" },
      ]);
      expect([await physical(A), await physical(B)]).toEqual(["100.000000", "0.000000"]);
    });

    it("waits for every receipt even when another dispatch's quantity is still in transit", async () => {
      const transfer = await created();
      const first = (await service().dispatch(transfer.id, kg("30"), ACTOR)).posting;
      await service().dispatch(transfer.id, kg("30"), ACTOR);
      await service().receive(transfer.id, kg("30"), ACTOR);
      await expect(service().reverse(transfer.id, first.id, reason, ACTOR)).rejects.toMatchObject({ code: "TRANSFER_REVERSAL_ORDER" });
      expect((await service().get(transfer.id)).postings.filter(({ canReverse }) => canReverse).map(({ kind }) => kind)).toEqual(["receipt"]);
    });

    it("puts a written-off loss back in transit and reopens a Closed Early transfer (TRF-025, TRF-027)", async () => {
      const transfer = await created("100", sixty);
      await service().dispatch(transfer.id, kg("60"), ACTOR);
      await service().receive(transfer.id, kg("55"), ACTOR);
      const loss = (await service().writeOff(transfer.id, { ...kg("5"), reason: "Damaged" }, ACTOR)).posting;
      const closed = await service().closeEarly(transfer.id, (await service().get(transfer.id)).version, ACTOR);
      expect(closed).toMatchObject({ status: "closed-early", abandoned: "5.000000", inTransit: "0.000000" });

      const reversed = await service().reverse(transfer.id, loss.id, reason, ACTOR);
      expect(reversed.transfer).toMatchObject({ status: "open", abandoned: "0.000000", writtenOff: "0.000000", inTransit: "5.000000", outstanding: "5.000000" });
      expect(reversed.reversal.legs).toEqual([{ place: "transit", location: null, quantity: "5.000000", before: "0.000000", after: "5.000000" }]);
      expect(await scoped().count(StockMovement, { type: "reversal" })).toBe(0);
      expect((await entries("transfers.transfer.reversed"))[0]).toMatchObject({ before: { status: "closed-early", abandoned: "5.000000" }, after: { status: "open", abandoned: "0.000000", kind: "write-off", posting: loss.id } });
      // The reversal names the write-off as its own entry recorded it (#145).
      expect((await entries("transfers.transfer.written-off"))[0].after).toMatchObject({ posting: loss.id });
      expect((await service().receive(transfer.id, kg("5"), ACTOR)).transfer).toMatchObject({ status: "completed", inTransit: "0.000000" });
    });

    it("reopens a Completed transfer only while the destination still holds the receipt", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("100"), ACTOR);
      const receipt = (await service().receive(transfer.id, kg("100"), ACTOR)).posting;
      await correct(B, "-1");
      const before = await untouched(transfer.id);
      await expect(service().reverse(transfer.id, receipt.id, reason, ACTOR)).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK", messageParams: { location: B, available: "99.000000", requested: "100.000000" },
      });
      expect(await untouched(transfer.id)).toEqual(before);
      await correct(B, "1");
      expect((await service().reverse(transfer.id, receipt.id, reason, ACTOR)).transfer).toMatchObject({ status: "open", received: "0.000000", inTransit: "100.000000" });
    });

    it("keeps a fully reversed transfer processed: Cancel refuses, Close Early resolves it", async () => {
      const transfer = await created();
      const dispatch = (await service().dispatch(transfer.id, kg("10"), ACTOR)).posting;
      const { transfer: reversed } = await service().reverse(transfer.id, dispatch.id, reason, ACTOR);
      await expect(service().cancel(transfer.id, reversed.version, ACTOR)).rejects.toMatchObject({ code: "DOCUMENT_PROCESSED" });
      expect(await service().closeEarly(transfer.id, reversed.version, ACTOR)).toMatchObject({ status: "closed-early", abandoned: "100.000000" });
    });

    const setActive = (role: "material" | "source" | "destination", code: string, active: boolean) =>
      role === "material" ? scoped().nativeUpdate(Material, { code }, { active }) : scoped().nativeUpdate(Location, { code }, { active });
    it.each([
      ["material", A],
      ["source", A],
      ["destination", B],
    ] as const)("refuses to reopen a transfer whose %s was deactivated after it closed", async (role, code) => {
      const transfer = await created("100", sixty);
      await service().dispatch(transfer.id, kg("60"), ACTOR);
      await service().receive(transfer.id, kg("55"), ACTOR);
      const loss = (await service().writeOff(transfer.id, { ...kg("5"), reason: "Damaged" }, ACTOR)).posting;
      await service().closeEarly(transfer.id, (await service().get(transfer.id)).version, ACTOR);
      await setActive(role, code, false);
      const before = await untouched(transfer.id);
      await expect(service().reverse(transfer.id, loss.id, reason, ACTOR)).rejects.toMatchObject({
        code: "TRANSFER_MASTER_INACTIVE", messageParams: { transfer: transfer.id, [role]: code },
      });
      expect(await untouched(transfer.id)).toEqual(before);
      await setActive(role, code, true);
      expect((await service().reverse(transfer.id, loss.id, reason, ACTOR)).transfer.status).toBe("open");
    });

    it("refuses a dispatch reversal that would overflow the source balance and writes nothing", async () => {
      const transfer = await created("999999999999.999999");
      const dispatch = (await service().dispatch(transfer.id, kg("1"), ACTOR)).posting;
      await correct(A, "1");
      await expect(service().reverse(transfer.id, dispatch.id, reason, ACTOR)).rejects.toMatchObject({ code: "QUANTITY_OUT_OF_RANGE", status: 400 });
      expect(await scoped().count(TransferReversal, {})).toBe(0);
    });

    it("refuses bad input, unknown, other-transfer and other-tenant postings and a read-only tenant", async () => {
      const transfer = await created();
      const other = await service().create(TRANSFER, ACTOR);
      const dispatch = (await service().dispatch(transfer.id, kg("10"), ACTOR)).posting;
      const before = await untouched(transfer.id);
      await expect(service().reverse(transfer.id, dispatch.id, { reason: "" }, ACTOR)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      await expect(service().reverse(transfer.id, dispatch.id, { ...reason, quantity: "1" }, ACTOR)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      await expect(service().reverse(transfer.id, "not-a-uuid", reason, ACTOR)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      await expect(service().reverse(transfer.id, "11111111-1111-4111-8111-111111111111", reason, ACTOR)).rejects.toMatchObject({ code: "TRANSFER_POSTING_NOT_FOUND", status: 404 });
      await expect(service().reverse(other.id, dispatch.id, reason, ACTOR)).rejects.toMatchObject({ code: "TRANSFER_POSTING_NOT_FOUND" });
      await expect(service("test").reverse(transfer.id, dispatch.id, reason, ACTOR)).rejects.toMatchObject({ code: "TRANSFER_NOT_FOUND" });
      const stale = service();
      await orm.em.fork().nativeUpdate(Tenant, { code: "prod" }, { readOnly: true });
      await expect(stale.reverse(transfer.id, dispatch.id, reason, ACTOR)).rejects.toMatchObject({ code: "TENANT_READ_ONLY" });
      await orm.em.fork().nativeUpdate(Tenant, { code: "prod" }, { readOnly: false });
      expect(await untouched(transfer.id)).toEqual(before);
    });

    it("refuses a posting whose physical leg no longer matches it, before anything changes", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("60"), ACTOR);
      const em = scoped();
      const loaded = await em.findOneOrFail(Transfer, { code: transfer.id }, { populate: ["material", "source", "destination"] });
      const [dispatchMovement] = await em.find(StockMovement, { type: TRANSFER_DISPATCH_MOVEMENT });
      const forged = (kind: "dispatch" | "receipt" | "write-off", quantity: string) => em.create(TransferPosting, {
        transfer: loaded, kind, businessDate: today(), quantity, enteredQuantity: quantity, enteredUnit: "kg", numerator: "1", denominator: "1",
        transitBefore: "0.000000", transitAfter: "0.000000", reason: "Forged", actorUserId: null, actorUsername: "x", channel: "ui",
      });
      const movement = (postingId: string, type: string, quantity: string, location = loaded.destination) => em.create(StockMovement, {
        ...dispatchMovement, id: undefined, postingId, type, quantity, location, position: 0,
      } as never);
      const strayWriteOff = forged("write-off", "1.000000");
      const noLeg = forged("receipt", "1.000000");
      const wrongType = forged("receipt", "1.000000");
      const wrongQuantity = forged("receipt", "1.000000");
      const tooMuch = forged("receipt", "1.000000");
      await em.flush();
      movement(strayWriteOff.id, "correction", "1.000000");
      movement(wrongType.id, "correction", "1.000000");
      movement(wrongQuantity.id, TRANSFER_RECEIPT_MOVEMENT, "2.000000");
      movement(tooMuch.id, TRANSFER_RECEIPT_MOVEMENT, "1.000000");
      await em.flush();
      const before = await untouched(transfer.id);
      for (const posting of [strayWriteOff, noLeg, wrongType, wrongQuantity, tooMuch]) {
        await expect(service().reverse(transfer.id, posting.id, reason, ACTOR)).rejects.toMatchObject({ code: "STOCK_REVERSAL_INCONSISTENT" });
      }
      expect(await untouched(transfer.id)).toEqual(before);
    });

    it("rolls back both legs, the link and progress when the reversal's audit fails after the stock flush", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("60"), ACTOR);
      const receipt = (await service().receive(transfer.id, kg("50"), ACTOR)).posting;
      const before = await untouched(transfer.id);
      crash.action = "transfers.transfer.reversed";
      await expect(service().reverse(transfer.id, receipt.id, reason, ACTOR)).rejects.toThrow("crash while recording");
      expect(await untouched(transfer.id)).toEqual(before);
    });

    it("lets only one of two racing reversals post, the other retried into the existing one", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("60"), ACTOR);
      const receipt = (await service().receive(transfer.id, kg("50"), ACTOR)).posting;
      const other = await initOrm(toDbOptions(loadConfig({ DATA_DIR: directory })));
      let raced = false;
      try {
        const em = scoped();
        await expect(retryingStaleSnapshot(() => inRequestTransaction(em, async () => {
          await new TransferService({ em }).get(transfer.id);
          if (!raced) {
            raced = true;
            await new TransferService({ em: scoped("prod", other) }).reverse(transfer.id, receipt.id, reason, ACTOR);
          }
          return new TransferService({ em }).reverse(transfer.id, receipt.id, reason, ACTOR);
        }))).rejects.toMatchObject({ code: "TRANSFER_POSTING_ALREADY_REVERSED" });
        expect([await scoped().count(TransferReversal, {}), await physical(B)]).toEqual([1, "0.000000"]);
      } finally {
        await other.close();
      }
    });

    it("names the existing reversal when a unique violation slips past the check, and maps a version race", async () => {
      const transfer = await created();
      await service().dispatch(transfer.id, kg("60"), ACTOR);
      const receipt = (await service().receive(transfer.id, kg("50"), ACTOR)).posting;
      const em = scoped();
      const transfers = new TransferService({ em });
      const transactional = vi.spyOn(em, "transactional");
      transactional.mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      expect(await transfers.reverse(transfer.id, receipt.id, reason, ACTOR).catch((error: unknown) => error)).toMatchObject({ code: "TRANSFER_POSTING_ALREADY_REVERSED", messageParams: undefined });
      const reversed = await service().reverse(transfer.id, receipt.id, reason, ACTOR);
      transactional.mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("UNIQUE")));
      await expect(transfers.reverse(transfer.id, receipt.id, reason, ACTOR)).rejects.toMatchObject({ messageParams: { reversal: reversed.reversal.id } });
      transactional.mockRejectedValueOnce(new OptimisticLockError("stale"));
      await expect(transfers.reverse(transfer.id, receipt.id, reason, ACTOR)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    });
  });
});
