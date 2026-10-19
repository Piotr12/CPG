# D06 — The Test demonstration dataset is seeded in slice 1; the atomic Test reset is built later
- Date, owner: 2026-10-19, Piotr12 (product owner, confirmed in the om-discover session)
- Context and the options weighed: TEN-001 requires the Test tenant to start with demonstration records and the reset regenerates them. Options: both in slice 1; demo data in slice 1 and reset later; both later.
- Decision and why: owner chose "Demo in 1, reset later".
- Consequences, and what would make us revisit it: slice 1 seeds Test with master-data and BOM demo records; later slices extend the dataset. The atomic Test reset (a new dataset generation restarting Test IDs) is built in slice 2, so its TEN scenarios are not in slice 1's acceptance set. The dataset-generation precondition on Test API writes stays in slice 1 per D03; until the reset exists, Test stays on its first generation.
- Status: active
