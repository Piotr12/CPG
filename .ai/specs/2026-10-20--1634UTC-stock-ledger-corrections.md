# Physical stock ledger and reasoned corrections

**Status:** draft
**Created:** 2026-10-20 16:34 UTC
**Issue:** #80 (E07-S01)

## 📝 TLDR
Both roles need to see physical stock and record corrections in a tenant. CPG currently has no stock postings. The proposed scope adds exact BUoM balances backed by an immutable signed ledger, with a reasoned correction as its first posting source. Implementation is waiting on the input-semantics conflict below.

## Open Questions

### Q1 — Does a manual correction take a signed change or the desired final balance?

This is a source conflict, not an unspecified implementation detail:

- Issue #80 and acceptance scenario INV-006 specify signed input: on-hand 2, enter −3, refuse it with available quantity and no stock movement or business audit entry.
- `research/CPG-prd-decisions.pdf` §03, page 6, **Manual correction** says: “Actual target physical balance specified per material/site, delta calculated”.
- `research/CPG-prd-datamodel.pdf`, dictionary page 6, **Inventory adjustment** describes a signed quantity derived from user input or an XLS target balance.
- `research/CPG-prd001.pdf` §03 explicitly requires target balances for XLS imports, but does not expressly settle the manual form's input.

**Recommended decision:** manual corrections accept signed changes, following the dispatched issue, INV-006 and conceptual model; XLS continues to accept target balances in E07-S02. The contradictory decision-register row must be reconciled with the owner's decision before implementation.

**Alternative:** manual corrections accept a desired final balance; the system computes the signed movement. Issue #80 and INV-006 must be reconciled before implementation. Example: current 2, target 5 → movement +3; entering 5 as a signed adjustment would instead produce balance 7.

Do not add both modes by default: that expands the UI and API beyond the requested capability.

**Gate:** AGENTS.md requires stopping when a task conflicts with its spec. The baseline authority is product-brief D04; `om-spec-writing` autonomous defaults cannot silently supersede an active product decision. No runtime code or public contract has been changed.

## 📝 Problem Statement
Issue #80 and PRD §03 require physical balances and corrections before operational documents can post stock. Imports, transfers, reversals and the filtered stock report remain separate stories.

## 📋 Implementation Plan
Pending Q1. After the owner resolves input semantics:

1. Complete and review the design (entities, atomic group posting, exact arithmetic, date, audit, contracts and UI states); publish a design-only spec PR.
2. Implement entities/migration, exact signed quantities, posting service, balance reads, master-data guards and demo stock with unit/race/isolation tests.
3. Implement UI/API parity, EN/PL strings, help and integration coverage.
4. Run the full configured validation gate, obtain a fresh review, capture UI evidence and publish a separate implementation PR.
