# Execution plan: mammoth app icons

**Date:** 2026-10-17 13:23 UTC
**Agent:** Claude Code / claude-opus-5-5. `om-auto-fix-issue 4` → feature route → `om-auto-implement-spec` → `om-auto-create-pr`
Source doc: .ai/specs/2026-10-17--1321UTC-mammoth-app-icons.md (design on spec PR #5)
Issue: #4

## Goal

Replace the Next.js favicon with the 🦣 mammoth (Fluent Emoji Flat, MIT) in every format the spec defines:

- a 16/32/48 ICO;
- a scalable SVG;
- a 180 px Apple touch icon;
- a web manifest with 192, 512 and 512 maskable PNGs.

## Scope

- `packages/app/src/app/`: `favicon.ico` (replaced), `icon.svg`, `apple-icon.png`, `manifest.ts` and `manifest.test.ts`.
- `packages/app/public/icons/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
- `THIRD_PARTY_NOTICES.md` at the repo root.
- `tests/app-icons.test.ts`.
- `tests/integration/app-icons.test.ts` (a new file, so `smoke.test.ts` stays as it is).

**Non-goals** (from the spec):

- `mask-icon` and `browserconfig.xml`;
- PWA behaviour (service worker, `standalone`);
- Open Graph images;
- a brand colour;
- changes to `layout.tsx`.

## Implementation Plan

### Phase 1: Mammoth icons

1. **Artwork, exports, notices and an asset-size test.**
   1. Take the SVG pinned at Fluent commit `d51fb3c`.
   2. Rasterize it with `rsvg-convert`, and pad, add backgrounds and build the ICO with `magick`.
   3. Write `THIRD_PARTY_NOTICES.md` with the MIT notice and the exact commands.
   4. Add `tests/app-icons.test.ts`, which parses the headers with `Buffer` and adds no dependency.
2. **Web manifest.** Add `manifest.ts` plus a unit test covering 100% of it.
3. **Integration test.** Assert the icon URLs (status, content-type), the emitted `<link>` tags with pinned `sizes` and `type`, and that every `href` resolves.
4. **Verify.** Run the full gate, then take an agent-browser screenshot of the tab in Chrome.

## Risks

- Next.js icon `<link>` output differs from its docs (`sizes="48x48"` observed for the ICO). The integration test pins the observed attributes.
- `npm ci --ignore-scripts` in the worktree may leave better-sqlite3 without its native binary. If tests fail on it, run `npm rebuild better-sqlite3`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Mammoth icons

- [x] 1.1 Artwork, exports, notices and asset-size test — c79c0ea
- [x] 1.2 Web manifest — cc2b3e0
- [x] 1.3 Integration test — ff0cd02
- [x] 1.4 Verify — full gate green (lint, typecheck, 77 unit tests at 100% coverage, build, 7 integration tests on the Docker image)

## Notes

- Built output confirms Next.js 16 emits the following, and the integration test pins all of it:
  - `manifest` → `/manifest.webmanifest`;
  - ICO → `sizes="48x48" type="image/x-icon"`;
  - SVG → `sizes="any" type="image/svg+xml"`;
  - Apple → `sizes="180x180" type="image/png"`.
- The spec file lives on spec PR #5, which has not merged. It is not committed here, so moving it to `implemented/` is owed once #5 merges.
- A headless Chrome screenshot cannot show the browser tab strip. UI evidence comes from `om-auto-qa-pr`, and the Firefox, Safari and dark-mode check stays with human QA.
