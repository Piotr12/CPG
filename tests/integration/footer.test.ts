import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const SENTENCE =
  "Caveman Planning Good! Made in Jozefoslaw with Tokens, Coffee and OpenMercato Skills during AITechLeaders training.";

interface Footer {
  text: string;
  isLast: boolean;
  links: { text: string; href: string; target: string }[];
}

/** The page's last footer: its text, whether it ends the body's visible content, and its links. */
const readFooter = (browser: Browser) =>
  browser.evaluate<Footer>(`(() => {
    const footer = [...document.querySelectorAll("footer")].at(-1);
    // The footer ends the content column beside the sidebar, so it is checked against every shown
    // element, not only <body>'s children: nothing shown may come after it. Next.js appends <script>s
    // and its own <next-route-announcer> custom element; neither is content.
    const shown = [...document.body.querySelectorAll("*")].filter((e) => e.tagName !== "SCRIPT" && !e.tagName.includes("-") && e.offsetParent !== null);
    const after = shown.filter((e) => !footer.contains(e) && footer.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      text: footer.textContent,
      isLast: after.length === 0,
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

  async function expectFooter() {
    const footer = await readFooter(browser);
    expect(footer.text).toBe(SENTENCE);
    expect(footer.isLast).toBe(true);
    expect(footer.links).toEqual([
      { text: "OpenMercato Skills", href: "https://github.com/open-mercato/skills", target: "_blank" },
      { text: "AITechLeaders training", href: "https://www.aitechleaders.pl/", target: "_blank" },
    ]);
  }

  it("ends the home page", async () => {
    await browser.open(baseUrl);
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
});
