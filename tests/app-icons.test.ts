// Checks the committed app icons (spec .ai/specs/implemented/2026-10-17--1321UTC-mammoth-app-icons.md) have the
// sizes browsers request, so a regeneration with a wrong size fails here instead of in a browser.
// THIRD_PARTY_NOTICES.md holds the commands that render them from icon.svg.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "vitest";

const repoRoot = join(import.meta.dirname, "..");
const appDir = join(repoRoot, "packages/app/src/app");
const publicIcons = join(repoRoot, "packages/app/public/icons");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// PNG IHDR colour types: 2 = RGB (opaque), 6 = RGBA.
const RGB = 2;
const RGBA = 6;

/** Width, height and colour type from a PNG's IHDR chunk, which always comes first. */
function readPng(path: string) {
  const bytes = readFileSync(path);
  assert.ok(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${path} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

/** The square sizes listed in an ICO's directory (a size byte of 0 means 256). */
function readIcoSizes(path: string): number[] {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt16LE(0), 0, "ICO reserved field");
  assert.equal(bytes.readUInt16LE(2), 1, "ICO type must be 1 (icon)");
  const count = bytes.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const entry = 6 + index * 16;
    const [width, height] = [bytes[entry] || 256, bytes[entry + 1] || 256];
    assert.equal(width, height, `${path} entry ${index} is not square`);
    return width;
  });
}

// The Fluent Flat mammoth's body colour. The centre of the stock Next.js favicon is white.
const MAMMOTH_BROWN = { red: 0xa5, green: 0x69, blue: 0x53 };

/**
 * The RGB of the centre pixel of an ICO's `size`-px image. magick writes each image as a 32-bit
 * bottom-up BMP (a 40-byte header, then BGRA rows), which is all this reads.
 */
function readIcoCentrePixel(path: string, size: number) {
  const bytes = readFileSync(path);
  const index = readIcoSizes(path).indexOf(size);
  assert.notEqual(index, -1, `${path} has no ${size} px image`);
  const image = bytes.readUInt32LE(6 + index * 16 + 12);
  assert.equal(bytes.readUInt32LE(image), 40, "expected a BMP (BITMAPINFOHEADER) image");
  assert.equal(bytes.readUInt16LE(image + 14), 32, "expected 32 bits per pixel");
  const centre = size / 2;
  const row = size - 1 - centre; // rows are stored bottom-up
  const pixel = image + 40 + (row * size + centre) * 4;
  return { red: bytes[pixel + 2], green: bytes[pixel + 1], blue: bytes[pixel] };
}

describe("app icons", () => {
  test("favicon.ico holds 16, 32 and 48 px images", () => {
    assert.deepEqual(readIcoSizes(join(appDir, "favicon.ico")), [16, 32, 48]);
  });

  test("favicon.ico shows the mammoth, not the Next.js logo", () => {
    assert.deepEqual(readIcoCentrePixel(join(appDir, "favicon.ico"), 48), MAMMOTH_BROWN);
  });

  test("icon.svg is the scalable source artwork", () => {
    const svg = readFileSync(join(appDir, "icon.svg"), "utf8");
    assert.match(svg, /^<svg [^>]*viewBox="0 0 32 32"/);
  });

  test.each([
    ["apple-icon.png", appDir, 180, RGB],
    ["icon-192.png", publicIcons, 192, RGBA],
    ["icon-512.png", publicIcons, 512, RGBA],
    ["icon-maskable-512.png", publicIcons, 512, RGB],
  ])("%s is %i px with the expected transparency", (file, dir, size, colorType) => {
    assert.deepEqual(readPng(join(dir, file)), { width: size, height: size, colorType });
  });
});
