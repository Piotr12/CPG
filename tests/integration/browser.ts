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
    click: (selector: string) => command("click", selector),
    /** Clicks the element with this ARIA role and exact accessible name, e.g. a button or menu item. */
    clickRole: (role: string, name: string) => command("find", "role", role, "click", "--name", name, "--exact"),
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
    /** The browser's cookies for the current page, including httpOnly ones. */
    cookies: async () =>
      (JSON.parse(await command("--json", "cookies", "get")) as { data: { cookies: Cookie[] } }).data.cookies,
    close: () => command("close"),
  };
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
