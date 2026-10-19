# Menu revamp — five clickable mockups

Five different answers to "how should CPG's menu work once the whole product exists?". They all follow [`BRIEF.md`](BRIEF.md), which lists the shared requirements, screen inventory and sample data. They're static HTML: no build, no server, no network.

| Folder | Concept |
|---|---|
| [`01-sidebar-tree/`](01-sidebar-tree/index.html) | Classic left sidebar with the master-data tree, collapsible to an icon rail |
| [`02-top-megamenu/`](02-top-megamenu/index.html) | Today's top bar evolved: mega-menu panels plus a tab row inside each section |
| [`03-launcher-command/`](03-launcher-command/index.html) | Launcher home ("Cave map") plus a ⌘K command palette, recent and pinned chips |
| [`04-process-flow/`](04-process-flow/index.html) | Menu laid out as the planning loop: Master data → Demand → Plan → Supply → Stock → Ship |
| [`05-rail-and-panel/`](05-rail-and-panel/index.html) | Icon rail coloured by tenant, contextual tree panel, bottom tabs on mobile |

## How to review on your machine

The mockups live on branch `cez/774d80cf`, in its cezar worktree.

1. **Open the comparison page** (it links to all five):

   ```sh
   open /Users/piotrek/repos/CPG/.ai/cezar/worktrees/774d80cf-d7d7-4ccf-9fb9-551660142cfd/.ai/specs/assets/menu-revamp/index.html
   ```

   Or, from the main checkout once the branch is there: `git fetch && git checkout cez/774d80cf -- .ai/specs/assets/menu-revamp`, then `open .ai/specs/assets/menu-revamp/index.html`.

   If your browser blocks `file://` pages, serve the folder instead:

   ```sh
   cd /Users/piotrek/repos/CPG/.ai/cezar/worktrees/774d80cf-d7d7-4ccf-9fb9-551660142cfd/.ai/specs/assets/menu-revamp
   python3 -m http.server 8765    # then open http://localhost:8765
   ```

2. **In each mockup**, use the dashed **Mockup controls** box (bottom-right) to:
   - switch **Role**: admin or normal user. Normal users get read-only master data and no Users/Tenants/System;
   - toggle **Show later slices**, to see the menu as it is in slice 1 and as it will be once everything ships;
   - read **About this concept**: the idea, the trade-offs and the click counts.
3. **Try the same five tasks in each one**, so the comparison is fair:
   1. Open a material and its unit conversions.
   2. Go to Locations, then Suppliers (the #23 screens).
   3. Flip Test → Prod and check that you stay on the same screen.
   4. As the admin, make Prod read-only on the Tenants page (#25), then look at the lock, the banner and the disabled buttons.
   5. Change the language or theme from the account menu.
4. **Check mobile**: open DevTools (⌥⌘I), toggle the device toolbar (⇧⌘M) and pick an iPhone (390 px). Or just make the window narrow.
5. **Send feedback** as "take 02's bar, 01's tree, 03's palette…". Mixing is expected. The winning combination becomes the spec for the menu rebuild.

`preview-desktop.png` and `preview-mobile.png` in each folder are quick screenshots for a first look.
