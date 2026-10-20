import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const agentBrowser = path.resolve(import.meta.dirname, "../../node_modules/.bin/agent-browser");

/**
 * A headless Chrome driven by the `agent-browser` CLI — the same tool agents use to check the app
 * by hand, so a failing test can be reproduced command by command. Each instance gets its own
 * session, so test files running in parallel never share a page.
 */
export function openBrowser() {
  const session = `cpg-test-${randomUUID()}`;
  const command = async (...args: string[]) =>
    (await run(agentBrowser, ["--session", session, ...args])).stdout.trim();
  /** Runs JavaScript in the page and returns its (JSON-serializable) result. */
  const evaluate = async <T>(script: string): Promise<T> =>
    (JSON.parse(await command("--json", "eval", script)) as { data: { result: T } }).data.result;

  return {
    evaluate,
    open: (url: string) => command("open", url),
    title: () => command("get", "title"),
    /** The visible text of the first element matching a CSS selector. */
    text: (selector: string) => command("get", "text", selector),
    /** The visible text of every element matching a CSS selector. */
    texts: (selector: string) =>
      evaluate<string[]>(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => e.innerText)`),
    /** Clears an input and types `value` into it. */
    fill: (selector: string, value: string) => command("fill", selector, value),
    /**
     * Sets a date input to an ISO `YYYY-MM-DD` value. agent-browser's `fill` leaves a native date
     * input empty, so this sets the value through the input's own setter and fires the `input` event
     * React's `onChange` listens to, as picking a day in the browser's date picker does.
     */
    fillDate: (selector: string, value: string) =>
      evaluate<string>(`(() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return input.value;
      })()`),
    click: (selector: string) => command("click", selector),
    /** Sets the files of the file input matching the CSS selector, as choosing them in the dialog does. */
    upload: (selector: string, ...files: string[]) => command("upload", selector, ...files),
    /** Chooses the option with this value (or visible label) in the select matching the CSS selector. */
    select: (selector: string, value: string) => command("select", selector, value),
    /** Clicks the element with this ARIA role and exact accessible name, e.g. a button or menu item. */
    clickRole: (role: string, name: string) => command("find", "role", role, "click", "--name", name, "--exact"),
    /** Presses a key in the focused element, e.g. `Escape`. */
    press: (key: string) => command("press", key),
    /** Clears the input labelled exactly `label` and types `value` into it. */
    fillLabel: (label: string, value: string) => command("find", "label", label, "fill", value, "--exact"),
    /** Waits until `text` appears anywhere on the page. */
    waitForText: (text: string) => command("wait", "--text", text),
    /** Waits until an element matching the CSS selector is on the page. */
    waitFor: (selector: string) => command("wait", selector),
    /**
     * Waits until a JavaScript expression is truthy in the page. The result is coerced to a boolean:
     * agent-browser serializes it over CDP, and a DOM element (with its React fiber) can fail with
     * "Object reference chain is too long".
     */
    waitUntil: (expression: string) => command("wait", "--fn", `Boolean(${expression})`),
    url: () => command("get", "url"),
    /** Resizes the page, e.g. to a phone's width. */
    setViewport: (width: number, height: number) => command("set", "viewport", String(width), String(height)),
    /** The browser's cookies for the current page, including httpOnly ones. */
    cookies: async () =>
      (JSON.parse(await command("--json", "cookies", "get")) as { data: { cookies: Cookie[] } }).data.cookies,
    close: () => command("close"),
  };
}

/**
 * Clicks a link once React has hydrated it: a click on streamed HTML before that can be lost. Next.js
 * keeps earlier pages mounted but hidden, so it waits for the first match that is shown.
 */
export async function clickHydrated(browser: Browser, selector: string) {
  const shown = `[...document.querySelectorAll(${JSON.stringify(selector)})].find((link) => link.offsetParent && Object.keys(link).some((key) => key.startsWith("__reactFiber")))`;
  await browser.waitUntil(shown);
  // Mark the shown copy and click exactly it: the first match in the DOM may be a hidden earlier page's.
  await browser.evaluate(`(() => {
    document.querySelectorAll("[data-test-click]").forEach((element) => element.removeAttribute("data-test-click"));
    ${shown}.setAttribute("data-test-click", "");
    return true;
  })()`);
  await browser.click("[data-test-click]");
}

export interface Cookie {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  path: string;
}

export type Browser = ReturnType<typeof openBrowser>;
