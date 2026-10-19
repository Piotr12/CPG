# D02 — Build order: material master data and BOMs first, then the other document types, MRP only once everything works manually
- Date, owner: 2026-10-19, Piotr12 (product owner, confirmed in the om-discover session)
- Context and the options weighed: the PRD calls the whole baseline "the MVP"; asked whether there is an order for what must work first or whether it is one release.
- Decision and why: owner's words: "Start from Material Masterdata and BOM, then other document types, only when all works manually do the MRP run. This is not that huge of a development actually, yes, non trivial but well defined and fully testable."
- Consequences, and what would make us revisit it: MRP work starts only after the manual document flows work. The exact membership of locations, customers/suppliers, material-location parameters, safety stock and the master-data/BOM spreadsheet imports in the first slice was not stated (open question in the brief). The owner's view that the build is well defined and fully testable is a belief, recorded as an assumption in the brief.
- Status: active
