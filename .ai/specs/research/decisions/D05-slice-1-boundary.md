# D05 — Slice 1 includes all master data, the master-data/BOM spreadsheet import and the agent-proposed foundation extras
- Date, owner: 2026-10-19, Piotr12 (product owner, confirmed in the om-discover session)
- Context and the options weighed: open after D02/D03: which of locations, customers and suppliers, material-location parameters, safety-stock targets and the material/BOM spreadsheet import belong to slice 1; and whether the agent's additions to slice 1 (tenant read-only flags, optimistic locking, light/dark theme, exact footer) stay there or move to slice 2.
- Decision and why: owner selected all five master-data items for slice 1, and chose "Keep in slice 1" for the agent's additions (origin: agent proposal).
- Consequences, and what would make us revisit it: slice 1 = foundations + every master (materials, UoM conversions, locations, customers, suppliers, material-location parameters, safety stock, logical BOMs and revisions) + their spreadsheet imports. Stock spreadsheet import, documents, postings and MRP stay later. Revisit at the end-of-slice-1 review.
- Status: active
