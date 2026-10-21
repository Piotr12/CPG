import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { CompletionPreview, CompletionResult, CompletionView, ProductionOrderDetail } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin, signedInAndHydrated } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const password = inject("adminPassword");
const orders = "/api/tenants/prod/production-orders";
const userPassword = "completion normal user password";
const dialog = "[role=dialog][data-state=open]";

describe("production completions in the UI and API", () => {
  let admin: Browser;
  let user: Browser;
  let secret: string;
  let userSecret: string;
  let bar: string;
  let cocoa: string;
  let wrapper: string;
  let milk: string;
  let giftBox: string;
  let plant: string;
  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, token = secret) => callApi(baseUrl, method, path, token, options);
  const write = (method: string, path: string, body: unknown, token = secret) => api(method, path, { body, key: randomUUID() }, token);
  const createMaster = async (kind: string, body: unknown) => {
    const response = await write("POST", `/api/tenants/prod/${kind}`, body);
    expect(response.status).toBe(200);
    return json(response).data.id as string;
  };
  const stock = async (material: string) => json(await api("GET", `/api/tenants/prod/stock?material=${material}&location=${plant}`)).data as { quantity: string; movements: { type: string; postingId: string; quantity: string }[] };
  const order = async (target: string) => {
    const response = await write("POST", orders, { output: bar, location: plant, quantity: target, unit: "each", plannedFinish: "2026-11-02" });
    expect(response.status).toBe(200);
    return json(response).data as ProductionOrderDetail;
  };
  const completions = (id: string) => `${orders}/${id}/completions`;
  const used = (output: string, cocoaKg: string, wrappers: string, extras: { material: string; quantity: string; unit: string }[] = []) => ({
    quantity: output,
    unit: "each",
    components: [{ material: cocoa, quantity: cocoaKg, unit: "kg" }, { material: wrapper, quantity: wrappers, unit: "each" }, ...extras],
  });

  beforeAll(async () => {
    admin = openBrowser();
    user = openBrowser();
    await signInAsAdmin(admin, baseUrl, password);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, "completion-admin");
    expect((await write("POST", "/api/users", { username: "completion-cora", password: userPassword })).status).toBe(200);
    await signIn(user, baseUrl, userPassword, "completion-cora");
    await user.waitUntil(signedInAndHydrated("completion-cora"));
    await openTokens(user, baseUrl);
    userSecret = await createToken(user, "completion-user");
    bar = await createMaster("materials", { type: "finished", description: "completion chocolate bar", baseUnit: "each" });
    cocoa = await createMaster("materials", { type: "raw", description: "completion cocoa", baseUnit: "kg" });
    wrapper = await createMaster("materials", { type: "raw", description: "completion wrapper", baseUnit: "each" });
    milk = await createMaster("materials", { type: "raw", description: "completion milk powder", baseUnit: "kg" });
    giftBox = await createMaster("materials", { type: "finished", description: "completion gift box", baseUnit: "each" });
    plant = await createMaster("locations", { name: "completion plant" });
    expect((await write("POST", "/api/tenants/prod/planning-parameters", { material: bar, location: plant, procurement: "make", leadTimeDays: 3, minimumQuantity: "1", lotMultiple: "1" })).status).toBe(200);
    await createMaster("boms", {
      output: bar,
      priority: 1,
      validFrom: "2026-01-01",
      validThrough: null,
      components: [{ material: cocoa, quantity: "0.5", unit: "kg" }, { material: wrapper, quantity: "2", unit: "each" }],
    });
    for (const [material, quantity] of [[cocoa, "100"], [wrapper, "300"], [milk, "10"]]) {
      expect((await write("POST", "/api/tenants/prod/stock/corrections", { material, location: plant, quantity, unit: material === wrapper ? "each" : "kg", reason: "Opening completion stock" })).status).toBe(200);
    }
  });

  afterAll(async () => {
    if (secret) {
      await write("PATCH", "/api/tenants/prod", { readOnly: false });
      const tokens = json(await api("GET", "/api/tokens")).data as { id: string; name: string }[];
      const own = tokens.find(({ name }) => name === "completion-admin");
      if (own) await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    }
    await Promise.all([admin?.close(), user?.close()]);
  });

  it("pre-fills, posts partial completions atomically with variance, and replays a key without posting twice (PRD-010/011/012/013, INV-004, INV-025)", async () => {
    const planned = await order("100");
    const preview = json(await api("GET", `${completions(planned.id)}/preview?quantity=4&unit=each`, {}, userSecret)).data as CompletionPreview;
    expect(preview.components.map(({ material, expected }) => [material, expected])).toEqual([[cocoa, "2.000000"], [wrapper, "8.000000"]]);

    const key = randomUUID();
    const body = used("40", "18", "80");
    const first = await api("POST", completions(planned.id), { key, body }, userSecret);
    expect(first.status).toBe(200);
    const posted = json(first).data as CompletionResult;
    expect(posted.order).toMatchObject({ produced: "40.000000", outstanding: "60.000000", status: "open" });
    expect(posted.completion.lines[0]).toMatchObject({ material: cocoa, expected: "20.000000", actual: "18.000000", variance: "-2.000000" });
    const replay = await api("POST", completions(planned.id), { key, body }, userSecret);
    expect(replay.replayed).toBe("true");
    expect(json(replay).data.completion.id).toBe(posted.completion.id);
    expect([(await stock(bar)).quantity, (await stock(cocoa)).quantity, (await stock(wrapper)).quantity]).toEqual(["40.000000", "82.000000", "220.000000"]);
    const groups = new Set([...(await stock(bar)).movements, ...(await stock(cocoa)).movements].filter(({ type }) => type === "production-completion").map(({ postingId }) => postingId));
    expect(groups.size).toBe(1);

    expect((await write("POST", completions(planned.id), used("25", "12.5", "50"))).status).toBe(200);
    const history = json(await api("GET", completions(planned.id))).data as CompletionView[];
    expect(history.map(({ quantity }) => quantity)).toEqual(["25.000000", "40.000000"]);
    expect(json(await api("GET", `${orders}/${planned.id}`)).data).toMatchObject({ produced: "65.000000", outstanding: "35.000000" });
  });

  it("refuses an overdraw or a finished input with nothing posted, records waste, and completes past the target only when accepted (PRD-017/018/019/020)", async () => {
    const planned = await order("10");
    const before = (await stock(cocoa)).quantity;
    const short = await write("POST", completions(planned.id), used("1", "1000", "2"));
    expect(short.status).toBe(409);
    expect(json(short).error).toMatchObject({ code: "INSUFFICIENT_STOCK", params: { material: cocoa } });
    const finished = await write("POST", completions(planned.id), used("1", "0.5", "2", [{ material: giftBox, quantity: "1", unit: "each" }]));
    expect(finished.status).toBe(400);
    expect(Object.keys(json(finished).error.fieldErrors)).toEqual(["components.2.material"]);
    expect((await stock(cocoa)).quantity).toBe(before);
    expect(json(await api("GET", completions(planned.id))).data).toEqual([]);

    const waste = json(await write("POST", completions(planned.id), used("0", "1", "0"))).data as CompletionResult;
    expect(waste.completion).toMatchObject({ waste: true, quantity: "0.000000" });
    expect(waste.order).toMatchObject({ produced: "0.000000", status: "open" });

    const over = await write("POST", completions(planned.id), used("12", "6", "24"));
    expect(over.status).toBe(409);
    expect(json(over).error).toMatchObject({ code: "PRODUCTION_OVERPRODUCTION", params: { target: "10.000000", output: "12.000000" } });
    const accepted = json(await write("POST", completions(planned.id), { ...used("12", "6", "24"), acceptOverproduction: true })).data as CompletionResult;
    expect(accepted.order).toMatchObject({ produced: "12.000000", outstanding: "0.000000", status: "completed" });
    expect((await write("POST", completions(planned.id), used("0", "1", "0"))).status).toBe(409);
  });

  it("lets a normal user post a completion from the order page with the recipe pre-filled and an added input (PRD-010, PRD-015)", async () => {
    const planned = await order("50");
    await user.setViewport(1280, 800);
    await user.open(`${baseUrl}/admin/prod/production-orders/${planned.id}`);
    const trigger = '[...document.querySelectorAll("main button")].find((button) => button.textContent.trim() === "Post completion" && Object.keys(button).some((key) => key.startsWith("__reactFiber")))';
    await user.waitUntil(trigger);
    await user.clickRole("button", "Post completion");
    await user.waitFor(dialog);
    await user.fill(`${dialog} [name=quantity]`, "4");
    await user.click(`${dialog} button[type=submit]`);
    await user.waitFor(`${dialog} [name="components.0.quantity"]`);
    expect(await user.evaluate<string[]>(`[...document.querySelectorAll('${dialog} input[name$=".quantity"]')].map((input) => input.value)`)).toEqual(["2", "8"]);
    await user.fill(`${dialog} [name="components.0.quantity"]`, "1.5");
    await user.clickRole("button", "Add input");
    await user.waitFor(`${dialog} [name="components.2.material"]`);
    await user.select(`${dialog} [name="components.2.material"]`, milk);
    await user.fill(`${dialog} [name="components.2.quantity"]`, "0.5");
    await user.click(`${dialog} button[type=submit]`);
    await user.waitUntil('![...document.querySelectorAll("[role=dialog], [data-slot=dialog-overlay]")].some((el) => el.getClientRects().length > 0)');
    await user.waitUntil('[...document.querySelectorAll("main [role=status]")].some((status) => /^Completion \\d{8} posted\\.$/.test(status.textContent))');
    await user.waitForText("variance -0.5");

    const [posted] = json(await api("GET", completions(planned.id))).data as CompletionView[];
    expect(posted).toMatchObject({ quantity: "4.000000" });
    expect(posted.lines.map(({ material, actual, extra }) => [material, actual, extra])).toEqual([[cocoa, "1.500000", false], [wrapper, "8.000000", false], [milk, "0.500000", true]]);
    expect(json(await api("GET", `${orders}/${planned.id}`)).data).toMatchObject({ produced: "4.000000", outstanding: "46.000000" });
    await user.setViewport(390, 844);
    expect(await user.evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth")).toBe(true);
  });

  it("refuses completions in a read-only tenant, leaving stock and history unchanged, while the preview and history stay readable (E2E-011, INV-022)", async () => {
    const planned = await order("5");
    const ledgers = () => Promise.all([bar, cocoa, wrapper].map(stock));
    const before = await ledgers();
    expect((await write("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
    try {
      expect((await write("POST", completions(planned.id), used("1", "0.5", "2"), userSecret)).status).toBe(409);
      expect((await api("GET", `${completions(planned.id)}/preview?quantity=1&unit=each`, {}, userSecret)).status).toBe(200);
      const history = await api("GET", completions(planned.id), {}, userSecret);
      expect(history.status).toBe(200);
      expect(json(history).data).toEqual([]);
      expect(await ledgers()).toEqual(before);
      expect(json(await api("GET", `${orders}/${planned.id}`, {}, userSecret)).data).toMatchObject({ produced: "0.000000", outstanding: "5.000000", version: planned.version });
      await user.setViewport(1280, 800);
      await user.open(`${baseUrl}/admin/prod/production-orders/${planned.id}`);
      await user.waitForText("No completions yet");
      expect(await user.evaluate<number>('[...document.querySelectorAll("main button")].filter((button) => button.textContent.trim() === "Post completion").length')).toBe(0);
    } finally {
      await write("PATCH", "/api/tenants/prod", { readOnly: false });
    }
    expect((await write("POST", completions(planned.id), used("1", "0.5", "2"), userSecret)).status).toBe(200);
  });
});
