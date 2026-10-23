import type { Locale } from "@cpg/core";

/** Every help topic, in display order. A new screen adds its topic here, in both languages. */
export const HELP_TOPIC_IDS = [
  "getting-started",
  "signing-in",
  "admin-home",
  "managing-users",
  "api-tokens",
  "test-and-prod",
  "global-audit",
  "tenant-audit",
  "materials",
  "material-conversions",
  "locations",
  "customers",
  "suppliers",
  "planning-parameters",
  "safety-stock",
  "forecasts",
  "boms",
  "bom-revisions",
  "purchase-requisitions",
  "purchase-orders",
  "purchase-order",
  "production-orders",
  "production-order-detail",
  "transfers",
  "transfer",
  "customer-orders",
  "customer-order-detail",
  "shipment",
  "import",
  "stock",
  "stock-import",
  "stock-report",
  "variance-report",
  "language-and-theme",
  "using-help",
] as const;
export type HelpTopicId = (typeof HELP_TOPIC_IDS)[number];

/**
 * The screen each topic explains, as the route of its `page.tsx`: the directory under `src/app` with
 * route groups dropped and dynamic segments kept as written. `tests/every-page-has-help.test.ts` fails
 * when a page has no topic.
 */
export const HELP_TOPIC_ROUTES: Record<HelpTopicId, string> = {
  "getting-started": "/",
  "signing-in": "/login",
  "admin-home": "/admin",
  "managing-users": "/admin/users",
  "api-tokens": "/admin/tokens",
  "test-and-prod": "/admin/[tenant]",
  "global-audit": "/admin/audit",
  "tenant-audit": "/admin/[tenant]/audit",
  materials: "/admin/[tenant]/materials",
  "material-conversions": "/admin/[tenant]/materials/[id]",
  locations: "/admin/[tenant]/locations",
  customers: "/admin/[tenant]/customers",
  suppliers: "/admin/[tenant]/suppliers",
  "planning-parameters": "/admin/[tenant]/planning-parameters",
  "safety-stock": "/admin/[tenant]/safety-stock",
  forecasts: "/admin/[tenant]/forecasts",
  boms: "/admin/[tenant]/boms",
  "bom-revisions": "/admin/[tenant]/boms/[id]",
  "purchase-requisitions": "/admin/[tenant]/purchase-requisitions",
  "purchase-orders": "/admin/[tenant]/purchase-orders",
  "purchase-order": "/admin/[tenant]/purchase-orders/[id]",
  "production-orders": "/admin/[tenant]/production-orders",
  "production-order-detail": "/admin/[tenant]/production-orders/[id]",
  transfers: "/admin/[tenant]/transfers",
  transfer: "/admin/[tenant]/transfers/[id]",
  "customer-orders": "/admin/[tenant]/customer-orders",
  "customer-order-detail": "/admin/[tenant]/customer-orders/[id]",
  shipment: "/admin/[tenant]/shipments/[id]",
  import: "/admin/[tenant]/import",
  stock: "/admin/[tenant]/stock",
  "stock-import": "/admin/[tenant]/stock-import",
  "stock-report": "/admin/[tenant]/reports/stock",
  "variance-report": "/admin/[tenant]/reports/variance",
  "language-and-theme": "/admin",
  "using-help": "/help",
};

interface HelpText {
  title: string;
  body: string[];
}

export interface HelpTopic extends HelpText {
  id: HelpTopicId;
  route: string;
}

const en: Record<HelpTopicId, HelpText> = {
  "production-orders": { title: "Production orders", body: ["Create one Make output at one location. Preview active date-valid recipes, pick an alternative and review current component shortages. Shortages allow planning; creating or editing an order moves no stock. The exact BOM revision, unit conversion and calendar-day lead time are kept. Edit target and finish on the detail screen; read-only datasets allow reading only."] },
  "production-order-detail": { title: "A production order", body: ["Cancel ends an Open document before any processing. Close Early abandons the remainder after processing, without reversing stock or recorded work. The confirmation lists abandoned quantities; terminal documents cannot be reopened manually. Both roles may act, except in a read-only tenant. Headers stay Open while any line is Open; all Completed means Completed, all Cancelled means Cancelled, and a mixture means Closed Early. A zero-output completion recording waste counts as processing.", "The detail screen shows the pinned BOM revision, the stored unit conversion, the captured calendar-day lead time, and the components still needed for the outstanding quantity (the target less what was produced or abandoned) with current shortages: an Open order of 100 with 40 produced needs components for 60. A Cancelled, Completed or Closed Early order needs no components and shows no shortage. On an Open order, edit the target or the planned finish: the start is recalculated from the captured lead time and the recipe stays pinned. Planning moves no stock; read-only datasets allow reading only.", "Posting a completion: choose Post completion, enter the output (0 records waste) and Continue. Each recipe component starts at what the pinned recipe expects for that output, for example 0.5 kg per bar × 4 bars = 2 kg; change it to what was actually used, and add any extra raw or intermediate input. Posting adds the output and consumes every material used at the order's location in one posting dated today, and records each material's expected, actual and variance. If any material is short, nothing posts. Going past the target needs “Post more than planned”; reaching the target completes the order. Once production is posted, the target can't go below what was produced.", "Reversing a completion: choose Reverse on a completion in the history and give a reason. The whole completion is reversed once, today: the output leaves stock and every material used comes back, at the order's location, in one posting. If the output is no longer in stock, nothing is reversed. The order's produced quantity drops by the output; a Completed order below its target becomes Open again, and a Closed Early order stays closed. There is no partial reversal: to correct a quantity, reverse the completion and post the right one. The API offers POST …/completions/{completionId}/reverse with { reason }."] },
  "customer-orders": { title: "Customer orders", body: ["Both roles can create and edit customer orders under Transactions. Choose one active customer and one location for the header; each line has its own material, positive quantity, unit and required date. Orders start Open with zero fulfilled. Entering an order moves no stock. Stored quantities use the material’s base unit; the entered amount and factor stay in history. A customer may be deactivated while existing orders continue. A stale version refuses an overwrite; reload before retrying. A read-only tenant hides write controls and refuses writes."] },
  "customer-order-detail": { title: "Maintaining a customer order", body: ["Cancel ends an Open document before any processing. Close Early abandons the remainder after processing, without reversing stock or recorded work. The confirmation lists abandoned quantities; terminal documents cannot be reopened manually. Both roles may act, except in a read-only tenant. Headers stay Open while any line is Open; all Completed means Completed, all Cancelled means Cancelled, and a mixture means Closed Early. Use a line’s action to resolve that line alone, or the header action for all Open remainders.", "Both roles can create and edit customer orders under Transactions. Choose one active customer and one location for the header; each line has its own material, positive quantity, unit and required date. Orders start Open with zero fulfilled. Entering an order moves no stock. Stored quantities use the material’s base unit; the entered amount and factor stay in history. A customer may be deactivated while existing orders continue. A stale version refuses an overwrite; reload before retrying. A read-only tenant hides write controls and refuses writes.", "The order's page shows each line's outstanding quantity and the order's shipments, and Create shipment plans a dispatch: see Shipments and goods issues. Goods issues fulfil the lines; a line delivered in full is Completed, and so is the order once every line is. Lowering a delivered line to exactly what was delivered completes it too."] },
  "getting-started": {
    title: "Getting started with CPG",
    body: [
      "CPG is a small MRP II planning tool: it turns what customers want into plans for what to buy and what to make.",
      "Sign in on the sign-in page with the account the administrator gave you. The built-in administrator signs in as admin.",
      "The sidebar on the left of every page lists the screens your account can open: the TEST | PROD switch at the top, the tenant's own screens (Overview, Master data, Audit) under it, and the screens shared by both tenants, Help included, at the bottom. The button at the top of the sidebar, or Ctrl+B (⌘B on a Mac), shrinks it to icons and back. On a phone, open it with the Menu button. Every new screen of CPG adds its own topic here.",
    ],
  },
  "signing-in": {
    title: "Signing in",
    body: [
      "Choose Sign in on the homepage or at the top of the page, enter your username and password, then choose Sign in.",
      "If either is wrong you see “Invalid username or password.” CPG never says which of the two was wrong.",
      "After several failed attempts, signing in pauses for 15 minutes. Wait, then try again.",
      "A session lasts 12 hours. Sign out from your account card, with your name, at the bottom of the sidebar when you are done.",
    ],
  },
  "admin-home": {
    title: "Cave control",
    body: [
      "Cave control is the page every account lands on after signing in: choose the Test or Prod tenant there. Your language and theme, your API tokens and Sign out are in your account card at the bottom of the sidebar. There is no password change: only the administrator sets passwords.",
      "The administrator opens this page from Administration → Tenants in the sidebar, next to Users, and also sees the Database card here. The card shows where CPG keeps its data, how many migrations are applied, whether any are still pending, and how many settings are stored.",
      "A pending migration normally means CPG is still starting. If it stays, tell whoever runs CPG.",
      "The administrator's Read-only card makes Test or Prod read-only, and writable again, after a confirmation. Each tenant has its own flag, and every change is kept in the Global audit. A read-only tenant shows Read-only on the chooser, a lock on its side of the TEST | PROD switch, and a banner on its pages.",
      "Reset Test, on this page for the administrator, permanently replaces Test business data and its audit with a fresh demonstration dataset, generated for today, and a new generation. Pick the dataset first: Tiny, two months of history, is written in a moment and is what a new installation starts with; Realistic, two years of history, takes up to a minute, and CPG answers nobody else until it is done. It restores the previous read-only flag. Prod, users, sessions, tokens, preferences and Global audit survive. Old Test forms must reload. The API is POST /api/tenants/test/reset with an empty object for tiny or { \"dataset\": \"realistic\" }, an admin bearer token, Idempotency-Key and the current Dataset-Generation. After a lost response, fetch the new generation and retry the same key, never a new one.",
      "Open Test or Open Prod takes you to that tenant's business data.",
    ],
  },
  "test-and-prod": {
    title: "Test and Prod",
    body: [
      "CPG keeps two separate sets of business data: Test, with demonstration data that is safe to experiment with, and Prod, the live data.",
      "The row at the top of every page says which one you are working in: TEST in amber, PROD in dark with a red edge, or GLOBAL on pages shared by both, followed by where you are, such as Master data › Materials.",
      "Switch with TEST | PROD at the top of the sidebar: you stay on the same screen in the other tenant, or land on its list when you were on one record. On a page shared by both, the switch only changes which tenant the sidebar's screens open. Nothing you do in one ever appears in the other, and the same number can mean a different record in each.",
      "When the administrator makes a tenant read-only, the switch shows a lock on its side and a banner under the row at the top of its pages says so. Nobody can change its business data then, the administrator and the API included, so the buttons that would change it are gone. You can still read everything, including the audit, and change your own language, theme and API tokens.",
    ],
  },
  "managing-users": {
    title: "Managing users",
    body: [
      "Only the administrator opens Users, under Administration in the sidebar. Create user adds a normal user with a username (3–32 lowercase letters, digits, dots, dashes or underscores) and an initial password of at least 12 characters. Tell them the password yourself.",
      "Reset password, in a user's row menu, sets a new password and signs that user out everywhere at once.",
      "Deactivate signs the user out everywhere and stops them signing in. Reactivate lets them back in with their current password, so reset it too if the account may have been compromised.",
      "Users are never deleted: an account stays, so its history keeps its name. The built-in administrator can't be changed here.",
    ],
  },
  "api-tokens": {
    title: "API tokens",
    body: [
      "API tokens let a script or tool use the CPG API as you. Open API tokens from your account card at the bottom of the sidebar, choose Create token, give it a name and create it.",
      "The secret is shown once. Copy it straight away: CPG stores only a fingerprint of it and can never show it again. If you lose it, revoke the token and create a new one.",
      "Send the secret in every API request as the Authorization: Bearer header. The token can do exactly what your account can, in Test and Prod, and it never expires.",
      "Revoke ends a token at once. A password reset or a deactivation ends all of an account's tokens. Tokens can be listed and revoked through the API too, but only created here.",
      "Every API request that changes something needs an Idempotency-Key header: a fresh value, such as a UUID, for each change. If the answer is lost, send the same request with the same key again within 24 hours: CPG returns the first answer and changes nothing twice. A key reused for a different request is refused.",
      "To change a record (a user, a material or one of its unit conversions, a location, a customer or a supplier), send the version you read with it, from GET /api/users or the tenant's GET routes. If someone changed the record since, CPG refuses with a version conflict and keeps their change: read it again and retry. For writes to the Test tenant, also send the Dataset-Generation header with the generation from GET /api/tenants/test.",
    ],
  },
  "global-audit": {
    title: "The Global audit",
    body: [
      "Global audit, at the bottom of the sidebar, opens every change to accounts and to the tenants' settings, newest first. It lists users created, passwords reset, accounts deactivated or reactivated, language or theme changes, API tokens created or revoked, and a tenant made read-only or writable again. A token ended by a password reset or a deactivation is listed as revoked too.",
      "Each entry shows when it happened (in UTC), the account that made it, the session it came from, the channel (UI for CPG's screens, API for programs) and what changed, as before → after.",
      "A password reset is listed without the password: CPG never records passwords or their hashes. When the administrator's password is changed in the server's settings, the administrator's API tokens end at the next restart without an entry here.",
      "Every account can read the audit, and nobody can change or delete an entry, not even the administrator. Older entries shows the previous page.",
      "To trace one account or record, filter by record type and ID, account, channel and a range of days (UTC, both included), then Apply. Clear filters shows everything again. Each entry's subject opens that record's history. A filtered view is a link you can bookmark, and the API takes the same filters: GET /api/audit?subjectType=User&account=alice.",
    ],
  },
  "tenant-audit": {
    title: "A tenant's audit",
    body: [
      "Audit, in the sidebar under the tenant's screens (or Audit — Test or Audit — Prod on the tenant's page), opens that tenant's own audit: the changes to its business records, kept apart from the other tenant's.",
      "It lists every material, location, customer and supplier created, changed, deactivated or reactivated, every unit conversion, planning parameter set, safety-stock target and forecast added, changed or removed, and every BOM created, revised, deactivated or reactivated, with the values before and after. It also lists every document and stock posting: purchase requisitions and orders, goods receipts, customer orders, shipments and goods issues, transfers, production orders and completions, stock corrections and reversals. Account changes are always in the Global audit.",
      "To trace one record, open its subject, or filter by record type and ID, account, channel and a range of days (UTC, both included). A filtered view is a link you can bookmark, and the API takes the same filters: GET /api/tenants/test/audit?subjectType=PurchaseOrder&subjectId=00000012.",
      "A stock posting shows its business date under the audit time: the day it counts in stock, which can differ from when it was recorded. A reversed movement says Reversed by, and the movement that reverses it says Reverses; each links to the other's history, and Changes shows the reason.",
      "Like the Global audit, it is read-only for everyone.",
    ],
  },
  materials: {
    title: "Materials",
    body: [
      "Materials, under Master data in the sidebar, lists that tenant's materials by ID. Test and Prod each have their own: material 00000001 in Test and 00000001 in Prod are different records.",
      "Every material has an eight-digit ID that CPG assigns in order when it is created (00000001, 00000002, …) and that never changes, a type, a description and a base unit.",
      "The type is raw (bought), intermediate (made and used to make other materials) or finished (made and sold). The base unit is the unit every quantity of the material is stored in, exactly to six decimals. A material can't become raw while a location makes it (planning parameters set to Make).",
      "Every account can read materials. Only the administrator creates and changes them, with Create material here and Edit on a material's page; through the API too, with the same rules.",
    ],
  },
  "material-conversions": {
    title: "A material and its unit conversions",
    body: [
      "Choose a material's ID to open its page: its type, base unit and status, and its unit conversions.",
      "A conversion lets people enter quantities in another unit, such as a case of 12. It reads 1 case = 12 each: the alternate quantity and unit, then the base quantity and the base unit. A quantity entered in that unit is converted into the base unit once, rounded half-up to six decimals, and the unit and factor it was entered with are kept. The inverse is shown for orientation only.",
      "Changing or removing a conversion never changes quantities already stored. The base unit can change only while the material has no conversions, planning parameters, safety-stock targets or forecasts, since their values are in it. Once any BOM uses the material, as its output or as a component, neither its type nor its base unit can change again.",
      "Deactivate keeps the material and its history, but it can't be picked for new entries; Reactivate undoes that. Every change appears in the tenant's audit.",
    ],
  },
  locations: {
    title: "Locations",
    body: [
      "Locations, under Master data in the sidebar, lists the sites where that tenant's materials are made and stocked. Test and Prod each have their own: location 00000001 in Test and 00000001 in Prod are different records.",
      "Every location has an eight-digit ID that CPG assigns in order when it is created (00000001, 00000002, …) and that never changes, a name and a status. Names don't have to be unique.",
      "Every account can read the list. Only the administrator creates, renames, deactivates and reactivates locations, with Create location and each row's ⋯ menu; through the API too, with the same rules.",
      "Deactivate keeps the location and everything that already uses it, but it can't be picked for new entries; Reactivate undoes that. Every change appears in the tenant's audit.",
    ],
  },
  customers: {
    title: "Customers",
    body: [
      "Customers, under Master data in the sidebar, lists who that tenant sells to. Test and Prod each have their own: customer 00000001 in Test and 00000001 in Prod are different records.",
      "Every customer has an eight-digit ID that CPG assigns in order when it is created (00000001, 00000002, …) and that never changes, a name and a status. Names don't have to be unique.",
      "Every account can read the list. Only the administrator creates, renames, deactivates and reactivates customers, with Create customer and each row's ⋯ menu; through the API too, with the same rules.",
      "Deactivate keeps the customer and everything that already uses it, but it can't be picked for new entries; Reactivate undoes that. Every change appears in the tenant's audit.",
    ],
  },
  suppliers: {
    title: "Suppliers",
    body: [
      "Suppliers, under Master data in the sidebar, lists who that tenant buys from. Test and Prod each have their own: supplier 00000001 in Test and 00000001 in Prod are different records.",
      "Every supplier has an eight-digit ID that CPG assigns in order when it is created (00000001, 00000002, …) and that never changes, a name and a status. Names don't have to be unique.",
      "Every account can read the list. Only the administrator creates, renames, deactivates and reactivates suppliers, with Create supplier and each row's ⋯ menu; through the API too, with the same rules.",
      "Deactivate keeps the supplier and everything that already uses it, but it can't be picked for new entries; Reactivate undoes that. Every change appears in the tenant's audit.",
    ],
  },
  "planning-parameters": {
    title: "Planning parameters",
    body: [
      "Planning parameters, under Master data in the sidebar, tell MRP how each material is supplied at each location: Make (production) or Buy (purchasing), the lead time in whole calendar days, and the minimum lot and lot multiple a proposal must respect, in the material's base unit.",
      "A raw material is always bought. An intermediate or finished material can be made at one location and bought at another. Without a set, MRP will report the material's parameters at that location as missing.",
      "Every account can read the list. Only the administrator adds, changes and removes sets, with Add parameters and each row's ⋯ menu; through the API too, with the same rules. Only active materials and locations can get a new set; existing sets stay when either is deactivated.",
      "Every change appears in the tenant's audit. A material's base unit can't change while it has planning parameters.",
    ],
  },
  "safety-stock": {
    title: "Safety stock",
    body: [
      "Safety stock, under Master data in the sidebar, lists the minimum stock to keep of a material at a location. Each target applies from its date until the next target for the same material and location; with no target in force, the target is 0.",
      "Two targets can't share a date. To change a target's quantity, use Change target; to move it, remove it and add one on the new date. A target of 0 ends a buffer from its date.",
      "The status says which target is in effect today (UTC), which ones are scheduled for later, and which earlier ones a later target has replaced.",
      "Every account can read the list. Only the administrator adds, changes and removes targets, with Add target and each row's ⋯ menu; through the API too. Every change appears in the tenant's audit.",
    ],
  },
  forecasts: {
    title: "Forecasts",
    body: [
      "Forecasts, under Sales in the sidebar, list the demand you expect per material, location and day. A forecast names no customer. The MRP run nets customer orders against it, so a forecast is the demand beyond the firm orders.",
      "Enter the quantity in the material's base unit, or in any unit the material converts, such as 2 cases; CPG stores it in the base unit. A material, location and day can have only one forecast. To change the quantity, use Change forecast; to move the day, remove the forecast and add one on the new day.",
      "Choose a material and/or a location above the list and select Filter to see their quantities day by day. Clear filter shows everything again. The list is ordered by material, location and day, 100 per page; Previous and Next under it keep the filter.",
      "Every account can read the list. Only the administrator adds, changes and removes forecasts, with Add forecast and each row's ⋯ menu; through the API too. Only active materials and locations can get a new forecast. Every change appears in the tenant's audit, and a removal keeps the quantity it held.",
    ],
  },
  boms: {
    title: "BOMs",
    body: [
      "BOMs (bills of materials), under Master data in the sidebar, list that tenant's recipes. A BOM makes one intermediate or finished material, its output, from raw and intermediate components; the quantities are for one base unit of the output. Each BOM has an eight-digit ID that CPG assigns in order and that never changes.",
      "One output can have several BOMs, its alternatives. Each has a priority (1 is the highest) and a validity: from a date, through a date or with no end, both days included. Two active alternatives for the same output can't have the same priority on any shared day.",
      "A component can be entered in any unit the material converts, such as 2 cases; CPG stores it in the material's base unit (24 each) and keeps what was entered. A recipe can't use its own output, directly or through other BOMs: CPG shows the cycle it would make.",
      "Every account can read BOMs. Only the administrator creates and changes them, with Create BOM here and Edit recipe on a BOM's page; through the API too, with the same rules. Only active materials can be picked.",
    ],
  },
  "bom-revisions": {
    title: "A BOM and its revisions",
    body: [
      "Choose a BOM's ID to open its page: its output, status, priority and validity, the recipe of its current revision, and every revision.",
      "A recipe never changes in place. Saving a real change to the priority, the dates or the components creates a new revision; the old ones stay readable from Revisions, unchanged, for the orders that will use them. Saving the same recipe, or entering the same quantity in another unit, creates nothing.",
      "Changing a unit conversion later doesn't change a saved recipe: the line keeps its quantity and the factor it was entered with. To use a new factor, enter the line again.",
      "Deactivate keeps the BOM and its revisions, but it can't be chosen for new orders; Reactivate undoes that after checking its priority again. Neither creates a revision. Every change appears in the tenant's audit.",
    ],
  },
  "purchase-requisitions": {
    title: "Purchase requisitions",
    body: ["Cancel ends an Open document before any processing. Close Early abandons the remainder after processing, without reversing stock or recorded work. The confirmation lists abandoned quantities; terminal documents cannot be reopened manually. Both roles may act, except in a read-only tenant. Headers stay Open while any line is Open; all Completed means Completed, all Cancelled means Cancelled, and a mixture means Closed Early.",
      "Purchase requisitions, under Transactions in the sidebar, list what the tenant needs to buy: one material at one location, a quantity and the date it is needed. CPG gives each an eight-digit ID, in order. A new requisition is Open with nothing converted.",
      "A purchase order converts a requisition, wholly or in parts, possibly to different suppliers. Converted shows how much orders have taken so far and Outstanding what is left; when everything is converted the requisition becomes Completed.",
      "A requisition is planned supply only: it never changes stock. The quantity can be entered in any unit the material converts; CPG stores it in the base unit and keeps what was entered.",
      "Every account can create and read requisitions, with Create requisition here and through the API; only active materials and locations can be picked. A read-only tenant refuses new ones. A location with an Open requisition can't be deactivated. Every change appears in the tenant's audit.",
      "Change date on an Open requisition sets a new required date, here or through the API with PATCH, at the version you loaded; the material, location and quantity never change. A read-only tenant refuses it. Every change appears in the tenant's audit.",
    ],
  },
  "purchase-orders": {
    title: "Purchase orders",
    body: [
      "Purchase orders, under Transactions in the sidebar, list the tenant's orders to suppliers. An order has one supplier, one location and 1 to 100 lines, each with its own planned date. Each order gets an eight-digit ID; a new order is Open.",
      "Create an order directly, or give a line an open requisition of the same material and location: the line then converts that much of the requisition, up to what is outstanding, and the requisition is Completed once fully converted.",
      "A line can't be for another location than the order's. Only active suppliers, locations and materials can be picked; an order made earlier stays usable if its supplier is deactivated later.",
      "An order is planned supply: only the goods receipts posted on its page raise stock. It is Completed once every line has received its quantity. Every account can create and read orders, here and through the API; a read-only tenant refuses new ones. A material with an open order line can't be deactivated, nor a location an Open order delivers to.",
    ],
  },
  "purchase-order": {
    title: "A purchase order and its lines",
    body: [
      "Cancel ends an Open document before any processing. Close Early abandons the remainder after processing, without reversing stock or recorded work. The confirmation lists abandoned quantities; terminal documents cannot be reopened manually. Both roles may act, except in a read-only tenant. Headers stay Open while any line is Open; all Completed means Completed, all Cancelled means Cancelled, and a mixture means Closed Early. Use a line’s action to resolve that line alone, or the header action for all Open remainders.",
      "Reverse a full receipt, issue or correction line from its history or Stock. Give a reason; the inverse posts today and the original stays linked and unchanged. To correct an amount, reverse it then post the corrected amount. Partial reversals are unavailable. A stock shortage refuses the whole reversal. If a temporary positive correction is needed, enter it manually and reverse that temporary correction after the corrected receipt; never leave that extra stock in the balance. Reversed issues restore order progress but keep posted customer, location and line identity locked.",
      "Choose an order's ID to open its page: its supplier, location, status and every line, with the quantity in the material's base unit, the unit it was entered in, the planned date and the requisition it converted, if any.",
      "Each line shows what has been received and what is still outstanding. Post goods receipt records what arrived: a quantity per line, in any unit the material converts, leaving the other lines empty. Stock rises at the order's location with today's date, and the lines and the order update in the same step, or nothing is posted.",
      "A receipt may be partial, repeated or larger than what is outstanding: an excess is accepted and named in a warning. Once every line has received its quantity the order is Completed and takes no more receipts. Receipts can't be changed; they are listed under Goods receipts, newest first.",
      "Change date on an Open line sets its planned date, also after receipts, while the order is Open. The API changes planned dates with PATCH, several lines at once if needed. Both work at the version you loaded, and each change appears in the tenant's audit. The supplier, the location and a line's material, unit and quantity never change.",
    ],
  },
  transfers: {
    title: "Transfers",
    body: [
      "Transfers, under Transactions in the sidebar, move one material from one location to another. A transfer has a planned quantity, in any unit the material converts, and a planned dispatch and arrival date: the arrival can't be before the dispatch, and the two locations must differ. Each transfer gets an eight-digit ID; a new one is Open.",
      "Creating a transfer changes no stock. Its page dispatches it (stock leaves the source into transit), receives it (stock leaves transit onto the destination) and writes off what was lost on the way. A transfer moves one material: create one transfer per material.",
      "Every account can create and read transfers, here and through the API; only active materials and locations can be picked, and a read-only tenant refuses new ones. A location with an Open transfer from or to it, and a material with an Open transfer, can't be deactivated. The API lists GET /api/tenants/{tenant}/transfers?page=1 and creates with POST to the same path.",
    ],
  },
  transfer: {
    title: "A transfer: dispatch, receive, write off",
    body: ["Cancel ends an Open document before any processing. Close Early abandons the remainder after processing, without reversing stock or recorded work. The confirmation lists abandoned quantities; terminal documents cannot be reopened manually. Both roles may act, except in a read-only tenant. Headers stay Open while any line is Open; all Completed means Completed, all Cancelled means Cancelled, and a mixture means Closed Early. Clear all in-transit stock by receipt or write-off first; written-off quantity remains loss, and closing includes it in abandonment.",
      "A transfer's page shows its route, its planned dates and quantities: planned, dispatched, still to dispatch, in transit, received and written off. Stock in transit belongs to the transfer: neither location can use it, and the Stock page shows it apart from the physical balance.",
      "Dispatch takes stock off the source into transit, up to what is left to dispatch and never more than the source holds. Receive lands part or all of what is in transit at the destination, never more. Write off takes a quantity lost on the way out of transit, with a reason; no location changes, and a stock correction can't touch transit. Each posting is dated today and writes both of its sides in one step, or nothing.",
      "Once the whole planned quantity is received the transfer is Completed and takes no more postings. A transfer with a write-off stays Open until it is closed early. Postings can't be changed; the ledger lists each with what it moved, newest first.",
      "Reversing a posting: choose Reverse beside a dispatch, receipt or write-off in the ledger and give a reason. The whole posting is reversed once, today, and both stay in the ledger, linked. A reversed receipt takes its quantity off the destination back into transit, and the destination must still hold it. A reversed write-off puts the loss back into transit. A dispatch can be reversed only after every receipt and write-off of the transfer is reversed; it then returns the stock to the source. Afterwards the transfer is Open again, even if it was Completed or Closed Early, with nothing abandoned. Its material and locations must be active. There is no partial reversal. The API offers POST …/postings/{postingId}/reverse with { reason }.",
      "Change dates edits the planned dates while the transfer is Open, at the version you loaded. The API offers PATCH /api/tenants/{tenant}/transfers/{id} for dates, and POST …/dispatches, …/receipts and …/write-offs for postings, each with a bearer token, an idempotency key and, in Test, the dataset generation.",
    ],
  },
  shipment: {
    title: "Shipments and goods issues",
    body: [
      "Reverse a full receipt, issue or correction line from its history or Stock. Give a reason; the inverse posts today and the original stays linked and unchanged. To correct an amount, reverse it then post the corrected amount. Partial reversals are unavailable. A stock shortage refuses the whole reversal. If a temporary positive correction is needed, enter it manually and reverse that temporary correction after the corrected receipt; never leave that extra stock in the balance. Reversed issues restore order progress but keep posted customer, location and line identity locked.",
      "A shipment plans what leaves against one customer order. On the order's page, Create shipment asks for the planned date and a quantity per line, in any unit the material converts, leaving the other lines empty. A line can't plan more than it still has outstanding. Creating a shipment moves no stock and fulfils nothing.",
      "Choose a shipment's ID to open its page: its order, customer, location, planned date and status, and per line what is planned, what has been issued and what is still to issue.",
      "Post goods issue records what actually left: a quantity per line. Stock falls at the order's location with today's date, and the order's lines are fulfilled, in the same step, or nothing is posted. A line can't issue more than it has to issue (the smaller of what the shipment still plans and what the order line still has outstanding), or more than is in stock: the refusal says how much is available.",
      "The issue that delivers a line in full completes it, and the order is Completed once every line is. A shipment is Completed once nothing is left to issue on it. Goods issues can't be changed; they are listed under Goods issues, newest first. Once a line has been issued, its material, unit and required date, the order's customer and location, and a quantity below what was delivered can't be changed.",
      "Edit shipment changes an Open shipment's planned date and lines: raise a line as long as what is left to issue on it stays within what its order line still has outstanding, lower it down to what it has issued, empty a line nothing was ever issued against to remove it, or fill an order line's empty row to add it. Removed line numbers are never reused. Lowering every line to what it issued completes the shipment. Cancel shipment ends an Open shipment nothing was ever issued against, even an issue reversed since: it plans nothing more, and stock and the order are not changed. A Completed or Cancelled shipment can't be edited or cancelled. A stale version refuses the change; reload and try again. A read-only tenant hides both.",
    ],
  },
  import: {
    title: "Import from spreadsheet",
    body: [
      "Import, under Master data in the sidebar, loads or updates the tenant's master data and BOMs from one .xlsx workbook. Only the administrator sees it, and it is blocked while the tenant is read-only. Run it when nobody else is changing data: while it runs, other changes wait.",
      "Download the template: it has a sheet for materials, unit conversions, locations, customers, suppliers, planning parameters and safety stock, and two for BOMs, plus instructions in English and Polish. Fill only the sheets you need and keep each sheet's header row. A blank ID creates a record, an existing ID updates it, and an ID that doesn't exist is an error. Nothing is ever deleted by an import.",
      "Sheets are applied in the template's order, so a planning row can use a material the Materials sheet creates: the dry run shows the ID it will get. A BOM's lines are its complete recipe: a component left out is removed in a new revision, an identical recipe creates no revision, and a new BOM's lines name its header by an import reference you choose.",
      "Upload the workbook and run the dry run: it checks every row with the same rules as the screens, writes nothing, and lists every problem by sheet, row and column, or shows what would be created, changed or left unchanged. Only a dry run without problems can be committed, and the commit writes everything in one go or nothing. If anything the workbook uses changed since the dry run, the commit is refused: run the dry run again. At most 2000 rows and 512 KB per workbook. The API offers the same: GET /api/import/template, and POST /api/tenants/{tenant}/import/dry-run and /commit with the workbook as base64.",
    ],
  },
  stock: {
    title: "Physical stock and corrections",
    body: [
      "Reverse a full receipt, issue or correction line from its history or Stock. Give a reason; the inverse posts today and the original stays linked and unchanged. To correct an amount, reverse it then post the corrected amount. Partial reversals are unavailable. A stock shortage refuses the whole reversal. If a temporary positive correction is needed, enter it manually and reverse that temporary correction after the corrected receipt; never leave that extra stock in the balance. Reversed issues restore order progress but keep posted customer, location and line identity locked.",
      "Stock in the tenant menu shows the exact physical balance and recent movements for a selected material and location. A pair without movements has zero stock. Test and Prod are separate; a fresh Test holds two years of demonstration history: receipts, production completions and goods issues, each linked to its document.",
      "Either role can post a reasoned correction while the tenant and masters are writable and active. Enter a signed change: 5 adds five and -5 removes five. Pick the base unit or a defined conversion; it converts once, half-up to six decimals, and keeps the entered quantity, unit and factor. The server uses today's UTC business date; backdating and future dating are unavailable. A correction that would make stock negative is refused with the available quantity.",
      "Opening balances and physical customer returns are ordinary positive corrections with a reason; there is no return document. Every user correction creates an immutable stock movement and a separate before/after audit entry. Each movement shows its type and its source document: a goods receipt links to its purchase order, a goods issue to its shipment, a transfer dispatch or receipt to its transfer, a production completion to its production order; a correction (also from a stock import) is its own source. The actor, the posting ID and the unit/factor appear in movement details. Installation openings are explicitly labelled Installation. The ledger shows 100 movements per page, newest first, while the balance includes all movements.",
      "To set many positions at once, such as an opening balance or a stock count, use Stock import (Import from spreadsheet on this screen): you write the quantity each position should have, not the change.",
      "A material with any movement keeps its type and base unit forever, even after returning to zero. Nonzero stock prevents material or location deactivation. The API reads GET /api/tenants/{tenant}/stock?material=00000001&location=00000001&page=1 and posts POST /api/tenants/{tenant}/stock/corrections with a bearer token, idempotency key, current Test generation and material, location, signed quantity, unit and reason.",
    ],
  },
  "variance-report": {
    title: "Variance report",
    body: [
      "Variance report in the tenant menu compares what production recorded with what each production order planned. Each order with completions is one row: its target against what its completions produced (the output variance, produced − target), and for every component the expected quantity, the actual quantity, the variance (actual − expected) and the waste, all in the material's base unit. Expected is what the order's pinned BOM revision asks for the output actually produced, as stored when each completion was posted; it is never recalculated from a later recipe.",
      "An input that isn't in the pinned recipe is marked Extra: it expected nothing, so its whole actual is variance. A completion with zero output is a waste posting: it produces nothing, is counted under Waste postings, and what it used shows in each component's Waste as well as in its actual. A reversed completion is counted nowhere and its ID is listed under Reversed. Open the order to see each completion on its own.",
      "Filter by material (the order's output, or a component its completions expected or used), location, state, and a From–To range of posting dates. With a date range only the completions posted in it are counted, so no output variance is shown: the target belongs to the whole order. Orders are listed by ID, 50 per page. The report shows no cost, value or capacity figure.",
      "Both roles can read the report, also in a read-only tenant, and Test and Prod each show only their own orders. The API returns the same report: GET /api/tenants/{tenant}/reports/variance?material=00000001&location=00000001&status=open&from=2026-10-01&to=2026-10-31&page=1 (every parameter optional), with a bearer token or a signed-in session. A material or location the tenant doesn't have is not found; an end date before the start date is refused.",
    ],
  },
  "stock-report": {
    title: "Stock report",
    body: [
      "Stock report in the tenant menu lists, for every material and location, the physical stock on hand now and the stock in transit: out (dispatched from this location and not yet received or written off) and in (dispatched to this location). All are in the material's base unit. Stock in transit belongs to its transfer, so neither location can use it: it is never added to on hand.",
      "A material and location appear once anything was posted there or an Open transfer has stock on the road from or to it. Filter by material and location; rows that are all zero are hidden unless you tick Show rows that are all zero. Rows are ordered by material, then location, 100 per page.",
      "Ledger opens the Stock page for that material and location: its balance, its transit with links to the transfers, and every movement with its date, type, signed quantity, reason and source document, linked. Both roles can read the report, also in a read-only tenant, and Test and Prod each show only their own stock.",
      "The API returns the same report: GET /api/tenants/{tenant}/reports/stock?material=00000001&location=00000001&includeZero=true&page=1 (every parameter optional), with a bearer token or a signed-in session. A material or location the tenant doesn't have is not found.",
    ],
  },
  "stock-import": {
    title: "Stock import",
    body: [
      "Stock import, next to Stock in the sidebar, sets physical stock from one .xlsx workbook: an opening balance, or the result of a stock count. Both roles can use it while the tenant is writable. Download the template: one Stock sheet with Material ID, Location ID, Physical quantity and Unit, and instructions in English and Polish.",
      "Write the quantity each position should have, not the change. The import computes each movement from the current physical balance: 85 where 100 is held posts -15, 130 posts +30, the same quantity is No change and posts nothing, and 0 empties the position. Positions you leave out are untouched, at every location. A quantity in another unit (2 case) is converted with the material's current conversion, so 2 cases of 12 mean 24 each in stock, not 24 more. In-transit stock belongs to its transfer and is never a location's balance: write it off on the transfer.",
      "The dry run reads the balances, writes nothing, and lists each position's movement, or every problem by row and column: a negative quantity, an unknown or inactive material or location, a unit without a conversion, or the same position twice. Only a dry run without problems can be committed, with one reason for every movement, such as Opening balance or Stock count 2027-01. The commit posts all the movements as one ordinary correction, audited with your account, or nothing. If any listed balance changed since the dry run, the commit is refused: run the dry run again.",
      "At most 2000 rows and 512 KB per workbook. The API offers the same: GET /api/stock-import/template, and POST /api/tenants/{tenant}/stock-import/dry-run with the workbook as base64, then /commit with the workbook, the dry run's previewToken and a reason.",
    ],
  },
  "language-and-theme": {
    title: "Language and theme",
    body: [
      "Choose English or Polski, and Light or Dark, in your account card at the bottom of the sidebar.",
      "The choice belongs to your account: it stays after you sign out, follows you to other browsers, and never changes anyone else's.",
      "Before you sign in, CPG shows English and the light theme.",
    ],
  },
  "using-help": {
    title: "Using help",
    body: [
      "Type one or more words and choose Search. Topics that contain every word are shown.",
      "Capital letters and Polish diacritics don't matter: “logowanie” and “LOGOWANIE” find the same topics, and so do “łatwo” and “latwo”.",
      "Every screen of CPG has at least one topic, and new screens add theirs.",
    ],
  },
};

const pl: Record<HelpTopicId, HelpText> = {
  "production-orders": { title: "Zlecenia produkcyjne", body: ["Utwórz zlecenie na jeden wytwarzany materiał w jednej lokalizacji. Sprawdź aktywne receptury ważne na wybraną datę, wybierz wariant i przejrzyj aktualne niedobory. Niedobór nie blokuje planowania; utworzenie ani edycja nie zmienia zapasu. Rewizja BOM, przelicznik i czas realizacji w dniach kalendarzowych są zachowane. Na stronie szczegółów edytujesz ilość i datę końca. Zbiory tylko do odczytu pozwalają jedynie przeglądać."] },
  "production-order-detail": { title: "Zlecenie produkcyjne", body: ["Anuluj kończy otwarty dokument przed zapisaniem operacji. Zamknij wcześniej porzuca resztę po rozpoczęciu realizacji, bez odwracania zapasu ani zapisanych operacji. Potwierdzenie pokazuje porzucane ilości; zakończonego dokumentu nie można ręcznie otworzyć ponownie. Obie role mogą działać, poza zbiorem tylko do odczytu. Nagłówek pozostaje otwarty, gdy jest otwarty wiersz; wszystkie zrealizowane oznaczają Zrealizowane, wszystkie anulowane — Anulowane, a pozostałe kombinacje — Zamknięte wcześniej. Raport z zerowym wyjściem zapisujący odpady też oznacza rozpoczęcie realizacji.", "Strona szczegółów pokazuje przypiętą rewizję BOM, zapisany przelicznik jednostek, zapisany czas realizacji w dniach kalendarzowych oraz składniki potrzebne jeszcze na ilość pozostałą (cel minus ilość wyprodukowana lub porzucona) z aktualnymi niedoborami: otwarte zlecenie na 100 z 40 wyprodukowanymi potrzebuje składników na 60. Zlecenie anulowane, zakończone lub zamknięte wcześniej nie potrzebuje składników i nie pokazuje niedoboru. W otwartym zleceniu edytujesz ilość lub planowany koniec: początek jest przeliczany z zapisanego czasu realizacji, a receptura pozostaje przypięta. Planowanie nie zmienia zapasu; zbiory tylko do odczytu pozwalają jedynie przeglądać.", "Księgowanie wykonania: wybierz Zaksięguj wykonanie, podaj ilość wytworzoną (0 oznacza odpad) i Dalej. Każdy składnik receptury startuje od tego, czego przypięta receptura oczekuje dla tej ilości, np. 0,5 kg na batonik × 4 batoniki = 2 kg; zmień go na faktyczne zużycie i dodaj ewentualny dodatkowy surowiec lub półprodukt. Księgowanie dodaje wyrób i zużywa wszystkie materiały w lokalizacji zlecenia jednym księgowaniem z dzisiejszą datą oraz zapisuje dla każdego materiału ilość oczekiwaną, rzeczywistą i odchylenie. Jeśli któregoś materiału brakuje, nic się nie księguje. Przekroczenie celu wymaga „Zaksięguj ponad plan”; osiągnięcie celu kończy zlecenie. Po zaksięgowaniu produkcji cel nie może spaść poniżej wyprodukowanej ilości.", "Odwracanie wykonania: wybierz Odwróć przy wykonaniu w historii i podaj powód. Całe wykonanie jest odwracane raz, z dzisiejszą datą: wyrób schodzi z zapasu, a każdy zużyty materiał wraca, w lokalizacji zlecenia, jednym księgowaniem. Jeśli wyrobu nie ma już w zapasie, nic nie zostanie odwrócone. Wytworzona ilość zlecenia maleje o ilość wyrobu; zlecenie Zakończone poniżej celu wraca do stanu Otwarte, a zlecenie Zamknięte wcześniej pozostaje zamknięte. Nie ma odwracania częściowego: aby poprawić ilość, odwróć wykonanie i zaksięguj właściwe. API udostępnia POST …/completions/{completionId}/reverse z { reason }."] },
  "customer-orders": { title: "Zamówienia klientów", body: ["Obie role mogą tworzyć i edytować zamówienia klientów w sekcji Transakcje. Wybierz aktywnego klienta i jedną lokalizację nagłówka; każda pozycja ma własny materiał, dodatnią ilość, jednostkę i wymagany termin. Nowe zamówienie jest Otwarte, z ilością zrealizowaną równą zero. Zapis nie zmienia zapasu. Ilości zapisuje się w jednostce bazowej, zachowując wprowadzoną ilość i przelicznik. Klienta można dezaktywować, a istniejące zamówienia nadal obsługiwać. Nieaktualna wersja nie nadpisze zmian: odśwież dane. Środowisko tylko do odczytu ukrywa przyciski zapisu i odmawia zmian."] },
  "customer-order-detail": { title: "Edycja zamówienia klienta", body: ["Anuluj kończy otwarty dokument przed zapisaniem operacji. Zamknij wcześniej porzuca resztę po rozpoczęciu realizacji, bez odwracania zapasu ani zapisanych operacji. Potwierdzenie pokazuje porzucane ilości; zakończonego dokumentu nie można ręcznie otworzyć ponownie. Obie role mogą działać, poza zbiorem tylko do odczytu. Nagłówek pozostaje otwarty, gdy jest otwarty wiersz; wszystkie zrealizowane oznaczają Zrealizowane, wszystkie anulowane — Anulowane, a pozostałe kombinacje — Zamknięte wcześniej. Działanie w wierszu kończy tylko ten wiersz; działanie nagłówka kończy wszystkie otwarte reszty.", "Obie role mogą tworzyć i edytować zamówienia klientów w sekcji Transakcje. Wybierz aktywnego klienta i jedną lokalizację nagłówka; każda pozycja ma własny materiał, dodatnią ilość, jednostkę i wymagany termin. Nowe zamówienie jest Otwarte, z ilością zrealizowaną równą zero. Zapis nie zmienia zapasu. Ilości zapisuje się w jednostce bazowej, zachowując wprowadzoną ilość i przelicznik. Klienta można dezaktywować, a istniejące zamówienia nadal obsługiwać. Nieaktualna wersja nie nadpisze zmian: odśwież dane. Środowisko tylko do odczytu ukrywa przyciski zapisu i odmawia zmian.", "Strona zamówienia pokazuje, ile pozostało w każdej pozycji, oraz wysyłki zamówienia, a przycisk Utwórz wysyłkę planuje wysyłkę: zobacz Wysyłki i wydania towaru. Wydania towaru realizują pozycje; pozycja dostarczona w całości jest Zakończona, a zamówienie, gdy wszystkie pozycje są zakończone. Obniżenie dostarczonej pozycji dokładnie do dostarczonej ilości również ją kończy."] },
  "getting-started": {
    title: "Pierwsze kroki z CPG",
    body: [
      "CPG to małe narzędzie do planowania MRP II: zamienia to, czego chcą klienci, w plany zakupów i produkcji.",
      "Zaloguj się na stronie logowania kontem, które dał ci administrator. Wbudowany administrator loguje się jako admin.",
      "Panel boczny po lewej stronie każdej strony pokazuje ekrany, które twoje konto może otworzyć: na górze przełącznik TEST | PROD, pod nim ekrany środowiska (Przegląd, Dane podstawowe, Audyt), a na dole ekrany wspólne dla obu środowisk, w tym Pomoc. Przycisk na górze panelu albo Ctrl+B (⌘B na Macu) zwija go do ikon i z powrotem. Na telefonie otwórz go przyciskiem Menu. Każdy nowy ekran CPG dodaje tu własny temat.",
    ],
  },
  "signing-in": {
    title: "Logowanie",
    body: [
      "Wybierz Zaloguj się na stronie głównej lub u góry strony, wpisz nazwę użytkownika i hasło, a następnie wybierz Zaloguj.",
      "Jeśli któreś z nich jest błędne, zobaczysz komunikat o nieprawidłowej nazwie użytkownika lub haśle. CPG nigdy nie mówi, które z nich było błędne.",
      "Po kilku nieudanych próbach logowanie zostaje wstrzymane na 15 minut. Odczekaj i spróbuj ponownie.",
      "Sesja trwa 12 godzin. Gdy skończysz, wyloguj się na karcie konta z twoją nazwą, na dole panelu bocznego.",
    ],
  },
  "admin-home": {
    title: "Kontrola jaskini",
    body: [
      "Reset środowiska Test jest dostępny tu tylko dla administratora. Trwale zastępuje dane biznesowe i audyt środowiska Test świeżym zbiorem danych demonstracyjnych, wygenerowanym na dziś, w nowej generacji. Najpierw wybierz zbiór: mały, z dwoma miesiącami historii, zapisuje się w chwilę i od niego zaczyna nowa instalacja; realistyczny, z dwoma latami historii, zapisuje się do minuty, a w tym czasie CPG nie odpowiada nikomu innemu. Przywraca poprzednią flagę tylko do odczytu. Prod, użytkownicy, sesje, tokeny, preferencje i audyt globalny pozostają bez zmian. Stare formularze Test trzeba odświeżyć. API: POST /api/tenants/test/reset z pustym obiektem dla małego zbioru lub { \"dataset\": \"realistic\" }, tokenem administratora, Idempotency-Key i aktualnym Dataset-Generation. Po utracie odpowiedzi pobierz nową generację i ponów ten sam klucz, nigdy nowy.",
      "Kontrola jaskini to strona, na którą trafia każde konto po zalogowaniu: wybierz tu środowisko Test lub Prod. Język i motyw, tokeny API oraz przycisk Wyloguj są na karcie konta na dole panelu bocznego. Nie ma tu zmiany hasła: hasła ustawia tylko administrator.",
      "Administrator otwiera tę stronę pozycją Administracja → Środowiska w panelu bocznym, obok Użytkowników, i widzi tu też kartę Baza danych. Karta pokazuje, gdzie CPG przechowuje dane, ile migracji zastosowano, czy jakieś jeszcze oczekują i ile ustawień zapisano.",
      "Oczekująca migracja zwykle oznacza, że CPG jeszcze się uruchamia. Jeśli nie znika, powiedz o tym osobie, która utrzymuje CPG.",
      "Karta Tylko do odczytu administratora po potwierdzeniu ustawia Test lub Prod tylko do odczytu i z powrotem jako zapisywalne. Każde środowisko ma własne ustawienie, a każda zmiana trafia do audytu globalnego. Środowisko tylko do odczytu jest tak oznaczone przy wyborze środowiska, ma kłódkę po swojej stronie przełącznika TEST | PROD i baner na swoich stronach.",
      "Przyciski Otwórz Test i Otwórz Prod prowadzą do danych biznesowych wybranego środowiska.",
    ],
  },
  "test-and-prod": {
    title: "Środowiska Test i Prod",
    body: [
      "CPG przechowuje dwa oddzielne zbiory danych biznesowych: Test z danymi demonstracyjnymi, na których można bezpiecznie eksperymentować, oraz Prod z danymi rzeczywistymi.",
      "Wiersz u góry każdej strony pokazuje, w którym środowisku pracujesz: TEST na bursztynowo, PROD na ciemno z czerwoną krawędzią albo GLOBAL na stronach wspólnych dla obu, a za nim miejsce, w którym jesteś, na przykład Dane podstawowe › Materiały.",
      "Przełączaj się przełącznikiem TEST | PROD na górze panelu bocznego: zostajesz na tym samym ekranie w drugim środowisku albo trafiasz na jego listę, jeśli byłeś na jednym rekordzie. Na stronie wspólnej dla obu przełącznik zmienia tylko to, które środowisko otwierają ekrany panelu. Nic, co zrobisz w jednym środowisku, nie pojawi się w drugim, a ten sam numer może oznaczać w każdym z nich inny rekord.",
      "Gdy administrator ustawi środowisko tylko do odczytu, przełącznik pokazuje kłódkę po jego stronie, a baner pod wierszem u góry jego stron to mówi. Nikt nie może wtedy zmienić jego danych biznesowych, także administrator i API, więc przyciski, które by je zmieniały, znikają. Nadal możesz wszystko czytać, także audyt, i zmieniać własny język, motyw i tokeny API.",
    ],
  },
  "managing-users": {
    title: "Zarządzanie użytkownikami",
    body: [
      "Ekran Użytkownicy, w sekcji Administracja panelu bocznego, otwiera tylko administrator. Utwórz użytkownika dodaje zwykłego użytkownika z nazwą (3–32 małe litery, cyfry, kropki, myślniki lub podkreślenia) i hasłem początkowym o długości co najmniej 12 znaków. Przekaż mu hasło osobiście.",
      "Resetuj hasło w menu wiersza ustawia nowe hasło i od razu wylogowuje tego użytkownika ze wszystkich sesji.",
      "Dezaktywuj wylogowuje użytkownika ze wszystkich sesji i blokuje logowanie. Aktywuj ponownie wpuszcza go z obecnym hasłem, więc zresetuj je także wtedy, gdy konto mogło zostać przejęte.",
      "Użytkownicy nigdy nie są usuwani: konto zostaje, więc historia zachowuje jego nazwę. Wbudowanego administratora nie można tu zmienić.",
    ],
  },
  "api-tokens": {
    title: "Tokeny API",
    body: [
      "Tokeny API pozwalają skryptowi lub narzędziu korzystać z API CPG w twoim imieniu. Otwórz Tokeny API z karty konta na dole panelu bocznego, wybierz Utwórz token, nadaj mu nazwę i utwórz go.",
      "Sekret jest pokazywany tylko raz. Skopiuj go od razu: CPG przechowuje wyłącznie jego odcisk i nigdy nie pokaże go ponownie. Jeśli go zgubisz, unieważnij token i utwórz nowy.",
      "Wysyłaj sekret w każdym żądaniu do API jako nagłówek Authorization: Bearer. Token może dokładnie to, co twoje konto, w środowiskach Test i Prod, i nigdy nie wygasa.",
      "Unieważnij natychmiast kończy działanie tokenu. Reset hasła lub dezaktywacja kończy działanie wszystkich tokenów konta. Tokeny można też wyświetlać i unieważniać przez API, ale tworzyć tylko tutaj.",
      "Każde żądanie do API, które coś zmienia, wymaga nagłówka Idempotency-Key: nowej wartości, na przykład UUID, dla każdej zmiany. Jeśli odpowiedź zginie, wyślij to samo żądanie z tym samym kluczem ponownie w ciągu 24 godzin: CPG zwróci pierwszą odpowiedź i niczego nie zmieni dwa razy. Klucz użyty ponownie do innego żądania zostanie odrzucony.",
      "Aby zmienić rekord (użytkownika, materiał lub jeden z jego przeliczników jednostek, lokalizację, klienta lub dostawcę), wyślij wersję, którą odczytałeś z GET /api/users lub z tras GET środowiska. Jeśli ktoś w międzyczasie go zmienił, CPG odmówi z konfliktem wersji i zachowa tamtą zmianę: odczytaj go ponownie i spróbuj jeszcze raz. Przy zapisach w środowisku Test wyślij też nagłówek Dataset-Generation z generacją z GET /api/tenants/test.",
    ],
  },
  "global-audit": {
    title: "Audyt globalny",
    body: [
      "Audyt globalny, na dole panelu bocznego, pokazuje każdą zmianę kont i ustawień środowisk, od najnowszej. Znajdziesz tu utworzonych użytkowników, zresetowane hasła, dezaktywowane i ponownie aktywowane konta, zmiany języka lub motywu, utworzone i unieważnione tokeny API oraz środowiska ustawione jako tylko do odczytu lub ponownie zapisywalne. Token usunięty przy resecie hasła lub dezaktywacji konta też jest tu zapisany jako unieważniony.",
      "Każdy wpis pokazuje, kiedy nastąpiła zmiana (w UTC), które konto ją wprowadziło, z jakiej sesji, jakim kanałem (Ekran dla ekranów CPG, Interfejs API dla programów) i co się zmieniło, jako przed → po.",
      "Reset hasła jest zapisany bez hasła: CPG nigdy nie zapisuje haseł ani ich skrótów. Gdy hasło administratora zmieni się w ustawieniach serwera, jego tokeny API przestają działać przy następnym uruchomieniu serwera, bez wpisu w tym audycie.",
      "Audyt może przeglądać każde konto, a nikt nie może zmienić ani usunąć wpisu, nawet administrator. Starsze wpisy pokazują poprzednią stronę.",
      "Aby prześledzić jedno konto lub rekord, filtruj według rodzaju i ID rekordu, konta, kanału i zakresu dni (UTC, oba dni włącznie), a potem wybierz Zastosuj. Wyczyść filtry znów pokazuje wszystko. Kolumna Dotyczy otwiera historię danego rekordu. Przefiltrowany widok to link, który można zapisać, a API przyjmuje te same filtry: GET /api/audit?subjectType=User&account=alice.",
    ],
  },
  "tenant-audit": {
    title: "Audyt środowiska",
    body: [
      "Audyt, w panelu bocznym pod ekranami środowiska (albo Audyt — Test lub Audyt — Prod na stronie środowiska), otwiera własny audyt tego środowiska: zmiany jego rekordów biznesowych, oddzielone od drugiego środowiska.",
      "Pokazuje każde utworzenie, zmianę, dezaktywację i ponowną aktywację materiału, lokalizacji, klienta lub dostawcy oraz każde dodanie, zmianę lub usunięcie przelicznika jednostek, parametrów planowania lub celu zapasu bezpieczeństwa, a także każde utworzenie, zmianę receptury, dezaktywację i ponowną aktywację BOM-u, z wartościami przed i po. Pokazuje też każdy dokument i każde księgowanie zapasu: zapotrzebowania i zamówienia zakupu, przyjęcia towaru, zamówienia klientów, wysyłki i wydania towaru, przesunięcia, zlecenia produkcyjne i ich wykonania, korekty zapasu i odwrócenia. Zmiany kont są zawsze w audycie globalnym.",
      "Aby prześledzić jeden rekord, otwórz go w kolumnie Dotyczy albo filtruj według rodzaju i ID rekordu, konta, kanału i zakresu dni (UTC, oba dni włącznie). Przefiltrowany widok to link, który można zapisać, a API przyjmuje te same filtry: GET /api/tenants/test/audit?subjectType=PurchaseOrder&subjectId=00000012.",
      "Księgowanie zapasu pokazuje pod czasem audytu datę księgowania: dzień, w którym liczy się w zapasie, który może różnić się od chwili zapisu. Odwrócony ruch ma dopisek Odwrócony przez, a ruch, który go odwraca, dopisek Odwraca; każdy prowadzi do historii drugiego, a Zmiany pokazują powód.",
      "Tak jak audyt globalny, jest tylko do odczytu dla wszystkich.",
    ],
  },
  materials: {
    title: "Materiały",
    body: [
      "Materiały, w sekcji Dane podstawowe panelu bocznego, wyświetlają materiały tego środowiska według ID. Test i Prod mają własne: materiał 00000001 w Test i 00000001 w Prod to różne rekordy.",
      "Każdy materiał ma ośmiocyfrowe ID, które CPG nadaje po kolei przy utworzeniu (00000001, 00000002, …) i które nigdy się nie zmienia, a także typ, opis i jednostkę bazową.",
      "Typ to surowiec (kupowany), półprodukt (wytwarzany i zużywany do innych materiałów) albo wyrób gotowy (wytwarzany i sprzedawany). Jednostka bazowa to jednostka, w której zapisywana jest każda ilość materiału, dokładnie do sześciu miejsc po przecinku. Materiał nie może stać się surowcem, dopóki jakaś lokalizacja go produkuje (parametry planowania ustawione na Produkcja).",
      "Materiały może przeglądać każde konto. Tworzy je i zmienia tylko administrator, przyciskiem Utwórz materiał tutaj i Edytuj na stronie materiału; także przez API, na tych samych zasadach.",
    ],
  },
  "material-conversions": {
    title: "Materiał i jego przeliczniki jednostek",
    body: [
      "Wybierz ID materiału, aby otworzyć jego stronę: typ, jednostkę bazową, status i przeliczniki jednostek.",
      "Przelicznik pozwala wpisywać ilości w innej jednostce, na przykład w kartonach po 12 sztuk. Czyta się go jako 1 karton = 12 szt.: ilość i jednostka alternatywna, potem ilość i jednostka bazowa. Ilość wpisana w tej jednostce jest przeliczana na jednostkę bazową raz, z zaokrągleniem połówek w górę do sześciu miejsc po przecinku, a jednostka i przelicznik, z którymi ją wpisano, zostają zapisane. Odwrotność jest tylko orientacyjna.",
      "Zmiana lub usunięcie przelicznika nigdy nie zmienia ilości już zapisanych. Jednostkę bazową można zmienić tylko wtedy, gdy materiał nie ma przeliczników, parametrów planowania ani celów zapasu bezpieczeństwa, ani prognoz, bo ich wartości są w niej zapisane. Gdy materiał trafi do jakiegokolwiek BOM-u, jako wyrób lub składnik, nie można już zmienić ani jego typu, ani jednostki bazowej.",
      "Dezaktywuj zachowuje materiał i jego historię, ale nie można go wybrać w nowych wpisach; Aktywuj ponownie to cofa. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  locations: {
    title: "Lokalizacje",
    body: [
      "Lokalizacje, w sekcji Dane podstawowe panelu bocznego, wyświetlają miejsca, w których jego materiały są wytwarzane i składowane. Test i Prod mają własne: lokalizacja 00000001 w Test i 00000001 w Prod to różne rekordy.",
      "Każda lokalizacja ma ośmiocyfrowe ID, które CPG nadaje po kolei przy utworzeniu (00000001, 00000002, …) i które nigdy się nie zmienia, a także nazwę i status. Nazwy nie muszą być unikalne.",
      "Lokalizacje może przeglądać każde konto. Tworzy je, zmienia ich nazwy, dezaktywuje i aktywuje ponownie tylko administrator, przyciskiem Utwórz lokalizację i menu ⋯ w każdym wierszu; także przez API, na tych samych zasadach.",
      "Dezaktywuj zachowuje lokalizację i wszystko, co już jej używa, ale nie można jej wybrać w nowych wpisach; Aktywuj ponownie to cofa. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  customers: {
    title: "Klienci",
    body: [
      "Klienci, w sekcji Dane podstawowe panelu bocznego, to ci, którym to środowisko sprzedaje. Test i Prod mają własne: klient 00000001 w Test i 00000001 w Prod to różne rekordy.",
      "Każdy klient ma ośmiocyfrowe ID, które CPG nadaje po kolei przy utworzeniu (00000001, 00000002, …) i które nigdy się nie zmienia, a także nazwę i status. Nazwy nie muszą być unikalne.",
      "Klientów może przeglądać każde konto. Tworzy ich, zmienia ich nazwy, dezaktywuje i aktywuje ponownie tylko administrator, przyciskiem Utwórz klienta i menu ⋯ w każdym wierszu; także przez API, na tych samych zasadach.",
      "Dezaktywuj zachowuje klienta i wszystko, co już go używa, ale nie można go wybrać w nowych wpisach; Aktywuj ponownie to cofa. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  suppliers: {
    title: "Dostawcy",
    body: [
      "Dostawcy, w sekcji Dane podstawowe panelu bocznego, to ci, od których to środowisko kupuje. Test i Prod mają własne: dostawca 00000001 w Test i 00000001 w Prod to różne rekordy.",
      "Każdy dostawca ma ośmiocyfrowe ID, które CPG nadaje po kolei przy utworzeniu (00000001, 00000002, …) i które nigdy się nie zmienia, a także nazwę i status. Nazwy nie muszą być unikalne.",
      "Dostawców może przeglądać każde konto. Tworzy ich, zmienia ich nazwy, dezaktywuje i aktywuje ponownie tylko administrator, przyciskiem Utwórz dostawcę i menu ⋯ w każdym wierszu; także przez API, na tych samych zasadach.",
      "Dezaktywuj zachowuje dostawcę i wszystko, co już go używa, ale nie można go wybrać w nowych wpisach; Aktywuj ponownie to cofa. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  "planning-parameters": {
    title: "Parametry planowania",
    body: [
      "Parametry planowania, w sekcji Dane podstawowe w menu bocznym, mówią MRP, jak każdy materiał jest zaopatrywany w każdej lokalizacji: Produkcja albo Zakup, czas realizacji w pełnych dniach kalendarzowych oraz minimalna partia i wielokrotność partii, których propozycja musi przestrzegać, w jednostce bazowej materiału.",
      "Surowiec jest zawsze kupowany. Półprodukt lub wyrób gotowy może być produkowany w jednej lokalizacji i kupowany w innej. Bez zestawu MRP zgłosi brak parametrów materiału w tej lokalizacji.",
      "Listę może przeglądać każde konto. Zestawy dodaje, zmienia i usuwa tylko administrator, przyciskiem Dodaj parametry i menu ⋯ w wierszu; także przez API, na tych samych zasadach. Nowy zestaw może dostać tylko aktywny materiał i aktywna lokalizacja; istniejące zestawy zostają po dezaktywacji.",
      "Każda zmiana pojawia się w audycie środowiska. Jednostki bazowej materiału nie można zmienić, dopóki ma on parametry planowania.",
    ],
  },
  "safety-stock": {
    title: "Zapas bezpieczeństwa",
    body: [
      "Zapas bezpieczeństwa, w sekcji Dane podstawowe w menu bocznym, to minimalny zapas materiału w lokalizacji. Każdy cel obowiązuje od swojej daty do następnego celu dla tego samego materiału i lokalizacji; gdy żaden cel nie obowiązuje, wynosi 0.",
      "Dwa cele nie mogą mieć tej samej daty. Aby zmienić ilość, użyj Zmień cel; aby przesunąć datę, usuń cel i dodaj nowy. Cel 0 kończy zapas od swojej daty.",
      "Status mówi, który cel obowiązuje dziś (UTC), które są zaplanowane na później, a które wcześniejsze zastąpił późniejszy cel.",
      "Listę może przeglądać każde konto. Cele dodaje, zmienia i usuwa tylko administrator, przyciskiem Dodaj cel i menu ⋯ w wierszu; także przez API. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  forecasts: {
    title: "Prognozy",
    body: [
      "Prognozy, w sekcji Sprzedaż w menu bocznym, to popyt, którego się spodziewasz, dla materiału, lokalizacji i dnia. Prognoza nie wskazuje klienta. Przebieg MRP bilansuje z nią zamówienia klientów, więc prognoza to popyt ponad twarde zamówienia.",
      "Ilość wpisz w jednostce bazowej materiału albo w każdej jednostce, którą materiał przelicza, na przykład 2 kartony; CPG zapisuje ją w jednostce bazowej. Materiał, lokalizacja i dzień mogą mieć tylko jedną prognozę. Aby zmienić ilość, użyj Zmień prognozę; aby przesunąć dzień, usuń prognozę i dodaj nową.",
      "Wybierz materiał i/lub lokalizację nad listą i naciśnij Filtruj, aby zobaczyć ich ilości dzień po dniu. Wyczyść filtr pokazuje znów wszystko. Lista jest uporządkowana według materiału, lokalizacji i dnia, po 100 na stronę; Poprzednia i Następna pod nią zachowują filtr.",
      "Listę może przeglądać każde konto. Prognozy dodaje, zmienia i usuwa tylko administrator, przyciskiem Dodaj prognozę i menu ⋯ w wierszu; także przez API. Nową prognozę mogą dostać tylko aktywne materiały i lokalizacje. Każda zmiana pojawia się w audycie środowiska, a usunięcie zachowuje ilość, którą prognoza miała.",
    ],
  },
  boms: {
    title: "BOM-y",
    body: [
      "BOM-y (struktury wyrobów), w sekcji Dane podstawowe w menu bocznym, to receptury tego środowiska. BOM wytwarza jeden półprodukt lub wyrób gotowy, swój wyrób, z surowców i półproduktów; ilości dotyczą jednej jednostki bazowej wyrobu. Każdy BOM ma ośmiocyfrowe ID, które CPG nadaje po kolei i które nigdy się nie zmienia.",
      "Jeden wyrób może mieć kilka BOM-ów, swoich alternatyw. Każda ma priorytet (1 to najwyższy) i okres ważności: od daty, do daty lub bez końca, oba dni się liczą. Dwie aktywne alternatywy tego samego wyrobu nie mogą mieć tego samego priorytetu w żadnym wspólnym dniu.",
      "Składnik można wpisać w każdej jednostce, którą materiał przelicza, na przykład 2 kartony; CPG zapisuje go w jednostce bazowej materiału (24 szt.) i zachowuje to, co wpisano. Receptura nie może używać własnego wyrobu, ani bezpośrednio, ani przez inne BOM-y: CPG pokazuje cykl, który by powstał.",
      "BOM-y może przeglądać każde konto. Tworzy je i zmienia tylko administrator, przyciskiem Utwórz BOM tutaj i Edytuj recepturę na stronie BOM-u; także przez API, na tych samych zasadach. Wybrać można tylko aktywne materiały.",
    ],
  },
  "bom-revisions": {
    title: "BOM i jego rewizje",
    body: [
      "Wybierz ID BOM-u, aby otworzyć jego stronę: wyrób, status, priorytet i ważność, recepturę bieżącej rewizji oraz wszystkie rewizje.",
      "Receptura nigdy nie zmienia się w miejscu. Zapisanie prawdziwej zmiany priorytetu, dat lub składników tworzy nową rewizję; stare pozostają do wglądu w sekcji Rewizje, bez zmian, dla zleceń, które będą ich używać. Zapisanie tej samej receptury albo wpisanie tej samej ilości w innej jednostce niczego nie tworzy.",
      "Późniejsza zmiana przelicznika jednostek nie zmienia zapisanej receptury: wiersz zachowuje swoją ilość i przelicznik, z którym go wpisano. Aby użyć nowego przelicznika, wpisz wiersz ponownie.",
      "Dezaktywuj zachowuje BOM i jego rewizje, ale nie można go wybrać dla nowych zleceń; Aktywuj ponownie to cofa po ponownym sprawdzeniu priorytetu. Żadne z nich nie tworzy rewizji. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  "purchase-requisitions": {
    title: "Zapotrzebowania zakupu",
    body: ["Anuluj kończy otwarty dokument przed zapisaniem operacji. Zamknij wcześniej porzuca resztę po rozpoczęciu realizacji, bez odwracania zapasu ani zapisanych operacji. Potwierdzenie pokazuje porzucane ilości; zakończonego dokumentu nie można ręcznie otworzyć ponownie. Obie role mogą działać, poza zbiorem tylko do odczytu. Nagłówek pozostaje otwarty, gdy jest otwarty wiersz; wszystkie zrealizowane oznaczają Zrealizowane, wszystkie anulowane — Anulowane, a pozostałe kombinacje — Zamknięte wcześniej.",
      "Zapotrzebowania zakupu, w sekcji Transakcje w menu bocznym, to lista tego, co środowisko ma kupić: jeden materiał w jednej lokalizacji, ilość i data, na którą jest potrzebny. CPG nadaje każdemu ośmiocyfrowe ID, po kolei. Nowe zapotrzebowanie jest Otwarte i nic z niego nie przekształcono.",
      "Zamówienie zakupu przekształca zapotrzebowanie w całości lub w częściach, także do różnych dostawców. Przekształcono pokazuje, ile zabrały dotąd zamówienia, a Pozostało to, co zostało; gdy wszystko przekształcono, zapotrzebowanie staje się Zrealizowane.",
      "Zapotrzebowanie to tylko planowana podaż: nigdy nie zmienia stanu magazynowego. Ilość można wpisać w każdej jednostce, którą materiał przelicza; CPG zapisuje ją w jednostce bazowej i zachowuje to, co wpisano.",
      "Zapotrzebowania może tworzyć i przeglądać każde konto, przyciskiem Utwórz zapotrzebowanie tutaj i przez API; wybrać można tylko aktywne materiały i lokalizacje. Środowisko tylko do odczytu odrzuca nowe. Lokalizacji z otwartym zapotrzebowaniem nie można dezaktywować. Każda zmiana pojawia się w audycie środowiska.",
      "Zmień datę przy otwartym zapotrzebowaniu ustawia nowy wymagany termin, tutaj lub przez API poleceniem PATCH, w wersji, którą wczytano; materiał, lokalizacja i ilość nigdy się nie zmieniają. Środowisko tylko do odczytu odrzuca zmianę. Każda zmiana pojawia się w audycie środowiska.",
    ],
  },
  "purchase-orders": {
    title: "Zamówienia zakupu",
    body: [
      "Zamówienia zakupu, w sekcji Transakcje w menu bocznym, to lista zamówień środowiska u dostawców. Zamówienie ma jednego dostawcę, jedną lokalizację i od 1 do 100 pozycji, każdą z własną planowaną datą. Każde zamówienie dostaje ośmiocyfrowe ID; nowe jest Otwarte.",
      "Utwórz zamówienie bezpośrednio albo wskaż w pozycji otwarte zapotrzebowanie tego samego materiału i lokalizacji: pozycja przekształca wtedy tyle zapotrzebowania, ile pozostało, a zapotrzebowanie jest Zrealizowane, gdy przekształcono je w całości.",
      "Pozycja nie może dotyczyć innej lokalizacji niż zamówienie. Wybrać można tylko aktywnych dostawców, lokalizacje i materiały; wcześniejsze zamówienie pozostaje używalne, jeśli jego dostawca zostanie później dezaktywowany.",
      "Zamówienie to planowana podaż: stan magazynowy zwiększają tylko przyjęcia towaru księgowane na jego stronie. Jest Zrealizowane, gdy każda pozycja przyjęła swoją ilość. Zamówienia może tworzyć i przeglądać każde konto, tutaj i przez API; środowisko tylko do odczytu odrzuca nowe. Materiału z otwartą pozycją zamówienia nie można dezaktywować, podobnie jak lokalizacji docelowej otwartego zamówienia.",
    ],
  },
  "purchase-order": {
    title: "Zamówienie zakupu i jego pozycje",
    body: [
      "Anuluj kończy otwarty dokument przed zapisaniem operacji. Zamknij wcześniej porzuca resztę po rozpoczęciu realizacji, bez odwracania zapasu ani zapisanych operacji. Potwierdzenie pokazuje porzucane ilości; zakończonego dokumentu nie można ręcznie otworzyć ponownie. Obie role mogą działać, poza zbiorem tylko do odczytu. Nagłówek pozostaje otwarty, gdy jest otwarty wiersz; wszystkie zrealizowane oznaczają Zrealizowane, wszystkie anulowane — Anulowane, a pozostałe kombinacje — Zamknięte wcześniej. Działanie w wierszu kończy tylko ten wiersz; działanie nagłówka kończy wszystkie otwarte reszty.",
      "Odwróć całą pozycję przyjęcia, wydania lub korekty w jej historii albo na ekranie Zapasu. Podaj powód; przeciwny ruch zostanie zaksięgowany dziś, a oryginał pozostanie powiązany i niezmieniony. Aby poprawić ilość, odwróć ją i zaksięguj poprawną. Nie ma częściowych odwróceń. Brak zapasu blokuje całe odwrócenie. Jeśli potrzebna jest tymczasowa dodatnia korekta, wprowadź ją ręcznie i odwróć po poprawnym przyjęciu; nie pozostawiaj dodatkowego zapasu w stanie. Odwrócone wydania przywracają postęp zamówienia, ale dane klienta, lokalizacji i zaksięgowanej pozycji pozostają zablokowane.",
      "Wybierz ID zamówienia, aby otworzyć jego stronę: dostawca, lokalizacja, status i każda pozycja, z ilością w jednostce bazowej materiału, jednostką, w której ją wpisano, planowaną datą i zapotrzebowaniem, które przekształciła, jeśli jest.",
      "Każda pozycja pokazuje, ile przyjęto i ile jeszcze pozostało. Zaksięguj przyjęcie towaru zapisuje, co dotarło: ilość dla pozycji, w dowolnej jednostce, którą materiał przelicza, pozostałe pozycje zostają puste. Zapas w lokalizacji zamówienia rośnie z dzisiejszą datą, a pozycje i zamówienie zmieniają się w tym samym kroku albo nic nie zostaje zaksięgowane.",
      "Przyjęcie może być częściowe, powtórzone albo większe niż to, co pozostało: nadwyżka zostaje przyjęta i wskazana w ostrzeżeniu. Gdy każda pozycja przyjmie swoją ilość, zamówienie jest Zrealizowane i nie przyjmuje kolejnych dostaw. Przyjęć nie można zmieniać; są wymienione w sekcji Przyjęcia towaru, od najnowszego.",
      "Zmień datę przy otwartej pozycji ustawia jej planowaną datę, także po przyjęciach, dopóki zamówienie jest Otwarte. API zmienia planowane daty poleceniem PATCH, także kilku pozycji naraz. Oba działają w wersji, którą wczytano, a każda zmiana pojawia się w audycie środowiska. Dostawca, lokalizacja oraz materiał, jednostka i ilość pozycji nigdy się nie zmieniają.",
    ],
  },
  transfers: {
    title: "Przesunięcia",
    body: [
      "Przesunięcia, w sekcji Transakcje w menu bocznym, przenoszą jeden materiał z jednej lokalizacji do innej. Przesunięcie ma planowaną ilość, w dowolnej jednostce, którą materiał przelicza, oraz planowaną datę wydania i przybycia: przybycie nie może być przed wydaniem, a obie lokalizacje muszą być różne. Każde przesunięcie dostaje ośmiocyfrowe ID; nowe jest Otwarte.",
      "Utworzenie przesunięcia nie zmienia zapasu. Na jego stronie można je wydać (zapas opuszcza lokalizację źródłową i trafia do tranzytu), przyjąć (zapas opuszcza tranzyt i trafia do lokalizacji docelowej) oraz odpisać to, co zginęło po drodze. Przesunięcie przenosi jeden materiał: utwórz osobne przesunięcie dla każdego materiału.",
      "Przesunięcia może tworzyć i przeglądać każde konto, tutaj i przez API; wybrać można tylko aktywne materiały i lokalizacje, a środowisko tylko do odczytu odrzuca nowe. Lokalizacji z otwartym przesunięciem z niej lub do niej ani materiału z otwartym przesunięciem nie można dezaktywować. API wyświetla listę przez GET /api/tenants/{tenant}/transfers?page=1 i tworzy przez POST na tę samą ścieżkę.",
    ],
  },
  transfer: {
    title: "Przesunięcie: wydanie, przyjęcie, odpis",
    body: ["Anuluj kończy otwarty dokument przed zapisaniem operacji. Zamknij wcześniej porzuca resztę po rozpoczęciu realizacji, bez odwracania zapasu ani zapisanych operacji. Potwierdzenie pokazuje porzucane ilości; zakończonego dokumentu nie można ręcznie otworzyć ponownie. Obie role mogą działać, poza zbiorem tylko do odczytu. Nagłówek pozostaje otwarty, gdy jest otwarty wiersz; wszystkie zrealizowane oznaczają Zrealizowane, wszystkie anulowane — Anulowane, a pozostałe kombinacje — Zamknięte wcześniej. Najpierw przyjmij lub spisz cały zapas w tranzycie. Spisane ilości pozostają stratą i wchodzą do ilości porzuconej.",
      "Strona przesunięcia pokazuje jego trasę, planowane daty i ilości: planowaną, wydaną, pozostałą do wydania, w tranzycie, przyjętą i odpisaną. Zapas w tranzycie należy do przesunięcia: żadna z lokalizacji nie może go użyć, a strona Zapas pokazuje go osobno od zapasu fizycznego.",
      "Wydaj zdejmuje zapas z lokalizacji źródłowej do tranzytu, do ilości pozostałej do wydania i nigdy więcej, niż jest w lokalizacji. Przyjmij umieszcza część lub całość zapasu z tranzytu w lokalizacji docelowej, nigdy więcej. Odpisz zdejmuje z tranzytu ilość utraconą po drodze, z powodem; żadna lokalizacja się nie zmienia, a korekta zapasu nie może dotknąć tranzytu. Każde księgowanie ma dzisiejszą datę i zapisuje obie strony w jednym kroku albo nic.",
      "Gdy przyjęto całą planowaną ilość, przesunięcie jest Zrealizowane i nie przyjmuje kolejnych księgowań. Przesunięcie z odpisem pozostaje Otwarte, dopóki nie zostanie zamknięte wcześniej. Księgowań nie można zmieniać; rejestr pokazuje każde z tym, co przesunęło, od najnowszego.",
      "Odwracanie księgowania: wybierz Odwróć przy wydaniu, przyjęciu lub odpisie w rejestrze i podaj powód. Całe księgowanie jest odwracane raz, z dzisiejszą datą, a oba zapisy zostają w rejestrze, powiązane. Odwrócone przyjęcie zdejmuje ilość z lokalizacji docelowej z powrotem do tranzytu, więc musi ona tam nadal być. Odwrócony odpis przywraca stratę do tranzytu. Wydanie można odwrócić dopiero po odwróceniu wszystkich przyjęć i odpisów przesunięcia; zwraca wtedy zapas do lokalizacji źródłowej. Potem przesunięcie znów jest Otwarte, nawet jeśli było Zrealizowane lub Zamknięte wcześniej, bez porzuconej ilości. Jego materiał i lokalizacje muszą być aktywne. Nie ma odwracania częściowego. API udostępnia POST …/postings/{postingId}/reverse z { reason }.",
      "Zmień daty zmienia planowane daty, dopóki przesunięcie jest Otwarte, w wersji, którą wczytano. API udostępnia PATCH /api/tenants/{tenant}/transfers/{id} dla dat oraz POST …/dispatches, …/receipts i …/write-offs dla księgowań, każde z tokenem, kluczem idempotencji i, w środowisku Test, generacją danych.",
    ],
  },
  shipment: {
    title: "Wysyłki i wydania towaru",
    body: [
      "Odwróć całą pozycję przyjęcia, wydania lub korekty w jej historii albo na ekranie Zapasu. Podaj powód; przeciwny ruch zostanie zaksięgowany dziś, a oryginał pozostanie powiązany i niezmieniony. Aby poprawić ilość, odwróć ją i zaksięguj poprawną. Nie ma częściowych odwróceń. Brak zapasu blokuje całe odwrócenie. Jeśli potrzebna jest tymczasowa dodatnia korekta, wprowadź ją ręcznie i odwróć po poprawnym przyjęciu; nie pozostawiaj dodatkowego zapasu w stanie. Odwrócone wydania przywracają postęp zamówienia, ale dane klienta, lokalizacji i zaksięgowanej pozycji pozostają zablokowane.",
      "Wysyłka planuje, co wyjedzie w ramach jednego zamówienia klienta. Na stronie zamówienia przycisk Utwórz wysyłkę prosi o planowaną datę i ilość w każdej pozycji, w dowolnej jednostce, którą materiał przelicza; pozostałe pozycje zostaw puste. Pozycja nie zaplanuje więcej, niż w niej pozostało. Utworzenie wysyłki nie zmienia zapasu i niczego nie realizuje.",
      "Wybierz identyfikator wysyłki, aby otworzyć jej stronę: zamówienie, klienta, lokalizację, planowaną datę i status, a w każdej pozycji to, co zaplanowano, co już wydano i co zostało do wydania.",
      "Zaksięguj wydanie towaru zapisuje, co naprawdę wyjechało: ilość w każdej pozycji. Zapas w lokalizacji zamówienia spada z dzisiejszą datą, a pozycje zamówienia są realizowane w tym samym kroku albo nic nie zostaje zaksięgowane. Pozycja nie wyda więcej, niż ma do wydania (mniej z tego, co wysyłka jeszcze planuje, i tego, co pozostało w pozycji zamówienia), ani więcej, niż jest na stanie: odmowa podaje dostępną ilość.",
      "Wydanie, które dostarcza pozycję w całości, kończy ją, a zamówienie jest Zakończone, gdy wszystkie pozycje są zakończone. Wysyłka jest Zakończona, gdy nie zostało w niej nic do wydania. Wydań towaru nie można zmieniać; są wymienione w sekcji Wydania towaru, od najnowszego. Po wydaniu z pozycji nie można zmienić jej materiału, jednostki ani wymaganego terminu, klienta ani lokalizacji zamówienia, ani obniżyć ilości poniżej dostarczonej.",
      "Edytuj wysyłkę zmienia planowaną datę i pozycje otwartej wysyłki: zwiększ pozycję, o ile to, co zostaje do wydania, nie przekracza tego, co pozostało w pozycji zamówienia, zmniejsz ją najwyżej do tego, co wydano, wyczyść pozycję, w której nigdy nic nie wydano, aby ją usunąć, albo wypełnij pusty wiersz pozycji zamówienia, aby ją dodać. Numery usuniętych pozycji nie są używane ponownie. Zmniejszenie wszystkich pozycji do tego, co wydano, kończy wysyłkę. Anuluj wysyłkę kończy otwartą wysyłkę, w ramach której nigdy nic nie wydano, nawet jeśli wydanie później odwrócono: niczego już nie planuje, a zapas i zamówienie się nie zmieniają. Zakończonej ani anulowanej wysyłki nie można edytować ani anulować. Nieaktualna wersja blokuje zmianę; odśwież i spróbuj ponownie. Środowisko tylko do odczytu ukrywa obie akcje.",
    ],
  },
  import: {
    title: "Import z arkusza",
    body: [
      "Import, w sekcji Dane podstawowe w menu bocznym, wczytuje lub aktualizuje dane podstawowe i BOM-y środowiska z jednego skoroszytu .xlsx. Widzi go tylko administrator i jest zablokowany, gdy środowisko jest tylko do odczytu. Uruchamiaj go, gdy nikt inny nie zmienia danych: w trakcie importu inne zmiany czekają.",
      "Pobierz szablon: ma arkusz na materiały, przeliczniki jednostek, lokalizacje, klientów, dostawców, parametry planowania i zapas bezpieczeństwa oraz dwa na BOM-y, a do tego instrukcję po angielsku i po polsku. Wypełnij tylko potrzebne arkusze i zachowaj wiersz nagłówka każdego z nich. Puste ID tworzy rekord, istniejące ID go aktualizuje, a ID, które nie istnieje, jest błędem. Import nigdy niczego nie usuwa.",
      "Arkusze są stosowane w kolejności szablonu, więc wiersz parametrów planowania może użyć materiału tworzonego przez arkusz Materials: próba pokazuje ID, które dostanie. Wiersze BOM-u to jego pełna receptura: pominięty składnik jest usuwany w nowej rewizji, identyczna receptura nie tworzy rewizji, a wiersze nowego BOM-u wskazują jego nagłówek przez wybraną przez ciebie referencję importu.",
      "Wyślij skoroszyt i wykonaj próbę: sprawdza każdy wiersz tymi samymi zasadami co ekrany, niczego nie zapisuje i wymienia każdy problem z arkuszem, wierszem i kolumną albo pokazuje, co zostanie utworzone, zmienione lub pozostanie bez zmian. Zatwierdzić można tylko próbę bez problemów, a zatwierdzenie zapisuje wszystko naraz albo nic. Jeśli coś, czego używa skoroszyt, zmieniło się od czasu próby, zatwierdzenie jest odrzucane: wykonaj próbę ponownie. Najwyżej 2000 wierszy i 512 KB na skoroszyt. API oferuje to samo: GET /api/import/template oraz POST /api/tenants/{tenant}/import/dry-run i /commit ze skoroszytem w base64.",
    ],
  },
  stock: {
    title: "Zapas fizyczny i korekty",
    body: [
      "Odwróć całą pozycję przyjęcia, wydania lub korekty w jej historii albo na ekranie Zapasu. Podaj powód; przeciwny ruch zostanie zaksięgowany dziś, a oryginał pozostanie powiązany i niezmieniony. Aby poprawić ilość, odwróć ją i zaksięguj poprawną. Nie ma częściowych odwróceń. Brak zapasu blokuje całe odwrócenie. Jeśli potrzebna jest tymczasowa dodatnia korekta, wprowadź ją ręcznie i odwróć po poprawnym przyjęciu; nie pozostawiaj dodatkowego zapasu w stanie. Odwrócone wydania przywracają postęp zamówienia, ale dane klienta, lokalizacji i zaksięgowanej pozycji pozostają zablokowane.",
      "Zapas w menu środowiska pokazuje dokładny stan fizyczny i ostatnie ruchy wybranego materiału w lokalizacji. Para bez ruchów ma stan zero. Test i Prod są oddzielne; świeży Test zawiera dwa lata demonstracyjnej historii: przyjęcia, wykonania produkcji i wydania towaru, każde z odnośnikiem do swojego dokumentu.",
      "Obie role mogą zaksięgować korektę z powodem, gdy środowisko pozwala na zapis, a materiał i lokalizacja są aktywne. Wpisz zmianę ze znakiem: 5 dodaje pięć, -5 odejmuje pięć. Wybierz jednostkę podstawową lub zdefiniowany przelicznik; ilość jest przeliczana raz, z zaokrągleniem połówkowym w górę do sześciu miejsc, i zachowuje wpisaną ilość, jednostkę oraz przelicznik. Serwer używa dzisiejszej daty UTC; nie można księgować w przeszłość ani przyszłość. Korekta prowadząca do ujemnego zapasu jest odrzucana z dostępną ilością.",
      "Stany otwarcia i fizyczny zwrot od klienta to zwykłe dodatnie korekty z powodem; nie powstaje dokument zwrotu. Każda korekta użytkownika tworzy niezmienny ruch magazynowy i oddzielny wpis audytu ze stanem przed i po. Każdy ruch pokazuje rodzaj i dokument źródłowy: przyjęcie towaru prowadzi do zamówienia zakupu, wydanie towaru do wysyłki, wydanie lub przyjęcie przesunięcia do przesunięcia, wykonanie produkcji do zlecenia produkcyjnego; korekta (także z importu stanów) jest swoim własnym źródłem. Użytkownik, identyfikator księgowania i przelicznik są w szczegółach ruchu. Otwarcia demonstracyjne są oznaczone jako Instalacja. Ruchy są pokazywane po 100 na stronę, od najnowszych, a saldo uwzględnia wszystkie ruchy.",
      "Aby ustawić wiele pozycji naraz, np. bilans otwarcia lub wynik inwentaryzacji, użyj Importu stanów (Import z arkusza na tym ekranie): wpisujesz ilość, jaka ma być w każdej pozycji, a nie zmianę.",
      "Materiał po dowolnym ruchu zachowuje na zawsze typ i jednostkę podstawową, nawet po wyzerowaniu zapasu. Niezerowy zapas blokuje dezaktywację materiału i lokalizacji. API odczytuje GET /api/tenants/{tenant}/stock?material=00000001&location=00000001&page=1 i księguje POST /api/tenants/{tenant}/stock/corrections z tokenem, kluczem idempotencji, bieżącą generacją Test oraz materiałem, lokalizacją, ilością ze znakiem, jednostką i powodem.",
    ],
  },
  "variance-report": {
    title: "Raport odchyleń",
    body: [
      "Raport odchyleń w menu środowiska porównuje to, co zaksięgowała produkcja, z planem każdego zlecenia produkcyjnego. Każde zlecenie z wykonaniami to jeden wiersz: ilość docelowa wobec tego, co wyprodukowały jego wykonania (odchylenie wyrobu, wyprodukowano − docelowo), a dla każdego składnika ilość oczekiwana, rzeczywista, odchylenie (rzeczywiste − oczekiwane) i odpad, wszystko w jednostce podstawowej materiału. Oczekiwane to ilość, której przypięta wersja BOM zlecenia wymaga dla faktycznie wyprodukowanej ilości, zapisana przy księgowaniu każdego wykonania; nigdy nie jest przeliczana z późniejszej receptury.",
      "Surowiec spoza przypiętej receptury jest oznaczony jako Dodatkowy: nie był oczekiwany, więc całe jego zużycie jest odchyleniem. Wykonanie z zerową produkcją to księgowanie odpadu: niczego nie wytwarza, jest liczone w Księgowaniach odpadu, a jego zużycie widać w Odpadzie każdego składnika i w ilości rzeczywistej. Odwrócone wykonanie nie jest nigdzie liczone, a jego identyfikator jest wymieniony przy Odwrócone. Otwórz zlecenie, aby zobaczyć każde wykonanie osobno.",
      "Filtruj po materiale (wyrób zlecenia albo składnik oczekiwany lub zużyty w wykonaniach), lokalizacji, stanie i zakresie dat księgowania Od–Do. Przy zakresie dat liczone są tylko wykonania zaksięgowane w tym zakresie, więc odchylenie wyrobu nie jest pokazywane: ilość docelowa dotyczy całego zlecenia. Zlecenia są uporządkowane według identyfikatora, po 50 na stronę. Raport nie pokazuje kosztów, wartości ani zdolności produkcyjnych.",
      "Obie role mogą czytać raport, także w środowisku tylko do odczytu, a Test i Prod pokazują wyłącznie własne zlecenia. API zwraca ten sam raport: GET /api/tenants/{tenant}/reports/variance?material=00000001&location=00000001&status=open&from=2026-10-01&to=2026-10-31&page=1 (każdy parametr opcjonalny), z tokenem albo zalogowaną sesją. Materiał lub lokalizacja, których środowisko nie ma, nie zostaną znalezione; data końcowa wcześniejsza niż początkowa jest odrzucana.",
    ],
  },
  "stock-report": {
    title: "Raport zapasu",
    body: [
      "Raport zapasu w menu środowiska wymienia dla każdego materiału i lokalizacji bieżący zapas fizyczny na stanie oraz zapas w tranzycie: stąd (wydany z tej lokalizacji i jeszcze nieprzyjęty ani niespisany) i tutaj (wydany do tej lokalizacji). Wszystko w jednostce podstawowej materiału. Zapas w tranzycie należy do swojego przesunięcia, więc żadna z lokalizacji nie może go użyć: nigdy nie jest doliczany do stanu.",
      "Materiał i lokalizacja pojawiają się, gdy cokolwiek tam zaksięgowano albo otwarte przesunięcie ma zapas w drodze stąd lub tutaj. Filtruj po materiale i lokalizacji; wiersze z samymi zerami są ukryte, chyba że zaznaczysz Pokaż wiersze z samymi zerami. Wiersze są uporządkowane według materiału, potem lokalizacji, po 100 na stronę.",
      "Ruchy otwiera stronę Zapas dla tego materiału i lokalizacji: saldo, tranzyt z odnośnikami do przesunięć i każdy ruch z datą, rodzajem, ilością ze znakiem, powodem i odnośnikiem do dokumentu źródłowego. Obie role mogą czytać raport, także w środowisku tylko do odczytu, a Test i Prod pokazują wyłącznie własny zapas.",
      "API zwraca ten sam raport: GET /api/tenants/{tenant}/reports/stock?material=00000001&location=00000001&includeZero=true&page=1 (każdy parametr opcjonalny), z tokenem albo zalogowaną sesją. Materiał lub lokalizacja, których środowisko nie ma, nie zostaną znalezione.",
    ],
  },
  "stock-import": {
    title: "Import stanów",
    body: [
      "Import stanów, obok Zapasu w menu bocznym, ustawia stany fizyczne z jednego skoroszytu .xlsx: bilans otwarcia albo wynik inwentaryzacji. Obie role mogą go używać, gdy środowisko pozwala na zapis. Pobierz szablon: jeden arkusz Stock z kolumnami Material ID, Location ID, Physical quantity i Unit oraz instrukcja po angielsku i po polsku.",
      "Wpisz ilość, jaka ma być w każdej pozycji, a nie zmianę. Import wylicza każdy ruch z bieżącego stanu fizycznego: 85 przy stanie 100 księguje -15, 130 księguje +30, ta sama ilość to Bez zmian i niczego nie księguje, a 0 opróżnia pozycję. Pominięte pozycje pozostają bez zmian we wszystkich lokalizacjach. Ilość w innej jednostce (2 case) jest przeliczana bieżącym przelicznikiem materiału, więc 2 opakowania po 12 to stan 24 sztuk, a nie 24 więcej. Towar w drodze należy do przesunięcia i nie jest stanem lokalizacji: odpisz go na przesunięciu.",
      "Próba odczytuje stany, niczego nie zapisuje i pokazuje ruch każdej pozycji albo każdy problem z wierszem i kolumną: ujemną ilość, nieznany lub nieaktywny materiał albo lokalizację, jednostkę bez przelicznika lub tę samą pozycję dwa razy. Zatwierdzić można tylko próbę bez problemów, z jednym powodem dla wszystkich ruchów, np. Bilans otwarcia lub Inwentaryzacja 2027-01. Zatwierdzenie księguje wszystkie ruchy jako jedną zwykłą korektę, z audytem na twoim koncie, albo nic. Jeśli któryś z wymienionych stanów zmienił się od czasu próby, zatwierdzenie jest odrzucane: wykonaj próbę ponownie.",
      "Najwyżej 2000 wierszy i 512 KB na skoroszyt. API oferuje to samo: GET /api/stock-import/template oraz POST /api/tenants/{tenant}/stock-import/dry-run ze skoroszytem w base64, a potem /commit ze skoroszytem, previewToken z próby i powodem.",
    ],
  },
  "language-and-theme": {
    title: "Język i motyw",
    body: [
      "Wybierz English lub Polski oraz Jasny lub Ciemny na karcie konta na dole panelu bocznego.",
      "Wybór należy do twojego konta: zostaje po wylogowaniu, działa w innych przeglądarkach i nigdy nie zmienia ustawień innych osób.",
      "Przed zalogowaniem CPG wyświetla się po angielsku i w jasnym motywie.",
    ],
  },
  "using-help": {
    title: "Jak korzystać z pomocy",
    body: [
      "Wpisz jedno lub kilka słów i wybierz Szukaj. Zobaczysz tematy, które zawierają wszystkie te słowa.",
      "Wielkość liter i polskie znaki nie mają znaczenia: „logowanie” i „LOGOWANIE” znajdą te same tematy, podobnie jak „łatwo” i „latwo”.",
      "Każdy ekran CPG ma co najmniej jeden temat, a nowe ekrany dodają własne.",
    ],
  },
};

const TEXTS: Record<Locale, Record<HelpTopicId, HelpText>> = { en, pl };

/** Every topic in the reader's language, in display order. */
export function helpTopics(locale: Locale): HelpTopic[] {
  return HELP_TOPIC_IDS.map((id) => ({ id, route: HELP_TOPIC_ROUTES[id], ...TEXTS[locale][id] }));
}
