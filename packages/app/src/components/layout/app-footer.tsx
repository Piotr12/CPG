/** The two linked phrases of the footer and where they lead (PRD §05, UX-011, UX-012). */
export const FOOTER_LINKS = {
  openMercatoSkills: { label: "OpenMercato Skills", href: "https://github.com/open-mercato/skills" },
  aiTechLeaders: { label: "AITechLeaders training", href: "https://www.aitechleaders.pl/" },
} as const;

/** The exact footer sentence R11 requires on every page; brand text, so it is never translated. */
export const FOOTER_SENTENCE = `Caveman Planning Good! Made in Jozefoslaw with Tokens, Coffee and ${FOOTER_LINKS.openMercatoSkills.label} during ${FOOTER_LINKS.aiTechLeaders.label}.`;

/** Outbound links open in a new tab, so a half-filled form is never lost. */
function FooterLink({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
      {label}
    </a>
  );
}

/** The branded footer that ends every page, wrapping within a prose line. The root layout renders it after the page. */
export function AppFooter() {
  return (
    <footer className="px-6 pt-4 pb-6 text-center text-xs text-muted-foreground">
      <p className="mx-auto max-w-prose">
        Caveman Planning Good! Made in Jozefoslaw with Tokens, Coffee and <FooterLink {...FOOTER_LINKS.openMercatoSkills} />{" "}
        during <FooterLink {...FOOTER_LINKS.aiTechLeaders} />.
      </p>
    </footer>
  );
}
