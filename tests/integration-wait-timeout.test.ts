// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PAGE_STATE, waitTimedOut, type PageState } from "./integration/browser";

// What a timed-out integration wait reports about the page (tests/integration/browser.ts, #373).

/** Runs the in-page script as agent-browser's `eval` does: in the page's global scope. */
const readPage = () => (0, eval)(PAGE_STATE) as PageState;

describe("PAGE_STATE", () => {
  // jsdom has no layout, so no `innerText` or `checkVisibility`. As in a browser, an element is not rendered
  // when it or an ancestor is `hidden` or `display: none`, and `innerText` leaves such elements out.
  const NOT_RENDERED = '[hidden], [style*="display: none"]';
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get(this: HTMLElement) {
        const copy = this.cloneNode(true) as HTMLElement;
        copy.querySelectorAll(NOT_RENDERED).forEach((element) => element.remove());
        return copy.textContent;
      },
    });
    Object.defineProperty(Element.prototype, "checkVisibility", {
      configurable: true,
      value(this: Element) {
        return !this.closest(NOT_RENDERED);
      },
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "innerText");
    Reflect.deleteProperty(Element.prototype, "checkVisibility");
    document.title = "";
    document.body.innerHTML = "";
  });

  it("reads where the page is, its title, and the shown main's text rather than an earlier page's Next.js keeps mounted", () => {
    document.title = "Audit — Prod · Caveman Planning Good";
    document.body.innerHTML = `
      <div style="display: none"><main>Materials — Prod</main></div>
      <nav>Sidebar</nav>
      <main><h1>Audit — Prod</h1>
        <p>Showing   entries
          that match the filters.</p></main>`;
    expect(readPage()).toEqual({
      url: "http://localhost:3000/",
      readyState: "complete",
      title: "Audit — Prod · Caveman Planning Good",
      pending: 0,
      failed: 0,
      staged: 0,
      text: "Audit — Prod Showing entries that match the filters.",
    });
  });

  it("counts the Suspense boundaries still on their fallback, those whose server render failed, and the streamed parts React hasn't revealed", () => {
    document.body.innerHTML = `
      <main><!--$?--><template id="B:0"></template><p>Loading…</p><!--/$-->
        <!--$?--><template id="B:1"></template><p>Loading…</p><!--/$-->
        <!--$!--><template id="B:2" data-dgst="1234"></template><p>Loading…</p><!--/$--></main>
      <div hidden id="S:0"><form aria-label="Filter audit entries"></form></div>
      <template id="P:3"></template>`;
    expect(readPage()).toMatchObject({ pending: 2, failed: 1, staged: 1, text: "Loading… Loading… Loading…" });
  });

  it("reads the body when no main is shown, such as an error page, and quotes only the start of a long text", () => {
    document.body.innerHTML = `<div hidden><main>Audit — Prod</main></div><h2>Application error: a server-side exception has occurred</h2>
<p>${"x".repeat(1000)}</p>`;
    const { text } = readPage();
    expect(text).toMatch(/^Application error: a server-side exception has occurred x+$/);
    expect(text).toHaveLength(400);
  });
});

describe("waitTimedOut", () => {
  const condition = `document.querySelector("main table")`;

  it("names the condition and says what the page showed, keeping the last error as the cause", async () => {
    const scripts: string[] = [];
    const page = {
      evaluate: async <T>(script: string) => {
        scripts.push(script);
        const state: PageState = { url: "http://localhost:3000/login", readyState: "complete", title: "Sign in", pending: 1, failed: 3, staged: 2, text: 'Sign in "admin"' };
        return state as T;
      },
    };
    const last = new Error("TypeError: x is null");
    const error = await waitTimedOut(page, condition, last);
    expect(scripts).toEqual([PAGE_STATE]);
    expect(error.message).toBe(
      `Wait timed out after 25000ms for ${condition}\n` +
        `The page http://localhost:3000/login (complete, title "Sign in", 1 Suspense boundaries still loading, 3 failed, 2 streamed parts not shown yet) reads: "Sign in \\"admin\\""`,
    );
    expect(error.cause).toBe(last);
  });

  it("says why the page could not be read, from agent-browser's answer rather than its command line", async () => {
    const failing = (thrown: unknown) => ({ evaluate: async () => Promise.reject(thrown) });
    const command = (output: { stderr?: string; stdout?: string }) => Object.assign(new Error("Command failed: agent-browser --session s --json eval (() => { … })()"), output);

    const fromStderr = await waitTimedOut(failing(command({ stderr: "  Execution context was destroyed\n", stdout: "{}" })), condition, undefined);
    expect(fromStderr.message).toBe(`Wait timed out after 25000ms for ${condition}\nThe page could not be read: Execution context was destroyed`);

    const fromStdout = await waitTimedOut(failing(command({ stderr: "", stdout: '{"success":false,"error":"No page"}' })), condition, undefined);
    expect(fromStdout.message).toBe(`Wait timed out after 25000ms for ${condition}\nThe page could not be read: {"success":false,"error":"No page"}`);

    const bare = await waitTimedOut(failing(new Error("spawn EAGAIN")), condition, undefined);
    expect(bare.message).toBe(`Wait timed out after 25000ms for ${condition}\nThe page could not be read: Error: spawn EAGAIN`);

    const nothing = await waitTimedOut(failing(undefined), condition, undefined);
    expect(nothing.message).toBe(`Wait timed out after 25000ms for ${condition}\nThe page could not be read: undefined`);
  });

  it("stops waiting for a page that doesn't answer, so the wait's own error still comes before the test's time limit", async () => {
    const last = new Error("Execution context was destroyed");
    const silent = { evaluate: () => new Promise<never>(() => undefined) };
    const started = Date.now();
    const error = await waitTimedOut(silent, condition, last, 50);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(error.message).toBe(`Wait timed out after 25000ms for ${condition}\nThe page could not be read: Error: no answer in 50 ms`);
    expect(error.cause).toBe(last);
  });
});
