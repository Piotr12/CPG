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
    // Next.js appends <script>s and its own <next-route-announcer> custom element; neither is content.
    const visible = [...document.body.children].filter((e) => e.tagName !== "SCRIPT" && !e.tagName.includes("-") && e.offsetParent !== null);
    return {
      text: footer.textContent,
      isLast: visible.at(-1) === footer,
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
});
