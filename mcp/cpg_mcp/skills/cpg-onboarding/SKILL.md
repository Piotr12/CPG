---
name: cpg-onboarding
description: How to work in CPG, a small MRP II planning tool, through the cpg MCP tools (cpg_whoami, cpg_mrp_run, cpg_report, …) - orientation, the planner's daily loop, CPG's hard rules and the safety rules. Load it before using any cpg_ tool.
---

# Working in CPG as a planner

CPG turns what customers want (orders and forecasts) into plans for what to buy and what to make. You work in it through the `cpg` MCP tools, with the rights of the person whose API token the server uses. This guide makes you useful on day one: find your bearings, run the daily planning loop, keep CPG's rules, and never surprise the human.

CPG's own help is the reference for every screen and rule. Read a topic with `cpg_help` (`topic: "<id>"`), or as the resource `cpg://help/<id>`. This guide names topics as help topic `<id>` and doesn't repeat them. For Polish text, call `cpg_help` with `locale: "pl"`. This guide exists in English only.

## 1. Orientation: call `cpg_whoami` first

`cpg_whoami` answers:
- **account**: who you act as, and the `role`. An `admin` also gets the master data tools (materials, BOMs, planning parameters, forecasts, imports, users). A `user` doesn't, so don't promise what the role can't do.
- **tenants**: CPG keeps two separate sets of data (help topic `test-and-prod`).
  - **Test** is the sandbox, with generated demonstration data (help topic `test-dataset-week`).
  - **Prod** is the live business.

  Nothing done in one appears in the other, and the same eight-digit ID means a different record in each. Each tenant shows:
  - `readOnly`: when true, nobody can change that tenant's business data, the API included. Reads still work. Don't try writes there: say the tenant is read-only and stop.
  - its dataset `generation` (Test only). It changes every time someone resets Test.
- **defaultTenant**: the tenant every tool uses when you don't pass `tenant`. It is normally `test`.
- **server**: the `cpg-mcp` version and its `catalogue` hash, useful when a tool and the API disagree.

Then tell the human in one sentence where you are: account, role, default tenant, and whether either tenant is read-only. For what CPG is and how its screens are laid out, read help topic `getting-started`.

## 2. Glossary

Each line points to the topic that defines the term. Read it before you rely on the term.

- **Material**: anything bought, made or sold. It is raw (bought), intermediate (made and used) or finished (made and sold), with an eight-digit ID. Help topic `materials`.
- **BUoM (base unit of measure)**: the unit every quantity of a material is stored in, to six decimals. Other units convert to it. Help topics `materials` and `material-conversions`.
- **Logical BOM and revision**: a BOM makes one output from components, per one base unit of output. One output may have several BOMs, its alternatives, ranked by priority and validity. Editing a BOM makes a new revision. Documents pin the revision they were made with. Help topics `boms` and `bom-revisions`.
- **PR (purchase requisition)**: a need to buy, which is planned supply only. Help topic `purchase-requisitions`.
- **PO (purchase order)**: an order to a supplier, possibly converting requisitions. Help topics `purchase-orders` and `purchase-order`.
- **GR (goods receipt)**: stock arriving against a PO. Help topic `purchase-order`.
- **GI (goods issue)**: stock leaving against a shipment of a customer order. Help topic `shipment`.
- **Customer order and shipment**: demand, and the planned dispatch against it. Help topics `customer-orders` and `customer-order-detail`.
- **Production order**: make an output at a location, with a pinned BOM revision. Its completions post output and consumption. Help topics `production-orders` and `production-order-detail`.
- **Transfer**: moves stock between locations: dispatch, in transit, receive or write off. Help topics `transfers` and `transfer`.
- **Statistical unit (SU)**: a reporting-only unit that adds up different products. Never enter a quantity in SU. Help topic `statistical-units`.
- **Planning parameters and safety stock**: per material and location, whether it is bought or made, its lead time and lot rules, and the level the balance should stay above. Help topics `planning-parameters` and `safety-stock`.
- **Forecast**: expected demand per month, consumed by that month's orders. Help topic `forecasts`.
- **MRP**: the planning run, its report, proposals and exceptions. Help topic `mrp`.

## 3. The daily loop

Run it on Test unless the human has asked for Prod (see section 5). After each step, say what you found in a few lines, citing IDs.

1. **Demand review.** Call `cpg_report` with `kind: "demand-review"` (help topic `demand-review`). Look for overdue orders, products whose ordered quantity runs ahead of what shipped, and the forecast not yet ordered. Several products only add up in SU. A product without an SU factor is left out of the totals and named, so mention it.
2. **Run MRP.** Call `cpg_mrp_run`. `mode: "manual"`, the default, only proposes. `mode: "automatic"` also creates the proposed documents. Use automatic only when the human asked for it. A run plans 90 days from today and changes no stock and no existing document.
3. **Read the MRP report.** Call `cpg_report` with `kind: "mrp"`. It lists material-location pairs, 25 to a page (`query: {"page": 2}` for more). Each pair has `lowestProjectedBefore`, `firstShortageDate`, `proposals`, `exceptions`, `shortages` (requirements still short after proposals) and `provisional` plans. Narrow to one pair with `query: {"material": "…", "location": "…"}` to get its days. Report:
   - the shortages: the pairs with a `firstShortageDate`, and the requirements in `shortages`;
   - the exceptions, each with its `code`, its `message` and the IDs in `params`: no usable BOM, no feasible BOM, a BOM cycle, at-risk production;
   - the at-risk supply: an open production order whose BOM lost an active component no longer counts, and nothing replaces it until someone acts;
   - late proposals, and proposals beyond the 90-day horizon.
4. **Accept proposals, or say why not.** `cpg_mrp_accept_proposal` takes the run's ID and the proposal's ID from the report. A purchase requisition proposal becomes an Open requisition. A production proposal becomes an Open production order pinned to MRP's BOM revision. Accepting re-plans first: if anything changed, a newer run exists, or the run is from an earlier day, it is refused as out of date. Then run MRP again and re-read, never retry the same IDs. Don't accept blindly. Skip a proposal whose exception you can't explain, or one the human should decide (a large lot, a late date), and say why.
5. **Move the documents forward.** A new document is Open at once, so there is no separate release step. Do only what the human asked, or what the loop clearly needs on Test:
   - Convert requisitions into purchase orders with `cpg_save_purchase_order`. A line that names a requisition converts it.
   - Post receipts with `cpg_post_goods_receipt`.
   - Post production with `cpg_post_production_completion`. Use `action: "preview"` first to see the expected consumption, then `action: "post"`.
   - Plan shipments with `cpg_save_shipment`, then issue them with `cpg_post_goods_issue`.
   - Move transfers with `cpg_transfer_move`.
6. **Check stock and variance.** `cpg_report` with `kind: "stock"` shows the current balances (help topic `stock-report`). `kind: "variance"` compares what production recorded with what it planned (help topic `variance-report`). Point out large variances and any stock that looks wrong. To fix stock, use a reversal or a reasoned `cpg_stock_correction`, and only after asking.

Use `cpg_list` and `cpg_get` to look things up, and `cpg_audit` to see who changed what.

## 4. Hard rules

CPG enforces these. Knowing them saves you a refused call.

- **R03: quantities are decimal strings in a named unit.** Write `"12.5"`, never `12.5`, with the unit given (any unit the material converts). CPG stores the base unit to six decimals and keeps what was entered. Dates are `YYYY-MM-DD`.
- **R09: stock never goes negative.** A goods issue, a completion's consumption, a dispatch, a correction or a reversal that would take a balance below zero is refused whole. The answer says how much is available. Don't split the posting to squeeze it through: report the shortage.
- **R10: MRP never rewrites documents.** A run and an acceptance only create new documents. Changing an existing document is your decision, made with its own tool.
- **Correct a posting by reversing it, never by editing it.** Receipts, issues, completions, transfer postings and corrections can't be changed. Call `cpg_reverse` with a reason: it reverses the whole posting, dated today, and keeps both linked. Then post the right amount. There are no partial reversals. A document you no longer need ends with `cpg_document_close`: `cancel` before any processing, or `close-early` to abandon what is left after processing. A terminal document can't be reopened. The lifecycle is in help topics `purchase-order` and `production-order-detail`.
- **Optimistic locking.** An update or a close carries the `version` you read. On `VERSION_CONFLICT`, the answer includes the record's current state. Read it, decide again with the human if the change matters, and send the new version. Never resend the old one.
- **Master data is the admin's.** Only an admin changes materials, BOMs, planning parameters, safety stock and forecasts.

## 5. Safety

- **Work on Test first.** Try anything new on Test, and show the human the result before you repeat it on Prod.
- **Confirm with the human before every Prod write**, every time. Name the tool, the tenant, the record and the quantities, and wait for a yes. A yes covers that write only. Every write tool that takes `tenant` says this in its description. Reads on Prod are fine.
- **`GENERATION_STALE` means Test was reset.** Every Test ID you read before is void: the records may not exist, or the same ID may now be a different record. Don't retry. Call `cpg_whoami`, re-read what you need, and tell the human the data changed. You can't reset Test from here, so never offer to.
- **A write whose answer was lost may have landed.** After a connection error, read the record before writing again. The server already retries once safely: an answer marked `"replayed": true` is the first write's answer, not a second write.
- **Cite record IDs.** Name every record you read, created or changed by its eight-digit ID and tenant, such as "purchase order 00000012 (Test)", so the human can open it in CPG.
- **Refusals are information.** Read the `code`, `message`, `fieldErrors` and `params`, then fix the input or explain. Never loop on the same call.
- **Never invent a password, a token or a reason.** Ask the human for them. Tokens are created only in CPG's screens (help topic `api-tokens`).

## 6. Worked example on Test: from a customer order to a goods receipt

IDs differ on every Test reset, so read them as you go.

1. `cpg_whoami`: Test is writable. Note its generation.
2. `cpg_list` with `entity: "customers"`, `"materials"` (pick a finished product) and `"locations"`.
3. Create the demand with `cpg_save_customer_order`, `action: "create"`: `customer`, `location`, and one line with `material`, `quantity: "40"`, `unit` (the material's base unit) and `requiredDate` two weeks out. Note the order's ID.
4. `cpg_mrp_run`, then `cpg_report` with `kind: "mrp"` and `query` narrowed to the product and location. The order's line is a requirement. Where the product is made there, a production order proposal covers it, and its components get requisition proposals where they are bought.
5. Accept the proposals with `cpg_mrp_accept_proposal`, and note the production order and requisition IDs it creates.
6. Convert a requisition with `cpg_save_purchase_order`, `action: "create"`: `supplier`, the same `location`, and one line with `material`, `quantity`, `unit`, `plannedDate` and `requisition` set to the requisition's ID. Fully converted, the requisition is Completed.
7. Receive it with `cpg_post_goods_receipt`: `purchaseOrder`, and per line its `line` number, `quantity` and `unit`. Stock rises today at the order's location, and the order is Completed once every line is received.
8. Run MRP again: that component's shortage is gone. Report every ID you created, and what is still short.

When anything in this example is refused, read the refusal, check the topic it points to, and explain it to the human rather than working around it.
