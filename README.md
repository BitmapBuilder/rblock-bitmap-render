# rblock-bitmap-render

Renders Bitcoin bitmap images from raw blocks, sourced from the ordinals.com
recursive endpoint (`/r/block/{height}`). One block, or a whole range.

By default it writes a **static SVG** (vector, no script) at 512px. Pass
`--webp` for a lossless WebP raster instead.

## Quick start

    npm install
    npm run build
    npm run render -- --block 830000

Writes `output/830000.svg`.

Or, without npm:

    node dist/cli.js --block 830000

## Commands

    npm run render -- --block 830000                     # one block
    npm run render -- --block 830000 --block 830001      # several blocks
    npm run render -- --block 830000,830001,830002       # or comma-separated
    npm run render -- --range 792000-793000              # an inclusive range

## Flags

| Flag | Default | What it does |
|------|---------|--------------|
| `--block N` | — | Block height. Repeat, or comma-separate, for several. |
| `--range A-B` | — | Inclusive block range (e.g. `792000-793000`). |
| `--webp` | off | Output a lossless WebP raster instead of SVG. |
| `--size N` | `512` | Output size in pixels. |
| `--parcels HEX` | `#f7921c` | Square color. |
| `--gaps HEX` | `#0d0d0d` | Background color. |
| `--native` | off | WebP only. Snap to a whole-pixel grid (every gap exactly equal). Output is the block's natural size, not exactly `--size`. Use for 1:1 display only. |
| `--out DIR` | `output` | Output directory. |
| `--no-center` | off | Flush the art to the top-left instead of centering. |
| `--concurrency N` | `32` | Blocks fetched in parallel. 32 is the measured ceiling. |
| `--skip-existing` | off | Skip blocks already rendered. Use when resuming. |

### Examples

    npm run render -- --block 830000
    npm run render -- --block 830000 --webp --size 1024
    npm run render -- --block 830000 --webp --size 512 --native
    npm run render -- --block 830000 --parcels "#dff9d3c" --gaps "#1a1a1a"
    npm run render -- --range 0-900000 --skip-existing

## Output

- `output/{height}.svg` — static SVG (default).
- `output/{height}.webp` — lossless WebP (with `--webp`).

## Why SVG by default

The SVG is a real vector file, no script. Any viewer draws it fresh at its own
pixel size, so gaps stay uniform and it is crisp at any resolution. It is also
small: every square is packed into a single `<path>`, so a full block is a few
tens of KB (a few KB over brotli).

WebP is the fallback for pipelines that need a fixed raster.

### Displaying the SVG

    <img src="830000.svg" width="512" height="512">

Use `<img>`, not inlined SVG markup. Inlining puts every square into the page
DOM; `<img>` keeps them isolated. Far lighter for grids of many bitmaps.

## Using it as a library

The core is dependency-free and runs in the browser as well as Node.

### Browser / bundled app

    import { fetchRawBlockHex, hexToBytes, parseRawBlock,
             generateMondrianArray, drawBitmapToContext }
      from "rblock-bitmap-render/src";

    const hex = await fetchRawBlockHex(height);          // one /r/block fetch
    const { txValues } = parseRawBlock(hexToBytes(hex));
    const { rects, viewBox } = generateMondrianArray(txValues);
    drawBitmapToContext(canvas.getContext("2d"), rects, viewBox, 512);

To build a static SVG string in the browser:

    import { renderSvg } from "rblock-bitmap-render/src";
    const svg = renderSvg(rects, viewBox, { size: 512 });

### Node — write lossless WebP files

    import { renderWebp } from "rblock-bitmap-render/node";
    import { writeFileSync } from "node:fs";

    const webp = await renderWebp(rects, viewBox, { size: 1024 });
    writeFileSync(`${height}.webp`, webp);

## Pipeline

    /r/block/{height}          raw block hex
      -> parse transactions     pure TS, no libraries
      -> txValues[i]            sum of tx i's output values, in BTC
      -> classify amounts       each amount -> square size 1..10
      -> Mondrian layout        pack squares, compute viewBox
      -> render                 static SVG (default) or lossless WebP

## Requirements

- Node >= 18
- `sharp` (installed by `npm install`) — used only for WebP output.
