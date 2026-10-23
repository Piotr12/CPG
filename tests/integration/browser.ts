import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { arch, platform } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const binaries = path.resolve(import.meta.dirname, "../../node_modules/agent-browser/bin");
const nativeBinary = path.join(binaries, `agent-browser-${platform()}-${arch()}${platform() === "win32" ? ".exe" : ""}`);
/** Whether this is a musl Linux (Alpine): Node reports a glibc version only on glibc. */
const musl = platform() === "linux" && !(process.report.getReport() as { header: { glibcVersionRuntime?: string } }).header.glibcVersionRuntime;
/** Whether the package's binary for this machine is there and executable (its postinstall sets the bit). */
function runnable(file: string) {
  try {
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
/**
 * agent-browser's native binary when the package ships a runnable one for this machine, else its Node
 * wrapper, which also finds musl's. The wrapper starts Node (and on Linux runs `ldd`) before every
 * command, which cost the suite's thousands of commands ~70 ms each.
 */
const agentBrowser = !musl && runnable(nativeBinary) ? nativeBinary : path.resolve(import.meta.dirname, "../../node_modules/.bin/agent-browser");

/** How long `waitUntil` waits before failing, as long as agent-browser's own `wait`. */
const WAIT_TIMEOUT_MS = 25_000;
/** How often the page checks a `waitUntil` condition. agent-browser's `wait --fn` checks every 100 ms. */
const POLL_MS = 10;
/** The longest one in-page check runs before answering, so the wait never nears agent-browser's 30 s read limit. */
const SLICE_MS = 2_000;

/**
 * A script that checks `expression` in the page every `POLL_MS` for up to `slice` ms and resolves to
 * whether it became truthy, with the last error it threw. Like `wait --fn`, an expression that throws
 * counts as not yet true.
 */
const checkInPage = (expression: string, slice: number) => `new Promise((resolve) => {
  const end = Date.now() + ${slice};
  let error = null;
  const check = () => {
    let met = false;
    try { met = Boolean(${expression}); } catch (thrown) { error = String(thrown); }
    if (met || Date.now() >= end) resolve({ met, error });
    else setTimeout(check, ${POLL_MS});
  };
  check();
})`;

/** A page function: whether an element is visible as agent-browser's `wait <selector>` counts it. */
const visible = `((element) => {
  if (!element) return false;
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
})`;

/**
 * A script that resolves once every finite animation or transition in the page has finished (a
 * dialog's or popover's opening or closing), or after 1 s. Endless ones, such as a loading pulse,
 * are left out.
 */
const SETTLE = `Promise.race([
  Promise.allSettled(document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity).map((animation) => animation.finished)),
  new Promise((resolve) => setTimeout(resolve, 1000)),
]).then(() => true)`;

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
  /**
   * Waits until the page's finite animations have finished, for at most 1 s. agent-browser clicks
   * where it measured and refuses a point an opening dialog's overlay still covers. The Node
   * wrapper's start-up used to leave that time before every click by accident. Only animations
   * already running count: after an action that opens something later, wait for it first.
   */
  const settled = async () => {
    try {
      await evaluate(SETTLE);
    } catch {
      // The page navigated: there is nothing left to wait for.
    }
  };

  /**
   * Waits until a JavaScript expression is truthy in the page, for up to 25 s. The result is coerced
   * to a boolean: agent-browser serializes it over CDP, and a DOM element (with its React fiber) can
   * fail with "Object reference chain is too long". The page polls it every 10 ms, where agent-browser's
   * `wait` polls every 100 ms and so added ~50 ms to every wait. A navigation ends the page's check
   * with an error; the wait then checks the new page, as `wait --fn` does.
   */
  const waitUntil = async (expression: string) => {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    let lastError: unknown;
    for (let remaining = WAIT_TIMEOUT_MS; remaining > 0; remaining = deadline - Date.now()) {
      try {
        const { met, error } = await evaluate<{ met: boolean; error: string | null }>(checkInPage(expression, Math.min(SLICE_MS, remaining)));
        if (met) return;
        if (error) lastError = new Error(error);
      } catch (error) {
        // An expression that isn't JavaScript never will be: say so now rather than after 25 s.
        if (String((error as { stdout?: string }).stdout ?? error).includes("SyntaxError")) throw error;
        // The page navigated, or has no document yet: check again on the next one.
        lastError = error;
        await sleep(POLL_MS);
      }
    }
    throw new Error(`Wait timed out after ${WAIT_TIMEOUT_MS}ms for ${expression}`, { cause: lastError });
  };

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
    /** Clicks the element matching the CSS selector, once the page's animations have finished. */
    click: async (selector: string) => {
      await settled();
      return command("click", selector);
    },
    /** Sets the files of the file input matching the CSS selector, as choosing them in the dialog does. */
    upload: (selector: string, ...files: string[]) => command("upload", selector, ...files),
    /** Chooses the option with this value (or visible label) in the select matching the CSS selector. */
    select: (selector: string, value: string) => command("select", selector, value),
    /**
     * Clicks the element with this ARIA role and exact accessible name, e.g. a button or menu item,
     * once the page's animations have finished.
     */
    clickRole: async (role: string, name: string) => {
      await settled();
      return command("find", "role", role, "click", "--name", name, "--exact");
    },
    /** Presses a key in the focused element, e.g. `Escape`. */
    press: (key: string) => command("press", key),
    /** Clears the input labelled exactly `label` and types `value` into it. */
    fillLabel: (label: string, value: string) => command("find", "label", label, "fill", value, "--exact"),
    /** Waits until `text` appears in the page's visible text (`innerText`), as `wait --text` does. */
    waitForText: (text: string) => waitUntil(`document.body.innerText.includes(${JSON.stringify(text)})`),
    /**
     * Waits until the first element matching the CSS selector is visible, as `wait <selector>` does:
     * it has a box, and isn't `visibility: hidden`.
     */
    waitFor: (selector: string) => waitUntil(`${visible}(document.querySelector(${JSON.stringify(selector)}))`),
    waitUntil,
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
    ${shown}.scrollIntoView({ block: "center", inline: "nearest" });
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
