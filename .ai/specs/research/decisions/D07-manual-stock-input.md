# D07 — Manual stock corrections use signed changes; XLS uses desired balances

- Date, owner: 2026-10-20, Piotr12. The owner instructed the #80 agent to continue autonomously, make reasonable assumptions and ask no further clarification after the source conflict was presented. This records the agent's selected assumption under that delegation, not an explicit selection of an option by the owner.
- Conflict: issue #80 and INV-006 say signed manual input; the conceptual model describes a signed quantity from user input or XLS target balance. Decision register §03, Manual correction, instead says target physical balance for manual entry. The PRD expressly requires target balances for XLS and leaves the manual input form less specific.
- Decision: manual corrections accept a signed delta. With current stock 2, input 5 adds five and leaves 7. With current stock 2, input -3 is refused with available/required quantities and no movement/audit. XLS retains absolute target balances under E07-S02; it will compute a signed movement internally.
- Why: follow the dispatched issue and its concrete acceptance case; no additional form modes or public contracts. Both interpretations share the same exact signed ledger and non-negative invariant.
- Supersedes: the target-input clause of the decision register §03 Manual correction row for manual UI/API input only. This Markdown entry is the normative erratum to the historical PDF export; no other requirement in D04's four-document baseline changes.
- Review: this assumption is visible on design PR #103 and implementation PR #104. Revisit if the owner requests absolute manual reconciliation; do not silently reinterpret the existing API's quantity field after release.
- Status: active
