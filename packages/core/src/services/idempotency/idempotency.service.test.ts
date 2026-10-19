import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GlobalIdempotencyKey, initOrm, Tenant, TenantIdempotencyKey, User, selectTenant, type Orm } from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { ConflictError } from "../../http/errors";
import type { AuditActor } from "../audit/actor";
import { TenantService } from "../tenants/tenant.service";
import { UserService } from "../users/user.service";
import { fingerprintOf, operationOf, type WriteRequest } from "./fingerprint";
import { IDEMPOTENCY_TTL_MS, IdempotencyService, type IdempotencyScope, type IdempotentWrite } from "./idempotency.service";

const ALICE = "4b0c1c5e-0000-4000-8000-00000000000a";
const BOB = "4b0c1c5e-0000-4000-8000-00000000000b";
const ACTOR: AuditActor = { userId: ALICE, username: "admin", sessionId: null, channel: "api", token: { id: "t1", name: "agent" } };
const GLOBAL: IdempotencyScope = { kind: "global" };
/** Long enough for real work, short enough that a transaction waiting on itself fails the test. */
const NO_HANG = 5_000;

/** A keyed write as the API wrapper would describe it. */
async function keyed(
  overrides: Partial<WriteRequest> & { userId?: string; key?: string } = {},
  options: { secret?: boolean } = {},
): Promise<IdempotentWrite> {
  const { userId = ALICE, key = "k1", ...rest } = overrides;
  const request: WriteRequest = { method: "POST", path: "/api/users", body: { username: "carol" }, ...rest };
  return { userId, key, operation: operationOf(request), fingerprint: await fingerprintOf(request, options) };
}

describe("IdempotencyService", () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-idempotency-")) });
  let orm: Orm;

  /** One request scope: the services share its `em`, as the cradle's scoped registrations do. */
  function scope(target: Orm = orm, tenant?: "test" | "prod") {
    const em = target.em.fork();
    if (tenant) selectTenant(em, tenant);
    const tenantService = new TenantService({ em });
    return { em, idempotency: new IdempotencyService({ em, tenantService }), users: new UserService({ em }) };
  }
  const globalKeys = () => orm.em.fork().find(GlobalIdempotencyKey, {});
  const usernames = async () => (await orm.em.fork().find(User, {}, { orderBy: { username: "asc" } })).map((u) => u.username);

  beforeAll(async () => {
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
  });
  afterAll(() => orm.close());
  beforeEach(async () => {
    await orm.em.fork().nativeDelete(GlobalIdempotencyKey, {});
    await orm.em.fork().nativeDelete(User, {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("a first write", () => {
    it("runs the write once and stores its result with the key, as JSON", async () => {
      const write = vi.fn(async () => ({ id: "u1", createdAt: new Date("2026-10-19T16:00:00Z") }));

      await expect(scope().idempotency.run(await keyed(), GLOBAL, write)).resolves.toEqual({
        data: { id: "u1", createdAt: new Date("2026-10-19T16:00:00Z") },
        replayed: false,
      });
      expect(write).toHaveBeenCalledOnce();
      expect(await globalKeys()).toEqual([
        expect.objectContaining({
          userId: ALICE,
          key: "k1",
          operation: "POST /api/users",
          fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
          response: { id: "u1", createdAt: "2026-10-19T16:00:00.000Z" },
        }),
      ]);
    });

    it("stores null for a write that returns nothing", async () => {
      await scope().idempotency.run(await keyed(), GLOBAL, async () => undefined);

      expect((await globalKeys())[0].response).toBeNull();
    });
  });

  describe("a repeat", () => {
    it("with the same request replays the stored JSON and writes nothing", async () => {
      await scope().idempotency.run(await keyed(), GLOBAL, async () => ({ createdAt: new Date("2026-10-19T16:00:00Z") }));
      const write = vi.fn();

      await expect(scope().idempotency.run(await keyed(), GLOBAL, write)).resolves.toEqual({
        data: { createdAt: "2026-10-19T16:00:00.000Z" },
        replayed: true,
      });
      expect(write).not.toHaveBeenCalled();
      expect(await globalKeys()).toHaveLength(1);
    });

    it("matches a body regardless of its key order", async () => {
      await scope().idempotency.run(await keyed({ body: { a: 1, b: 2 } }), GLOBAL, async () => "first");

      await expect(scope().idempotency.run(await keyed({ body: { b: 2, a: 1 } }), GLOBAL, vi.fn())).resolves.toEqual({
        data: "first",
        replayed: true,
      });
    });

    it("with a different body is IDEMPOTENCY_KEY_REUSED and runs nothing (API-022)", async () => {
      await scope().idempotency.run(await keyed(), GLOBAL, async () => "first");
      const write = vi.fn();

      const error = await scope()
        .idempotency.run(await keyed({ body: { username: "dave" } }), GLOBAL, write)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect(error).toMatchObject({
        code: "IDEMPOTENCY_KEY_REUSED",
        status: 409,
        message: "This Idempotency-Key was already used with a different body. Use a new key for a new write.",
      });
      expect(write).not.toHaveBeenCalled();
    });

    it("for another operation is IDEMPOTENCY_KEY_REUSED naming the first one (API-023)", async () => {
      await scope().idempotency.run(await keyed(), GLOBAL, async () => "first");

      await expect(
        scope().idempotency.run(await keyed({ method: "PATCH", path: "/api/users/u1" }), GLOBAL, vi.fn()),
      ).rejects.toMatchObject({
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "This Idempotency-Key was already used for another request (POST /api/users). Use a new key for a new write.",
      });
    });

    it("from another account runs as a new write (API-025)", async () => {
      await scope().idempotency.run(await keyed(), GLOBAL, async () => "alice's");
      const write = vi.fn(async () => "bob's");

      await expect(scope().idempotency.run(await keyed({ userId: BOB }), GLOBAL, write)).resolves.toEqual({
        data: "bob's",
        replayed: false,
      });
      expect(await globalKeys()).toHaveLength(2);
    });
  });

  describe("a failed write", () => {
    it("stores nothing, so a retry with the key runs again", async () => {
      const failing = vi.fn(async () => {
        throw new ConflictError("Not now.");
      });
      await expect(scope().idempotency.run(await keyed(), GLOBAL, failing)).rejects.toThrow("Not now.");
      expect(await globalKeys()).toEqual([]);

      await expect(scope().idempotency.run(await keyed(), GLOBAL, async () => "second")).resolves.toEqual({
        data: "second",
        replayed: false,
      });
    });

    it("rolls back what the write changed through the scope's services", async () => {
      const { idempotency, users } = scope();
      await expect(
        idempotency.run(await keyed(), GLOBAL, async () => {
          await users.create({ username: "rolled-back", password: "a password 123" }, ACTOR);
          throw new Error("after the write");
        }),
      ).rejects.toThrow("after the write");

      expect(await usernames()).toEqual([]);
    });
  });

  describe("the 24-hour window (API-026)", () => {
    it("replays until just before 24 hours, then lets the key run anew and purges the old record", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T12:00:00Z") });
      await scope().idempotency.run(await keyed(), GLOBAL, async () => "first");

      vi.setSystemTime(new Date("2026-10-19T12:00:00Z").getTime() + IDEMPOTENCY_TTL_MS - 1);
      await expect(scope().idempotency.run(await keyed(), GLOBAL, vi.fn())).resolves.toEqual({
        data: "first",
        replayed: true,
      });

      vi.setSystemTime(new Date("2026-10-19T12:00:00Z").getTime() + IDEMPOTENCY_TTL_MS);
      await expect(
        scope().idempotency.run(await keyed({ body: { username: "other" } }), GLOBAL, async () => "fresh"),
      ).resolves.toEqual({ data: "fresh", replayed: false });
      expect((await globalKeys()).map((k) => k.response)).toEqual(["fresh"]);
    });

    it("purges every account's expired records, not only the caller's", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T12:00:00Z") });
      await scope().idempotency.run(await keyed({ userId: BOB, key: "old" }), GLOBAL, async () => "old");

      vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
      await scope().idempotency.run(await keyed({ key: "new" }), GLOBAL, async () => "new");

      expect((await globalKeys()).map((k) => k.key)).toEqual(["new"]);
    });
  });

  describe("a body carrying a password (spec Q4)", () => {
    it("stores an argon2id fingerprint, replays the same body and refuses another", async () => {
      const password = { body: { username: "carol", password: "secret password 1" } };
      await scope().idempotency.run(await keyed(password, { secret: true }), GLOBAL, async () => "created");

      const [stored] = await globalKeys();
      expect(stored.fingerprint).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(stored)).not.toContain("secret password 1");
      await expect(scope().idempotency.run(await keyed(password, { secret: true }), GLOBAL, vi.fn())).resolves.toEqual({
        data: "created",
        replayed: true,
      });
      await expect(
        scope().idempotency.run(
          await keyed({ body: { username: "carol", password: "another password 2" } }, { secret: true }),
          GLOBAL,
          vi.fn(),
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    });
  });

  describe("transactions (spec Q6)", () => {
    it(
      "joins the service's own transaction and flush instead of waiting on the connection",
      async () => {
        const { idempotency, users } = scope();
        const created = await users.create({ username: "target", password: "a password 123" }, ACTOR);

        const result = await idempotency.run(await keyed(), GLOBAL, () =>
          users.setActive(created.id, false, ACTOR).then(() =>
            users.create({ username: "also", password: "a password 123" }, ACTOR),
          ),
        );

        expect(result).toMatchObject({ data: { username: "also" }, replayed: false });
        expect(await usernames()).toEqual(["also", "target"]);
        expect((await orm.em.fork().findOneOrFail(User, { username: "target" })).active).toBe(false);
      },
      NO_HANG,
    );

    it(
      "rolls the write back with its key when another writer stored the key first, then tries once more",
      async () => {
        const { em, idempotency, users } = scope();
        let calls = 0;
        const write = async () => {
          calls++;
          const user = await users.create({ username: "raced", password: "a password 123" }, ACTOR);
          // The first time, a "concurrent" writer has stored this key: our insert of it must fail.
          if (calls === 1) {
            em.create(GlobalIdempotencyKey, { userId: ALICE, key: "k1", operation: "X", fingerprint: "x", response: null });
            await em.flush();
          }
          return user;
        };

        await expect(idempotency.run(await keyed(), GLOBAL, write)).resolves.toMatchObject({
          data: { username: "raced" },
          replayed: false,
        });
        expect(calls).toBe(2);
        // The first attempt's user and key were rolled back; otherwise the second create would have
        // failed with USERNAME_TAKEN and the conflicting key would remain.
        expect(await usernames()).toEqual(["raced"]);
        expect((await globalKeys()).map((k) => k.operation)).toEqual(["POST /api/users"]);
      },
      NO_HANG,
    );

    it(
      "gives up after a second lost race, leaving nothing behind",
      async () => {
        const { em, idempotency } = scope();
        const write = async () => {
          em.create(GlobalIdempotencyKey, { userId: ALICE, key: "k1", operation: "X", fingerprint: "x", response: null });
          await em.flush();
          return "never stored";
        };

        await expect(idempotency.run(await keyed(), GLOBAL, write)).rejects.toThrow("idempotency key stored concurrently");
        expect(await globalKeys()).toEqual([]);
      },
      NO_HANG,
    );

    it("passes through a database error that isn't a key race", async () => {
      const { em, idempotency } = scope();
      vi.spyOn(em, "flush").mockRejectedValueOnce(new Error("disk full"));

      await expect(idempotency.run(await keyed(), GLOBAL, async () => "x")).rejects.toThrow("disk full");
      expect(await globalKeys()).toEqual([]);
    });

    it(
      "writes once when two requests race on one key in one process",
      async () => {
        const [first, second] = [scope(), scope()];
        const create = (s: ReturnType<typeof scope>) => () =>
          s.users.create({ username: "once", password: "a password 123" }, ACTOR);

        const results = await Promise.all([
          first.idempotency.run(await keyed(), GLOBAL, create(first)),
          second.idempotency.run(await keyed(), GLOBAL, create(second)),
        ]);

        expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
        expect(await usernames()).toEqual(["once"]);
      },
      NO_HANG,
    );

    it(
      "writes once when two connections to the same file race on one key, the loser replaying",
      async () => {
        // Another Next.js bundle has its own connection. Both look the key up before either
        // writes; the second to write finds its snapshot stale ("database is locked"), rolls
        // back and, on its one retry, replays the winner's result.
        const other = await initOrm(toDbOptions(config));
        try {
          const [first, second] = [scope(), scope(other)];
          const create = (s: ReturnType<typeof scope>) => () =>
            s.users.create({ username: "across", password: "a password 123" }, ACTOR);

          const results = await Promise.all([
            first.idempotency.run(await keyed(), GLOBAL, create(first)),
            second.idempotency.run(await keyed(), GLOBAL, create(second)),
          ]);

          expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
          expect(await usernames()).toEqual(["across"]);
        } finally {
          await other.close();
        }
      },
      NO_HANG,
    );

    it("replays a record another connection stored, ignoring this scope's identity map", async () => {
      const current = scope();
      await current.idempotency.run(await keyed({ key: "seen" }), GLOBAL, async () => "first");
      const other = await initOrm(toDbOptions(config));
      try {
        await scope(other).idempotency.run(await keyed(), GLOBAL, async () => "from the other connection");
      } finally {
        await other.close();
      }

      await expect(current.idempotency.run(await keyed(), GLOBAL, vi.fn())).resolves.toEqual({
        data: "from the other connection",
        replayed: true,
      });
    });
  });

  describe("tenant writes", () => {
    const tenantScope = (tenant: "test" | "prod", generation: number | null, requireGeneration = tenant === "test") =>
      ({ kind: "tenant", tenant, generation, requireGeneration }) as const;
    const tenantKeys = (tenant: "test" | "prod") => {
      const em = orm.em.fork();
      selectTenant(em, tenant);
      return em.find(TenantIdempotencyKey, {});
    };

    beforeEach(async () => {
      for (const tenant of ["test", "prod"] as const) {
        const em = orm.em.fork();
        selectTenant(em, tenant);
        await em.nativeDelete(TenantIdempotencyKey, {});
      }
      await orm.em.fork().nativeUpdate(Tenant, {}, { generation: 1 });
    });

    it("stores the key in the tenant's store with the generation it was written in", async () => {
      await scope(orm, "test").idempotency.run(await keyed(), tenantScope("test", 1), async () => "in test");

      expect(await tenantKeys("test")).toEqual([expect.objectContaining({ key: "k1", generation: 1, response: "in test" })]);
      expect(await tenantKeys("prod")).toEqual([]);
      expect(await globalKeys()).toEqual([]);
    });

    it("keeps keys separate per tenant (API-024)", async () => {
      await scope(orm, "test").idempotency.run(await keyed(), tenantScope("test", 1), async () => "in test");

      await expect(
        scope(orm, "prod").idempotency.run(await keyed({ body: { other: true } }), tenantScope("prod", null), async () => "in prod"),
      ).resolves.toEqual({ data: "in prod", replayed: false });
    });

    it("refuses a Test write without a generation before any lookup (API-034)", async () => {
      const write = vi.fn();

      await expect(
        scope(orm, "test").idempotency.run(await keyed(), tenantScope("test", null), write),
      ).rejects.toMatchObject({ code: "GENERATION_REQUIRED", status: 428 });
      expect(write).not.toHaveBeenCalled();
    });

    it("refuses a stale generation, even for a key whose result is stored (API-033, TEN-030)", async () => {
      await scope(orm, "test").idempotency.run(await keyed(), tenantScope("test", 1), async () => "in G1");
      await orm.em.fork().nativeUpdate(Tenant, { code: "test" }, { generation: 2 });

      await expect(
        scope(orm, "test").idempotency.run(await keyed(), tenantScope("test", 1), vi.fn()),
      ).rejects.toMatchObject({ code: "GENERATION_STALE", status: 409 });
    });

    it("reads the generation fresh, not from a copy loaded earlier in the request", async () => {
      const current = scope(orm, "test");
      await current.em.findOneOrFail(Tenant, { code: "test" });
      await orm.em.fork().nativeUpdate(Tenant, { code: "test" }, { generation: 3 });

      await expect(current.idempotency.run(await keyed(), tenantScope("test", 1), vi.fn())).rejects.toMatchObject({
        code: "GENERATION_STALE",
      });
    });

    it("lets a Prod write without a generation through, and stores Prod's current one", async () => {
      await scope(orm, "prod").idempotency.run(await keyed(), tenantScope("prod", null), async () => "ok");

      expect(await tenantKeys("prod")).toEqual([expect.objectContaining({ generation: 1 })]);
    });

    it("purges the tenant's expired records", async () => {
      vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-19T12:00:00Z") });
      await scope(orm, "test").idempotency.run(await keyed({ key: "old" }), tenantScope("test", 1), async () => "old");

      vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
      await scope(orm, "test").idempotency.run(await keyed({ key: "new" }), tenantScope("test", 1), async () => "new");

      expect((await tenantKeys("test")).map((k) => k.key)).toEqual(["new"]);
    });
  });
});
