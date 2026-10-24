## 🤖 Close QA — design system v1 on the realistic dataset

Captured by the lead with agent-browser against the production standalone build (the branch's final commit), after an API reset of Test to the **realistic** dataset. Every acceptance screen at **320, 768 and 1440 px**, **light and dark**, **English and Polish**: 112 captures plus the keyboard, dialog, not-found and refused-sign-in checks (the complete set with `metrics.json` is in `.ai/pipeline/runs/2026-10-24--0925UTC-design-system-v1/qa-artifacts/`). Measured on every capture: no horizontal page overflow (`scrollWidth === innerWidth`), exactly one `h1`, no clipped control or label (the 768 px captures flag only the icon rail's menu labels, which the rail hides by design).

Checks beyond the captures: Tab order on the Materials page lands on controls with the opaque 2 px focus ring (inset in the sidebar); Escape on the Create material dialog returns focus to its opener; the Add parameters dialog at 320×600 scrolls internally with its submit button reachable; a wrong sign-in shows the States table's refusal as a danger `Callout` and keeps the typed username; the unknown address and the unknown record show "Page not found." with Go to Tenants / Back to Materials and `noindex`.

The selection below is one capture per acceptance screen; the rest are in the run folder.
