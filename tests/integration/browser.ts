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
    close: () => command("close"),
  };
}

export type Browser = ReturnType<typeof openBrowser>;
