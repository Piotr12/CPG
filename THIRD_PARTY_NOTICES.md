# Third-party notices

CPG is licensed under AGPL-3.0-only (see [`LICENSE`](LICENSE)). It includes the following third-party material under its own licence.

## Fluent Emoji: Mammoth (app icons)

The app icons are the Mammoth emoji from Microsoft's [Fluent Emoji](https://github.com/microsoft/fluentui-emoji), Flat style, taken from commit [`d51fb3ca3eb3753c442c0ac1556dd41e957dde5b`](https://github.com/microsoft/fluentui-emoji/blob/d51fb3ca3eb3753c442c0ac1556dd41e957dde5b/assets/Mammoth/Flat/mammoth_flat.svg).

- `packages/app/src/app/icon.svg` is the original SVG, unmodified.
- `packages/app/src/app/favicon.ico`, `packages/app/src/app/apple-icon.png` and `packages/app/public/icons/*.png` are rendered from it.

To regenerate the rendered files, run this from the repository root. It needs `rsvg-convert` (librsvg) and ImageMagick 7 (`magick`).

```bash
APP=packages/app/src/app; PUB=packages/app/public/icons; T=$(mktemp -d)
for s in 16 32 48; do rsvg-convert -w $s -h $s $APP/icon.svg -o $T/$s.png; done
magick $T/16.png $T/32.png $T/48.png $APP/favicon.ico
rsvg-convert -w 192 -h 192 $APP/icon.svg | magick - -strip $PUB/icon-192.png
rsvg-convert -w 512 -h 512 $APP/icon.svg | magick - -strip $PUB/icon-512.png
# Apple touch icon: opaque white, the glyph at 80% (iOS ignores transparency).
rsvg-convert -w 144 -h 144 $APP/icon.svg | magick - -background '#ffffff' -gravity center -extent 180x180 -alpha remove -alpha off -strip $APP/apple-icon.png
# Maskable icon: opaque white, the glyph at ~60% so it stays inside the 80% safe zone.
rsvg-convert -w 308 -h 308 $APP/icon.svg | magick - -background '#ffffff' -gravity center -extent 512x512 -alpha remove -alpha off -strip $PUB/icon-maskable-512.png
```

`tests/app-icons.test.ts` checks the sizes of the rendered files.

```text
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE
```
