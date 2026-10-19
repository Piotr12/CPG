# Menu revamp — shared brief for the five mockups

Every mockup in this folder follows this brief. Each one is a different answer to the same question: **how should CPG's menu work once the whole product exists?**

## The owner's requirements

1. **Test/Prod is a switch, not a menu entry.** Today the menu lists `Tenants · Test · Prod` as three links. In every mockup the tenant is a context you flip with one click, always visible, never a page in the menu.
2. **Master data lives in one menu tree.** Materials, locations, customers, suppliers, planning parameters, safety stock, BOMs and the import all sit under one "Master data" node.
3. **Easy to understand, few clicks.** Any screen that exists today is at most 2 clicks from anywhere on desktop. The labels use the PRD's plain words.

## What the menu has to hold (information architecture)

`now` = on `main` today · `#23`, `#25` = being built right now · `slice 1` = filed for slice 1 · `slice 2` / `slice 3` = later epics (E06), shown greyed with a "later" badge, clickable to a "coming in slice N" placeholder.

### Context (not menu entries)

| Element | Who | Notes |
|---|---|---|
| **Tenant switch: Test ⇄ Prod** | everyone | Always visible. Test = amber (`#fde68a` / `#92400e`), Prod = near-black `#171717` with red `#dc2626`. Flipping keeps you on the same screen in the other tenant (`/admin/test/materials` → `/admin/prod/materials`), as today's switcher does. |
| **Read-only lock** (#25) | everyone sees it; admin toggles it | Independent per tenant. A read-only tenant shows a 🔒 on its side of the switch and a banner ("Prod is read-only — business changes are blocked. Reading, audit, preferences and user management still work."). Every create/edit/import button in that tenant is disabled. Global pages are unaffected. |
| **Global pages** | — | Users, API tokens, Global audit, system status belong to no tenant. On them the switch stays visible and keeps its value, but the page says it is shared by both tenants. |

### Tenant-scoped screens (each exists once per tenant)

| Group | Screen | Status | Who edits | Sample content for the mockup |
|---|---|---|---|---|
| — | **Overview** (tenant home) | now (thin today) | — | record counts per master, recent changes from the audit, quick actions |
| **Master data** | Materials (detail page holds unit conversions) | now (#22) | admin; users read | `00000001` Granite slab · raw · kg; `00000002` Mammoth hide · raw · m²; `00000003` Wheel (stone) · intermediate · pcs; `00000004` Axle · intermediate · pcs; `00000005` Cave cart · finished · pcs; `00000006` Flint knife · finished · pcs |
| Master data | Locations | #23 | admin | `L001` Main cave (active), `L002` River warehouse (active), `L003` Old quarry (inactive) |
| Master data | Customers | #23 | admin | `C001` Flintstone Ltd, `C002` Rubble & Co, `C003` Slate Rock and Gravel |
| Master data | Suppliers | #23 | admin | `S001` Bedrock Quarry, `S002` Woolly Hides Co, `S003` Sabre Tooth Tools (inactive) |
| Master data | Planning parameters (material × location: Make/Buy, lead time in days, minimum lot, lot multiple) | slice 1 (#24) | admin | Cave cart @ Main cave: Make, 3 d, 1, 1; Granite slab @ Main cave: Buy, 10 d, 50, 10 |
| Master data | Safety stock (effective-dated targets) | slice 1 (#24) | admin | Cave cart @ Main cave: 5 from 2026-11-01, 8 from 2027-01-01 |
| Master data | BOMs (alternatives with priority and validity, immutable revisions) | slice 1 (#26) | admin | Cave cart — Alt A (prio 1, rev 3), Alt B (prio 2, rev 1); Wheel — Alt A (rev 2) |
| Master data | Import from spreadsheet (download template → upload → dry run → commit) | slice 1 (#27) | admin only (normal users don't see it) | a 3-step stepper |
| Sales | Customer orders, Forecasts, Shipments (goods issues) | slice 2 | everyone | placeholder |
| Purchasing | Purchase requisitions, Purchase orders, Goods receipts | slice 2 | everyone | placeholder |
| Production | Production orders, Completions | slice 2 | everyone | placeholder |
| Inventory | Stock (ledger), Corrections, Transfers, Stock import | slice 2 | everyone | placeholder |
| Planning | MRP run, Last MRP report | slice 3 | everyone | placeholder |
| Reports | Stock, Variance, Audit reports | slice 2 | everyone | placeholder |
| Audit | Tenant audit (append-only change log of this tenant) | now | read by everyone | 4–6 rows: time, account, channel (UI/API), action, record |

### Global screens

| Screen | Status | Who |
|---|---|---|
| Users (create, reset password, deactivate) | now | admin only |
| Tenants: read-only flag per tenant, dataset generation, Test reset | now (#25 flags) / slice 2 (reset) | admin only; the read-only toggles must be **interactive** in the mockup and drive the lock/banner everywhere |
| System status (database path, migrations) | now (lives on `/admin` today) | admin only |
| Global audit | now | everyone |
| API tokens (own tokens) | now | everyone (personal) |
| Help | now | everyone |
| Account: name, Language EN/PL, Theme light/dark, Sign out | now | everyone |

Roles: exactly one **admin** and **normal users**. Normal users read master data (no create/edit buttons, no Import), never see Users, Tenants or System status, and do see API tokens, both audits, Help and their account controls.

## Mockup conventions (all five)

- **One self-contained `index.html` per folder.** Inline CSS and JS, no CDN, no build, no external fonts or images (emoji and inline SVG are fine). It must work opened straight from disk (`file://`).
- **Clickable for real.** Hash routes (`#/test/materials`, `#/prod/locations`, `#/global/users`) so the browser's Back button works and a URL can be shared. Every menu entry leads somewhere: real-looking pages for `now`/`#23`/`#25`/`slice 1` screens (title, breadcrumb, a short description, a table or a form with the sample data, a primary action button), a friendly placeholder for slice 2/3.
- **Look of the current app:** shadcn neutral, system font stack, 14 px base, `#252525` text, `#737373` muted, `#e5e5e5` borders, radius 8–14 px, the mammoth `🦣 CPG` brand linking to the tenant overview. The footer sentence stays at the bottom of every page: "Caveman Planning Good! Made in Jozefoslaw with Tokens, Coffee and OpenMercato Skills during AITechLeaders training." (the last two as links).
- **Mockup controls**: a small floating box bottom-right, dashed border, labelled "Mockup controls (not part of the design)", collapsible, with: Role (Admin / Normal user), Show later slices (on/off — off hides slice 2/3 entries entirely), and an "About this concept" button that opens a short panel: the idea, why it fits CPG, trade-offs, and the click counts below.
- **States to demonstrate:** Test vs Prod; read-only Prod (toggle on the Tenants page and in the mockup controls); admin vs normal user; a material detail page with its unit conversions (shows depth); mobile layout at 390 px wide; dark theme from the account menu (CSS variables, nice to have).
- **Accessibility basics:** real `<button>`/`<a>`, `aria-current="page"` on the current entry, visible focus, the tenant shown in words not only colour.
- **Click counts** to report (from a tenant's Overview, desktop): Materials, Locations, Safety stock, Users, switch Test→Prod staying on the same screen, change language, reach the Import, and the same three most common ones on mobile.

## Out of scope

Real data, real forms that validate, Polish copy (keep in mind Polish labels are ~30 % longer), animations beyond simple transitions.
