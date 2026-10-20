# A user creates purchase requisitions and purchase orders, directly or by converting a requisition into one or more orders

**Status:** in progress
**Created:** 2026-10-20 16:36 UTC
**Issue:** #86 (E09-S01), epic #75 · **Builds on:** `implemented/2026-10-20--0757UTC-boms.md` (header-plus-lines, `convertToBaseQuantity`, leaf usage files), `implemented/2026-10-19--2014UTC-locations-customers-suppliers.md` (#23: locations and suppliers, "an inactive master can't be picked for new entries"), `implemented/2026-10-19--1858UTC-materials.md` (#22), `implemented/2026-10-19--2018UTC-read-only-tenants.md` (#25), `implemented/2026-10-19--1548UTC-api-idempotency.md` (#21), `implemented/2026-10-19--1050UTC-audit-log.md` (#20) · **Design authority:** `.ai/specs/product-brief.md` (R03, R05, R07, R08, D02, D06, N06), `.ai/specs/research/CPG-prd001.pdf` §03 "Procurement chain", `CPG-acceptance.md` (BUY-001…009, BUY-025, BUY-026, LFC-001, LFC-013, LFC-021, LFC-023, INV-024, AUD-025, AUD-027, TEN-014)

## 📝 TLDR

Nothing can be bought yet. This spec adds the two planned-supply documents of the procurement chain. A **purchase requisition** (PR) says "we need material M at location L, this much, by this date". A **purchase order** (PO) commits one supplier to deliver, to one location, a list of dated lines. A PO is created directly, or by naming a requisition on a line, which converts that much of the requisition. Both are Open on creation. A requisition whose converted quantity reaches its quantity becomes Completed. Neither moves stock (BUY-009): they are planned supply only. Any signed-in user creates and reads them, in the UI and the API. Goods receipts, cancelling and closing early, and MRP are other stories.

## Resolved assumptions (autonomous defaults)

| # | Question | Chosen answer | Rationale |
|---|---|---|---|
| Q1 | One story or split? | One: requisitions, orders and conversion ship together. | Conversion links them, and the issue's criteria cover both. |
| Q2 | IDs? | Each kind has an eight-digit business ID (`code`), sequential per tenant and per kind from `00000001` through `nextSequentialId`, never reused. A PO line is addressed by its 1-based `line` number within the PO. | R01 and the pattern of every earlier master and BOM. |
| Q3 | What is a requisition? | One material at one location: a quantity, a required date, how much is converted (starts at 0) and a status, `open` or `completed`. The quantity is entered in any unit the material converts and stored as the six-decimal base quantity with the entered quantity, unit and factor kept (`convertToBaseQuantity`, R03, MAT-019). | The issue: "a requisition for material M at location L for 100 on a date". |
| Q4 | What is a PO? | A header (supplier, location, status `open`) and 1 to 100 lines. A line has a material, a quantity (entered and base, as Q3), a planned date and optionally the requisition it converts. Two lines may carry the same material, on different dates (BUY-008). | BUY-005/006/008. No supplier-material source list exists (N06), so any active supplier is valid for any material. |
| Q5 | One location per PO (BUY-007)? | The location is the header's. A line may state its own `location`; when it differs from the header's, the save is refused with the field error `lines.N.location`, and nothing is written. A line that converts a requisition must have the requisition's material and the PO's location, otherwise the field errors `lines.N.requisition` / `lines.N.material`. | BUY-007's "reject or require separate PO"; the API makes the refusal observable because a client can name a line's location. |
| Q6 | Conversion rules (BUY-003, BUY-004)? | The requisition must be Open (409 `REQUISITION_NOT_OPEN`) and must exist in this tenant (404 `REQUISITION_NOT_FOUND`, another tenant's included, TEN-014). A line's base quantity may not exceed the requisition's outstanding quantity, counting earlier lines of the same PO (409 `REQUISITION_OVER_CONVERTED`). Converting adds the line's base quantity to the requisition's `converted`, and `converted` equal to the quantity makes it `completed`. Both are written in the PO's transaction, with their own audit entry. | Over-conversion would count supply twice (BUY-026). Converted is derived from the lines at creation, never entered. |
| Q7 | Who may write? | Any signed-in account ("both roles"), unlike master data. Writes are refused in a read-only tenant, even for the admin and the API (R05). API writes need a bearer token, an idempotency key and, in Test, the dataset generation; an edit carries the `version` it loaded (409 `VERSION_CONFLICT`, AUD-025, API-029). | The issue. |
| Q8 | What may change after creation? | A requisition's required date; a PO line's planned date (BUY-024's "planned date editable"). Nothing else, so what was committed stays what was committed. A change to the stored value is audited; the same value is no change. Quantity, material, supplier and location are fixed: cancelling and closing are E11. | Smallest edit that gives the versioned PATCH its meaning; the rest of the document lifecycle is out of scope. |
| Q9 | Inactive masters (BUY-025, LFC-021, LFC-023, LFC-019, MAT-029)? | A new requisition or PO can't name an inactive material, location or supplier (409 `*_INACTIVE`); the other tenant's records are not found (404). A PO already saved stays readable and editable when its supplier is later deactivated, and the admin may deactivate a supplier that has an open PO. | The issue and the acceptance catalogue. |
| Q10 | Material deactivation (LFC-013)? | Deactivating a material with an open PO line is refused, 409 `MATERIAL_IN_OPEN_PO`, naming the PO ID. Open requisitions don't block it (only POs are named by LFC-013). Once any requisition or PO line references a material, its **base unit** can't change (409 `BASE_UNIT_IN_USE`: quantities are stored in it); its type may. | The issue; the BOM story's base-unit lock. |
| Q11 | Audit (R08)? | `purchase-requisitions.purchase-requisition.created|updated|converted` and `purchase-orders.purchase-order.created|updated`, in the creating transaction. `converted` records `converted` and `status` before and after. | Every change is audited. |
| Q12 | Demo data (D06)? | A fresh Test tenant gets two requisitions and one PO that converts part of the first, built through the same rules, each skipped when a demo reference is missing or inactive. | The issue's last criterion. |
| Q13 | Screens? | `/admin/[tenant]/purchase-requisitions` and `/admin/[tenant]/purchase-orders`, each a list with a **Create** dialog (any user, hidden while the tenant is read-only), and a PO detail page `/admin/[tenant]/purchase-orders/[id]` with its lines. A **Procurement** group in the tenant sidebar holds both entries. The PO form is a bespoke component, like the BOM recipe form. | Mockup-free: it follows the BOM screens. |
| Q14 | API? | `GET|POST /api/tenants/{tenant}/purchase-requisitions`, `GET|PATCH …/purchase-requisitions/{id}`, `GET|POST …/purchase-orders`, `GET|PATCH …/purchase-orders/{id}`. Added to `BACKWARD_COMPATIBILITY.md` §4. | R07. |

## 📝 Architecture

- **db:** `entities/purchase-requisitions/purchase-requisition.entity.ts`; `entities/purchase-orders/purchase-order.entity.ts` and `purchase-order-line.entity.ts`; all `tenantOwned()`; one migration `purchasing`.
- **core:** `domain/purchasing/` (requisition rules: outstanding, status after conversion; demo data), `validators/purchasing/`, `services/suppliers/find-supplier.ts` (the finder the PO needs), `services/purchase-requisitions/purchase-requisition.service.ts`, `services/purchase-orders/purchase-order.service.ts`, the leaf `services/purchase-orders/purchasing-usage.ts` (`openPurchaseOrderUsing`, `purchasingUsingMaterial`) which `MaterialService` calls, container and cradle lines, the demo-data kinds.
- **app:** pages, actions and route handlers under the two concept folders, `components/purchase-requisitions/` and `components/purchase-orders/`, nav, help and both dictionaries.

## Requirements

- [ ] Requisitions and POs are created, listed and read in the UI and the API, Open on creation with no stock effect (LFC-001, BUY-009, INV-024).
- [ ] A PO saves without a requisition (BUY-002) with per-line dates (BUY-008) and one location (BUY-006, BUY-007).
- [ ] Conversion links a PO line to its requisition, accumulates `converted`, and completes the requisition when fully converted, across suppliers (BUY-003, BUY-004).
- [ ] Inactive and other-tenant suppliers are refused for new POs and not selectable; saved POs stay usable; an open PO doesn't block supplier deactivation (BUY-025, LFC-021, LFC-023, AUD-027, TEN-014).
- [ ] An open PO line blocks material deactivation, naming the PO (LFC-013).
- [ ] Read-only tenants refuse writes; API writes need an idempotency key and, in Test, the generation; stale versions are 409 (R05, R07, AUD-025).
- [ ] Test is seeded with a demonstration requisition and PO (D06).

## Out of scope

Goods receipts (E09-S02); cancel and close early (E11-S01); MRP creation of requisitions and supply counting (BUY-001, BUY-019, BUY-026 in slice 3); supplier price and source lists, automatic stock-transfer creation (N06).

## Acceptance criteria

The issue's nine criteria (#86), each covered by a unit test and, for the screens and the API, an integration test.
