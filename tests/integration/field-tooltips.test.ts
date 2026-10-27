import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { chooseFromList, openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own token and records: other files share the app, and masters are never deleted.
const SETUP_TOKEN = "fttip-setup";

/** The open tooltip's visible text, the Popover content beside an info button. */
const TIP = "[data-slot=popover-content]";
const tipShown = `Boolean(document.querySelector(${JSON.stringify(TIP)}))`;
/** The info button named exactly `name` ("About Planned quantity"), once hydrated, in the open dialog. */
const infoButton = (name: string) =>
  `[...document.querySelectorAll("[role=dialog] button")].find((b) => b.getAttribute("aria-label") === ${JSON.stringify(name)} && Object.keys(b).some((key) => key.startsWith("__reactFiber")))`;
/** The open dialog's output or material picker (#217). */
const PICKER = (name: string) => `[role=dialog] :has(> input[name=${name}]) > input[role=combobox]`;

// UX-014 (#290): every production-order and master-data quantity field has an info tooltip that opens
// on hover, keyboard focus or a tap, says which unit the field takes, and stays inside a phone's screen.
describe("quantity-field tooltips", () => {
  let admin: Browser;
  let secret: string;
  let cement: string;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });

  /** Opens a list screen's Create or Add dialog once its button is hydrated. */
  async function openDialog(path: string, name: string) {
    await admin.open(`${baseUrl}${path}`);
    await admin.waitUntil(
      `[...document.querySelectorAll("main button")].some((b) => b.textContent.trim() === ${JSON.stringify(name)} && !b.closest("[hidden]") && Object.keys(b).some((key) => key.startsWith("__reactFiber")))`,
    );
    await admin.clickRole("button", name);
    await admin.waitFor("[role=dialog]");
  }

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await admin.setViewport(1280, 800);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    // A finished product kept in kg that also comes in 25 kg bags: the issue's example.
    cement = json(await api("POST", "/api/tenants/prod/materials", { type: "finished", description: "fttip cement mix", baseUnit: "kg" })).data.id;
    await api("POST", `/api/tenants/prod/materials/${cement}/conversions`, { unit: "bag", numerator: "25", denominator: "1" });
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === SETUP_TOKEN)!;
    await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    await admin.close();
  });

  it("opens Planned quantity's tooltip on keyboard focus, naming kg and bag, and Escape closes only the tooltip", async () => {
    await admin.setViewport(1280, 800);
    await openDialog("/admin/prod/production-orders", "Create production order");
    await chooseFromList(admin, PICKER("output"), cement, cement);

    // Tab back from the quantity input to its label's info button.
    await admin.waitUntil(`Boolean(${infoButton("About Planned quantity")})`);
    await admin.focus("[role=dialog] input[name=quantity]");
    await admin.press("Shift+Tab");
    await admin.waitUntil(tipShown);

    expect(await admin.evaluate<string | null>(`document.activeElement.getAttribute("aria-label")`)).toBe("About Planned quantity");
    const text = await admin.text(TIP);
    expect(text).toContain("Enter a target greater than 0 in kg or in a physical alternate unit this output converts, such as bag (not SU).");
    expect(text).toContain("into kg, rounded half up to six decimals, and keeps the unit and factor you entered with the order");

    await admin.press("Escape");
    await admin.waitUntil(`!${tipShown}`);
    expect(await admin.evaluate<boolean>(`Boolean(document.querySelector("[role=dialog]"))`)).toBe(true);
    await admin.press("Escape");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    expect(await admin.evaluate<boolean>(`Boolean(document.querySelector("[role=dialog]"))`)).toBe(false);
  });

  it("opens Minimum lot's tooltip on hover once the material is chosen, naming its base unit", async () => {
    await admin.setViewport(1280, 800);
    await openDialog("/admin/prod/planning-parameters", "Add parameters");
    await chooseFromList(admin, PICKER("material"), cement, cement);

    await admin.waitUntil(`Boolean(${infoButton("About Minimum lot")})`);
    await admin.hover('[role=dialog] button[aria-label="About Minimum lot"]');
    await admin.waitUntil(tipShown);

    expect(await admin.text(TIP)).toBe(
      "In kg, the material's base unit, to six decimals. A planned supply is never smaller than this, even when the minimum is not a whole lot multiple. 0 means no minimum.",
    );
    await admin.press("Escape");
    await admin.waitUntil(`!${tipShown}`);
    await admin.press("Escape");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    expect(await admin.evaluate<boolean>(`Boolean(document.querySelector("[role=dialog]"))`)).toBe(false);
  });

  it("opens a conversion field's tooltip on a tap at 390 px and keeps it inside the screen", async () => {
    await admin.setViewport(390, 844);
    await admin.open(`${baseUrl}/admin/prod/materials/${cement}`);
    await admin.waitUntil(
      `[...document.querySelectorAll("main button")].some((b) => b.textContent.trim() === "Add conversion" && !b.closest("[hidden]") && Object.keys(b).some((key) => key.startsWith("__reactFiber")))`,
    );
    await admin.clickRole("button", "Add conversion");
    await admin.waitUntil(`Boolean(${infoButton("About Base quantity")})`);

    // agent-browser taps only on iOS, so the tap is a touch pointer's events and its click: a finger
    // has no hover, so it is the click that opens the tip.
    await admin.evaluate(`(() => {
      const button = ${infoButton("About Base quantity")};
      for (const type of ["pointerover", "pointerenter", "pointerdown", "pointerup"]) {
        button.dispatchEvent(new PointerEvent(type, { pointerType: "touch", bubbles: type !== "pointerenter", isPrimary: true }));
      }
      button.click();
      return true;
    })()`);
    // Measure once Radix has placed it and its zoom-in has finished, not mid-animation.
    await admin.waitUntil(`${tipShown} && document.querySelector(${JSON.stringify(TIP)}).getAnimations().every((animation) => animation.playState === "finished")`);

    expect(await admin.text(TIP)).toContain("How many kg the alternate quantity is, up to six decimals");
    const box = await admin.evaluate<{ left: number; right: number; top: number; bottom: number; width: number; height: number }>(`(() => {
      const { left, right, top, bottom } = document.querySelector(${JSON.stringify(TIP)}).getBoundingClientRect();
      return { left, right, top, bottom, width: innerWidth, height: innerHeight };
    })()`);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.width);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.height);
    await admin.press("Escape");
    await admin.waitUntil(`!${tipShown}`);
    expect(await admin.evaluate<boolean>(`Boolean(document.querySelector("[role=dialog]"))`)).toBe(true);
  });
});
