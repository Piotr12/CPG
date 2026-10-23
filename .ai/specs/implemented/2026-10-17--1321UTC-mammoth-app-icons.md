# Mammoth app icons

**Status:** implemented
**Created:** 2026-10-17 13:21 UTC
**Issue:** #4

## 📝 TLDR

Everyone who opens cpg.baby currently sees the stock Next.js logo in the browser tab, in bookmarks and on a phone home screen. This change will replace it with the 🦣 mammoth emoji, drawn as an image (not a font glyph), in the formats and sizes current browsers request (this spec defines that set as the six-file set below; extra PNG sizes such as 32, 96 or 167 px are deliberately left out because browsers and iOS scale from these): an ICO, a scalable SVG, an Apple touch icon, and a web manifest with Android/PWA sizes. The files are static and committed. The only new code is `manifest.ts`.

## 📝 Problem Statement

`packages/app/src/app/favicon.ico` is the create-next-app default, and it is the app's only icon. `packages/app/src/app/` has no `icon.*` or `apple-icon.*` and no manifest, and `packages/app/public/` holds only `robots.txt`. As a result:

- the Next.js logo stands in for CPG in tabs, bookmarks and history;
- iOS "Add to Home Screen" falls back to a page screenshot;
- Android/Chrome has no manifest icon, so it draws a letter tile.

## 📝 Proposed Solution

Use the Next.js metadata file conventions (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`, `manifest.md`). Next.js then emits the `<link>` tags itself, and `layout.tsx` stays unchanged.

| File | Content | Served at | Purpose |
| --- | --- | --- | --- |
| `packages/app/src/app/favicon.ico` (replaced) | 16, 32 and 48 px images in one ICO, transparent | `/favicon.ico` | legacy browsers, `/favicon.ico` probes, Windows shortcuts |
| `packages/app/src/app/icon.svg` | source artwork, scalable, transparent | `/icon.svg?…` | tab icon in current Chrome, Edge, Firefox and Safari |
| `packages/app/src/app/apple-icon.png` | 180×180, opaque `#ffffff` background, ~10% padding | `/apple-icon.png?…` | iOS/iPadOS home screen (iOS ignores transparency and applies its own mask) |
| `packages/app/public/icons/icon-192.png` | 192×192, transparent | `/icons/icon-192.png` | manifest `purpose: "any"` |
| `packages/app/public/icons/icon-512.png` | 512×512, transparent | `/icons/icon-512.png` | manifest `purpose: "any"`, install and splash screen |
| `packages/app/public/icons/icon-maskable-512.png` | 512×512, opaque `#ffffff`, glyph inside the central 80% safe zone (glyph ≈ 60% of the side) | `/icons/icon-maskable-512.png` | manifest `purpose: "maskable"` (Android adaptive icons) |
| `packages/app/src/app/manifest.ts` | `MetadataRoute.Manifest` | `/manifest.webmanifest` | lists the three PNGs |

**Artwork:** the Mammoth from Microsoft's [Fluent Emoji](https://github.com/microsoft/fluentui-emoji), **Flat** style (`assets/Mammoth/Flat/mammoth_flat.svg`, pinned at commit `d51fb3ca3eb3753c442c0ac1556dd41e957dde5b`), MIT-licensed. It is a 2 KB, 32×32-viewBox SVG with flat fills, and it stays legible at 16 px, unlike the gradient-heavy "Color" style.

**Manifest fields:** `name: "Caveman Planning Good"` (same as the `<title>` in `layout.tsx`), `short_name: "CPG"`, `start_url: "/"`, `display: "browser"`, `background_color` and `theme_color` `"#ffffff"`, and the three icons above with `sizes` and `type: "image/png"`. `display: "browser"` keeps today's behaviour. The manifest only supplies icons and a name, and the app does not become an installable standalone PWA.

**Generation:** the PNGs and the ICO are exported once from `icon.svg` and committed. The exact commands, `rsvg-convert` for rasterizing and ImageMagick `magick` for padding, backgrounds and the ICO, are recorded in `THIRD_PARTY_NOTICES.md` next to the attribution, so anyone can regenerate them. No generator script or npm dependency is added.

**Alternatives considered:**

- *`icon.tsx`/`apple-icon.tsx` generated with `next/og` `ImageResponse`.* Rejected. Emoji rendering fetches artwork from a CDN, and a favicon (`.ico`) cannot be generated anyway, so static files would still be needed. It also adds code and tests for no user benefit.
- *A committed generator script on `sharp`.* Rejected for now. It would add a direct dependency (sharp is only a transitive dependency of `next` today) and 100%-covered script code, for assets that change roughly never.
- *Noto Emoji artwork.* Rejected. Its README says the images are Apache-2.0, but Noto's own repository `LICENSE` file is now OFL-1.1 (font software), so the licence of an extracted image is ambiguous.
- *Twemoji artwork.* Rejected. CC-BY 4.0 requires visible attribution.
- *Apple artwork.* Proprietary, never allowed.

## 📝 Architecture

This change is `packages/app` only: static assets plus one metadata route. It touches no `core`, `db` or `ui` code, no service and no database. The Dockerfile already copies `packages/app/public` and `.next/static` into the image, so no deploy change is needed. All new URLs are additive, and `/favicon.ico` keeps its path, so `BACKWARD_COMPATIBILITY.md` §4 (public URLs) is not affected.

## 📝 UI/UX

- Only the tab, bookmark, history, home-screen and install surfaces change. No page content changes.
- The SVG and ICO keep a transparent background. Against the Flat palette's main brown (#A56953), that is legible on both light and dark tab strips.
- iOS and maskable icons sit on white so the platform masks never cut into the glyph.

Prototype: `.ai/specs/assets/mammoth-app-icons/artwork-preview.png`. From left to right: Fluent Flat at 256 px, Fluent Color at 256 px, Flat at 16 px, Color at 16 px (the 16 px images are enlarged). Both are rendered with `rsvg-convert`. The 16 px images are why Flat was chosen.

## 📝 Edge Cases & Failure Scenarios

- **Browser caches the old favicon.** Next.js 16 links every icon with a content-hash query (today's build emits `<link rel="icon" href="/favicon.ico?favicon.<hash>.ico" sizes="48x48" type="image/x-icon"/>`), so pages pick up the new files. Clients that probe the bare `/favicon.ico` (bookmarks, some readers) may keep the old one until their cache expires. This is accepted. No cache-busting hacks.
- **ICO and SVG both offered.** Next.js emits the ICO with `sizes="48x48"` (its largest image; observed in this repo's build, while `app-icons.md` still documents `sizes="any"`) and the SVG with `sizes="any"`. Browsers that support SVG prefer the scalable `any` icon, and others use the ICO. Implementation verifies the tags actually emitted (integration test) and checks the tab in Chrome, Firefox and Safari.
- **Wrong sizes slipping in on regeneration.** A repo-wide unit test reads the committed files' headers and asserts every size listed above.

## 📝 Risks & Impact Review

Low and fully reversible: reverting the PR restores the old favicon. The only lasting obligation is licence compliance. MIT requires its copyright and permission notice to ship with copies, which `THIRD_PARTY_NOTICES.md` (repo root) provides. MIT is compatible with the project's AGPL-3.0-only licence.

## Resolved assumptions (autonomous defaults)

| # | Question | Default | Rationale |
| --- | --- | --- | --- |
| A1 | Which emoji artwork? (issue #4 suggested Noto) | Fluent Emoji **Flat**, MIT | Noto's image licence is now ambiguous (its README says Apache-2.0, its repository `LICENSE` is OFL-1.1). MIT is unambiguous, needs no visible attribution, and the Flat style reads best at 16 px. Swapping the artwork later means replacing files only. |
| A2 | Static files or generated at build/run time? | Static, committed, with regeneration commands documented | Least new surface: no dependency, no script, no CDN call. Fully reversible. |
| A3 | Should the manifest make the app an installable PWA? | No: `display: "browser"`, icons and name only | The issue lists a PWA as a non-goal. The smallest scope that still supplies Android icons. |
| A4 | Background for opaque icons (Apple, maskable) | `#ffffff` | Neutral, and the app has no brand colour yet. A one-line change in the regeneration commands if a brand colour is chosen later. |

No assumption needs human confirmation before merge: each one is cosmetic and reversible by swapping files.

## 📋 Phasing

One phase: everything ships in a single PR that closes #4.

## 📋 Implementation Plan

### Phase 1: Mammoth icons

1. **Artwork, raster exports and notices.**
   1. Add `packages/app/src/app/icon.svg` (the pinned Fluent Flat SVG, byte-for-byte).
   2. Export from it `apple-icon.png` (180, white, padded), `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, and a 16/32/48 `favicon.ico` replacing the Next.js one.
   3. Add `THIRD_PARTY_NOTICES.md` with the source URL, the pinned commit, the MIT notice and the regeneration commands.
   4. Add `tests/app-icons.test.ts`. It reads the PNG IHDR and ICO directory headers with plain `Buffer` reads (no new dependency) and asserts every file exists at its listed sizes (the ICO holds exactly 16, 32 and 48).

   The app keeps working: the files are picked up automatically.
2. **Web manifest.** Add `packages/app/src/app/manifest.ts` (default export returning `MetadataRoute.Manifest` as above) and `manifest.test.ts` asserting the name, start URL and display, and that the icon list has the three entries with the right `src`, `sizes`, `type` and `purpose`. Coverage stays at 100%.
3. **Integration test.** In `tests/integration/smoke.test.ts` (or a new `tests/integration/app-icons.test.ts`):
   1. Fetch `/favicon.ico`, `/manifest.webmanifest` and every manifest icon `src`, and assert 200 with the right `content-type`.
   2. Open `/` in the browser and assert the `<head>` holds `link[rel=icon]` for `/favicon.ico…` and `/icon.svg…`, `link[rel=apple-touch-icon]`, and `link[rel=manifest]`. Pin the exact `sizes` and `type` attributes Next.js emits, so a framework change in icon selection fails loudly.
   3. Fetch each `href` read from those tags and assert 200.
4. **Verify.**
   1. Run the full gate: lint, typecheck, test:coverage, build, test:integration.
   2. Screenshot the tab in Chrome via agent-browser for the PR.
   3. Firefox, Safari and dark mode are a human QA checklist item, because the pipeline drives Chrome only.

## Acceptance criteria

- [ ] The tab of `/` and `/admin` shows the mammoth in Chrome (agent-browser evidence).
- [ ] Human QA: the same in Firefox and Safari, in light and dark mode.
- [ ] `/favicon.ico` (16/32/48), `/icon.svg`, `/apple-icon.png` (180), `/manifest.webmanifest` and the three manifest PNGs (192, 512, 512 maskable) return 200 with the correct content type and size.
- [ ] No Next.js artwork remains in the repository.
- [ ] `THIRD_PARTY_NOTICES.md` carries the Fluent Emoji MIT notice and the regeneration commands.
- [ ] Unit coverage stays at 100%, and the integration test covers the icon tags and URLs.

## Out of scope

- Obsolete formats: `mask-icon` (Safari pinned tabs), `browserconfig.xml` / `msapplication-*` (Windows tiles).
- A full PWA: a service worker, offline mode or `display: "standalone"`.
- Open Graph / social preview images.
- A brand colour or theme beyond the white icon backgrounds.

## Implementation notes

- Implemented in PR #6 (spec PR #5); #4 closed as completed. Filed as implemented on 2026-10-23, in the second slice 2 closing pass: the spec had stayed in the active folder with `Status: ready`.
- `tests/app-icons.test.ts` checks the committed icons, and `tests/integration/app-icons.test.ts` checks the served tags and URLs. The latter waits for `/admin`'s streamed head since #166.
- The acceptance checkboxes above are left as written. The automated ones are covered by those tests. The human QA in Firefox and Safari was never recorded.
