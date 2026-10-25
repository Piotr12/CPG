import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signedInAndHydrated, signedOutLayoutSettled, signInAs, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's normal user, for UX-009; other files share the app, and users are never deleted.
const USERNAME = "footer-fern";
const PASSWORD = "footer fern's password";

const SENTENCE =
  "Caveman Planning Good! Made in Jozefoslaw with Tokens, Coffee and OpenMercato Skills during AITechLeaders training.";

interface Footer {
  text: string;
  /** The shown elements after the footer, as `tag#id.class`: none when the footer ends the page. */
  after: string[];
  links: { text: string; href: string; target: string }[];
}

/** The page's last footer: its text, what shown content follows it (nothing, when it ends the page), and its links. */
const readFooter = (browser: Browser) =>
  browser.evaluate<Footer>(`(() => {
    const footer = [...document.querySelectorAll("footer")].at(-1);
    // The footer ends the content column beside the sidebar, so it is checked against every shown
    // element, not only <body>'s children: nothing shown may come after it. Next.js appends <script>s
    // and its own <next-route-announcer> custom element; neither is content. Nor is a Suspense slot's
    // content still parked in Next.js's hidden staging <div> after the footer: offsetParent is null
    // there, but only on HTML elements (SVG icons have none, so they are judged by checkVisibility()) (#213).
    const visible = (e) => (e instanceof HTMLElement ? e.offsetParent !== null : e.checkVisibility());
    const shown = [...document.body.querySelectorAll("*")].filter((e) => e.tagName !== "SCRIPT" && !e.tagName.includes("-") && visible(e));
    const after = shown.filter((e) => !footer.contains(e) && footer.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
    // Named, so a failure says what followed the footer instead of "expected false to be true".
    const describe = (e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + [...e.classList].slice(0, 4).map((c) => "." + c).join("");
    return {
      text: footer.textContent,
      after: after.map(describe),
      links: [...footer.querySelectorAll("a")].map((a) => ({ text: a.textContent, href: a.href, target: a.target })),
    };
  })()`);

// R11, UX-008, UX-010, UX-011, UX-012: every page ends with the exact footer and its two links.
describe("the footer", () => {
  let browser: Browser;

  beforeAll(() => {
    browser = openBrowser();
  });
  afterAll(() => browser.close());

  async function expectFooter(reader = browser) {
    const footer = await readFooter(reader);
    expect(footer.text).toBe(SENTENCE);
    expect(footer.after).toEqual([]);
    expect(footer.links).toEqual([
      { text: "OpenMercato Skills", href: "https://github.com/open-mercato/skills", target: "_blank" },
      { text: "AITechLeaders training", href: "https://www.aitechleaders.pl/", target: "_blank" },
    ]);
  }

  it("ends the home page", async () => {
    await browser.open(baseUrl);
    // Read the settled page, as every other case does: the visitor bar and the home content stream in after the shell.
    await browser.waitUntil(
      `${signedOutLayoutSettled} && [...document.querySelectorAll("main h1")].some((element) => !element.closest("[hidden]"))`,
    );
    await expectFooter();
  });

  it("ends the sign-in page", async () => {
    await browser.open(`${baseUrl}/login`);
    await browser.waitFor("#username");
    await expectFooter();
  });

  it("ends the help page", async () => {
    await browser.open(`${baseUrl}/help`);
    await browser.waitFor("section#signing-in");
    await expectFooter();
  });

  it("ends the admin page", async () => {
    await signInAsAdmin(browser, baseUrl, adminPassword);
    await expectFooter();
  });

  // The admin's other screens and a tenant's (UX-010 names user administration), its reports and a filtered audit.
  it.each([
    ["/admin/users", "table"],
    ["/admin/tokens", "table"],
    ["/admin/audit", "table"],
    ["/admin/test", "[data-slot=card-description]"],
    ["/admin/test/audit", "main h1"],
    ["/admin/test/reports/stock", "table[aria-label='Current stock']"],
    ["/admin/test/reports/variance", "table[aria-label='Production variance']"],
    ["/admin/test/audit?subjectType=Material&subjectId=00000001", "main table"],
  ])("ends %s", async (path, content) => {
    await browser.open(`${baseUrl}${path}`);
    // The page's own content, swapped in from Next.js's hidden streaming container.
    await browser.waitUntil(
      `[...document.querySelectorAll(${JSON.stringify(content)})].some((element) => !element.closest("[hidden]"))`,
    );
    const shown = new URL(await browser.url());
    expect(shown.pathname + shown.search).toBe(path);
    await expectFooter();
  });

  // UX-009: a normal user's operational screens, a master-data list and a transaction list, end with it too.
  it("ends a normal user's operational pages (UX-009)", async () => {
    // Its own admin session creates the user, so the test doesn't lean on the admin sign-in above.
    const admin = openBrowser();
    const fern = openBrowser();
    try {
      await signInAsAdmin(admin, baseUrl, adminPassword);
      await admin.open(`${baseUrl}/admin/users`);
      await admin.waitUntil(`[...document.querySelectorAll("main button")].some((b) => b.textContent.trim() === "Create user" && Object.keys(b).some((key) => key.startsWith("__reactFiber")))`);
      await admin.clickRole("button", "Create user");
      await admin.fillLabel("Username", USERNAME);
      await admin.fillLabel("Initial password", PASSWORD);
      await admin.click("[role=dialog] button[type=submit]");
      await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
      await signInAs(fern, baseUrl, USERNAME, PASSWORD);
      for (const [path, content] of [
        ["/admin/prod/materials", "main table"],
        ["/admin/prod/customer-orders", "main table"],
      ]) {
        await fern.open(`${baseUrl}${path}`);
        await fern.waitUntil(`${signedInAndHydrated(USERNAME)} && [...document.querySelectorAll(${JSON.stringify(content)})].some((element) => !element.closest("[hidden]"))`);
        expect(new URL(await fern.url()).pathname).toBe(path);
        expect(await fern.evaluate<string>(`document.querySelector("[data-signed-in-as]").dataset.signedInAs`)).toBe(USERNAME);
        await expectFooter(fern);
      }
    } finally {
      await Promise.all([admin.close(), fern.close()]);
    }
  });
});
