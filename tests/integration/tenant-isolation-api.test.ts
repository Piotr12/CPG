import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own token and records: other files share the app, and nothing here is ever deleted.
const ADMIN_TOKEN = "isoapi-ops";

interface MaterialRow {
  id: string;
  description: string;
  version: number;
}

interface LocationRow {
  id: string;
  name: string;
  version: number;
}

interface AuditEntry {
  action: string;
  subject: { id: string; label: string };
  actor: { username: string };
  channel: string;
  token: { name: string } | null;
}

const api = (method: string, path: string, secret: string, options?: { key?: string; body?: unknown; generation?: number }) =>
  callApi(baseUrl, method, path, secret, options);
/** A write as a well-behaved client sends it: a fresh Idempotency-Key, and the body. */
const write = (method: string, path: string, secret: string, body?: unknown, generation?: number) =>
  api(method, path, secret, { key: randomUUID(), body, generation });

/** A tenant audit's rows on the screen, as cells: time, account, session, channel, action, subject, changes. */
async function screenAudit(browser: Browser, tenant: string): Promise<string[][]> {
  await browser.open(`${baseUrl}/admin/${tenant}/audit`);
  await browser.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
  return browser.evaluate<string[][]>(
    `[...document.querySelectorAll("main tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
  );
}

/** The heading of a tenant's material page, once it is shown. */
async function materialHeading(browser: Browser, tenant: string, id: string): Promise<string> {
  await browser.open(`${baseUrl}/admin/${tenant}/materials/${id}`);
  await browser.waitUntil(`document.querySelector("main h1") && !document.querySelector("main h1").closest("[hidden]")`);
  return browser.text("main h1");
}

// Tenant isolation and the tenant-scoped API contract, end to end (E02-S01, E02-S03, R05, R07):
// TEN-012, API-013, API-024, API-034, AUD-007.
describe("tenant isolation through the API", () => {
  let admin: Browser;
  let adminSecret: string;
  let generation: number;
  const testGeneration = async () =>
    (json(await api("GET", "/api/tenants/test", adminSecret)).data as { generation: number }).generation;

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, ADMIN_TOKEN);
    generation = await testGeneration();
  });
  afterAll(async () => {
    try {
      // Other files expect the admin to hold no tokens: revoke this file's with itself.
      if (adminSecret) {
        const own = (json(await api("GET", "/api/tokens", adminSecret)).data as { id: string; name: string }[]).find(
          (token) => token.name === ADMIN_TOKEN,
        );
        expect(own).toBeDefined();
        expect((await write("DELETE", `/api/tokens/${own!.id}`, adminSecret)).status).toBe(200);
      }
    } finally {
      await admin.close();
    }
  });

  it("keeps a material and a location created in Test out of Prod (R05)", async () => {
    const material = await write(
      "POST",
      "/api/tenants/test/materials",
      adminSecret,
      { type: "raw", description: "isoapi test-only sheet", baseUnit: "kg" },
      generation,
    );
    const location = await write("POST", "/api/tenants/test/locations", adminSecret, { name: "isoapi test-only depot" }, generation);
    expect([material.status, location.status]).toEqual([200, 200]);
    const { id: materialId } = json(material).data as MaterialRow;
    const { id: locationId } = json(location).data as LocationRow;

    // Read back in Test: both are there.
    expect(json(await api("GET", `/api/tenants/test/materials/${materialId}`, adminSecret)).data).toMatchObject({
      description: "isoapi test-only sheet",
    });
    expect(json(await api("GET", `/api/tenants/test/locations/${locationId}`, adminSecret)).data).toMatchObject({
      name: "isoapi test-only depot",
    });
    // Prod has neither (Prod numbers on its own, so the same IDs may name other records there).
    const prodMaterials = json(await api("GET", "/api/tenants/prod/materials", adminSecret)).data as MaterialRow[];
    const prodLocations = json(await api("GET", "/api/tenants/prod/locations", adminSecret)).data as LocationRow[];
    expect(prodMaterials.map(({ description }) => description)).not.toContain("isoapi test-only sheet");
    expect(prodLocations.map(({ name }) => name)).not.toContain("isoapi test-only depot");
  });

  it("reads material 00000001 in each tenant as that tenant's own record, through the API and on the screens (TEN-012)", async () => {
    // Prod numbers from 00000001 too: create its first material unless an earlier file already has.
    if ((await api("GET", "/api/tenants/prod/materials/00000001", adminSecret)).status === 404) {
      const created = await write("POST", "/api/tenants/prod/materials", adminSecret, {
        type: "raw",
        description: "isoapi prod sheet",
        baseUnit: "kg",
      });
      expect(json(created).data.id).toBe("00000001");
    }

    const test = json(await api("GET", "/api/tenants/test/materials/00000001", adminSecret)).data as MaterialRow;
    const prod = json(await api("GET", "/api/tenants/prod/materials/00000001", adminSecret)).data as MaterialRow;

    expect(test).toMatchObject({ id: "00000001", description: "Steel sheet 2 mm" });
    expect(prod.id).toBe("00000001");
    expect(prod.description).not.toBe(test.description);
    expect(await materialHeading(admin, "test", "00000001")).toBe("00000001 — Steel sheet 2 mm");
    expect(await materialHeading(admin, "prod", "00000001")).toBe(`00000001 — ${prod.description}`);
  });

  it.each(["/api/materials", "/api/materials/00000001", "/api/locations", "/api/customers", "/api/suppliers"])(
    "answers the tenant-less path %s with 404 (API-013)",
    async (path) => {
      const read = await api("GET", path, adminSecret);
      const created = await write("POST", path, adminSecret, { type: "raw", description: "isoapi no tenant", baseUnit: "kg", name: "isoapi no tenant" });

      expect(read.status).toBe(404);
      expect(created.status).toBe(404);
      // Nothing landed in either tenant instead.
      for (const tenant of ["test", "prod"]) {
        for (const kind of ["materials", "locations"]) {
          const records = json(await api("GET", `/api/tenants/${tenant}/${kind}`, adminSecret)).data as { description?: string; name?: string }[];
          expect(records.map((record) => record.description ?? record.name)).not.toContain("isoapi no tenant");
        }
      }
    },
  );

  it("runs one Idempotency-Key sent to Test and then to Prod as two independent writes (API-024)", async () => {
    const key = randomUUID();

    const inTest = await api("POST", "/api/tenants/test/locations", adminSecret, { key, body: { name: "isoapi keyed test" }, generation });
    const inProd = await api("POST", "/api/tenants/prod/locations", adminSecret, { key, body: { name: "isoapi keyed prod" } });

    expect([inTest.status, inProd.status]).toEqual([200, 200]);
    expect([inTest.replayed, inProd.replayed]).toEqual([null, null]);
    const testRecord = json(inTest).data as LocationRow;
    const prodRecord = json(inProd).data as LocationRow;
    expect(json(await api("GET", `/api/tenants/test/locations/${testRecord.id}`, adminSecret)).data).toMatchObject({ name: "isoapi keyed test" });
    expect(json(await api("GET", `/api/tenants/prod/locations/${prodRecord.id}`, adminSecret)).data).toMatchObject({ name: "isoapi keyed prod" });
    const testNames = (json(await api("GET", "/api/tenants/test/locations", adminSecret)).data as LocationRow[]).map(({ name }) => name);
    const prodNames = (json(await api("GET", "/api/tenants/prod/locations", adminSecret)).data as LocationRow[]).map(({ name }) => name);
    expect(testNames).not.toContain("isoapi keyed prod");
    expect(prodNames).not.toContain("isoapi keyed test");
  });

  it("refuses a Dataset-Generation that isn't the current one with 409 GENERATION_STALE, creating nothing (API-034)", async () => {
    const current = await testGeneration();
    const prodGeneration = (json(await api("GET", "/api/tenants/prod", adminSecret)).data as { generation: number }).generation;
    const before = (json(await api("GET", "/api/tenants/test/locations", adminSecret)).data as LocationRow[]).length;

    // Any well-formed number but the current one (0 isn't well-formed: that is 428 GENERATION_REQUIRED).
    const responses = [
      await write("POST", "/api/tenants/test/locations", adminSecret, { name: "isoapi stale" }, current + 1),
      await write("POST", "/api/tenants/test/locations", adminSecret, { name: "isoapi stale" }, current + 41),
      // Optional for Prod, but checked when sent.
      await write("POST", "/api/tenants/prod/locations", adminSecret, { name: "isoapi stale" }, prodGeneration + 1),
    ];

    for (const response of responses) {
      expect(response.status).toBe(409);
      expect(json(response).error.code).toBe("GENERATION_STALE");
    }
    const test = json(await api("GET", "/api/tenants/test/locations", adminSecret)).data as LocationRow[];
    const prod = json(await api("GET", "/api/tenants/prod/locations", adminSecret)).data as LocationRow[];
    expect(test).toHaveLength(before);
    expect([...test, ...prod].map(({ name }) => name)).not.toContain("isoapi stale");
  });

  it("names the token, never its secret, for a material and a location changed through the API (AUD-007)", async () => {
    const material = json(
      await write("POST", "/api/tenants/prod/materials", adminSecret, { type: "raw", description: "isoapi audited rod", baseUnit: "kg" }),
    ).data as MaterialRow;
    const location = json(await write("POST", "/api/tenants/prod/locations", adminSecret, { name: "isoapi audited yard" })).data as LocationRow;
    const edited = await write("PATCH", `/api/tenants/prod/materials/${material.id}`, adminSecret, {
      version: material.version,
      description: "isoapi audited rod 8 mm",
    });
    const renamed = await write("PATCH", `/api/tenants/prod/locations/${location.id}`, adminSecret, {
      version: location.version,
      name: "isoapi audited yard east",
    });
    expect([edited.status, renamed.status]).toEqual([200, 200]);

    const audit = json(await api("GET", "/api/tenants/prod/audit?limit=100", adminSecret));
    // Every one of this test's writes, each naming the token; sorted, as entries of one millisecond come in any order.
    const changes = (audit.data.entries as AuditEntry[])
      .filter(({ subject }) => [material.id, location.id].includes(subject.id) && subject.label.includes("isoapi audited"))
      .map(({ action, actor, channel, token }) => [action, actor.username, channel, token?.name ?? null])
      .sort();
    expect(changes).toEqual([
      ["locations.location.created", "admin", "api", ADMIN_TOKEN],
      ["locations.location.updated", "admin", "api", ADMIN_TOKEN],
      ["materials.material.created", "admin", "api", ADMIN_TOKEN],
      ["materials.material.updated", "admin", "api", ADMIN_TOKEN],
    ]);
    expect(JSON.stringify(audit)).not.toContain(adminSecret);

    const rows = await screenAudit(admin, "prod");
    const own = rows
      .filter((cells) => cells[5].startsWith(`${material.id} — isoapi audited rod`) || cells[5].startsWith(`${location.id} — isoapi audited yard`))
      .map(([, account, , channel, action]) => [account, channel.replace(/\s+/g, " "), action])
      .sort();
    expect(own).toEqual([
      ["admin", `API ${ADMIN_TOKEN}`, "Location created"],
      ["admin", `API ${ADMIN_TOKEN}`, "Location renamed"],
      ["admin", `API ${ADMIN_TOKEN}`, "Material changed"],
      ["admin", `API ${ADMIN_TOKEN}`, "Material created"],
    ]);
    expect(await admin.evaluate<string>("document.body.innerText")).not.toContain(adminSecret);
  });
});
