# Close QA plan (the lead, agent-browser, realistic dataset)

Server: `scripts/standalone-server.sh 3100 --build` (fresh data dir), sign in as admin, Reset Test with the realistic dataset through the Tenants page (`[data-test-reset] select` → realistic, then Reset Test…; wait for the status Callout).

Matrix: widths 320 / 768 / 1440; themes light / dark (account preference, or `html.dark` toggled); languages EN / PL (account preference). Each capture: no horizontal overflow (`document.documentElement.scrollWidth === innerWidth`), nothing clipped (`scrollWidth > clientWidth` on text elements), one `h1`.

Acceptance screens (spec "Acceptance criteria"):

| # | Screen | URL | What to check |
|---|---|---|---|
| 1 | Tenants | `/admin` | choice cards (edge + tag), read-only/writable badges, Reset Test opener (`destructive`) and confirm (`destructive-solid`) |
| 2 | Overview | `/admin/test` | `PageHeader` "Overview — Test", narrow width |
| 3 | Materials list | `/admin/test/materials` | populated table, sticky ID column at 320, status badges, Create material action, empty filtered state if any |
| 4 | Material detail | `/admin/test/materials/00000001` | `{Concept singular} {ID}` title, status as `meta`, conversions table |
| 5 | Production order with a shortage | find one on `/admin/test/production-orders` (realistic data), else create one | warning `Callout` "{n} components short", `rowTone` rows with the icon, lifecycle action in the header |
| 6 | Mixed statuses | `/admin/test/customer-orders` or purchase orders | Open / Completed / Closed Early / Cancelled distinguishable by icon and label |
| 7 | Import | `/admin/test/import` | numbered steps, a refusal (dry run of a workbook with a bad row) as a danger/warning `Callout`, success as `Callout tone="success"` |
| 8 | Stock report | `/admin/test/reports/stock` | labelled filters, right-aligned `tabular-nums` quantities, links to records |
| 9 | Help | `/help` | visible label, stacked search below 640, prose width |
| 10 | Home | `/` | mark, Display `h1`, tagline, CTA, the flow links |
| 11 | Login | `/login` (signed out) | `h1` with the mark, refusal as a danger `Callout`, username kept |
| 12 | Tall dialog | planning parameters create (`/admin/test/planning-parameters`) at 320×600 | scrolls internally, actions reachable |
| 13 | Keyboard | Tab through the materials page | focus ring visible on every control; focus returns to the opener after a dialog closes |
| 14 | No JavaScript | `/admin/test/materials` with scripts disabled | the `<noscript>` notice in both languages |
| 15 | Not found | `/nope` and `/admin/test/materials/99999999` | message, way back, `noindex` |

Evidence: `qa-artifacts/<n>-<screen>-<width>-<theme>-<lang>.png`, plus `metrics.json`; attached to the PR with `attach-image-evidence` (`.ai/trackers/github.md`), slug `pr-<number>`.
