# rblock-bitmap-render

Bitmaps from Bitcoin raw blocks, sourced from the ordinals.com recursive
endpoint, rendered to WebP (lossless) via the Mondrian layout.

## Pipeline

ordinals.com /r/block/{height} (raw block hex)
  -> parse txs (pure TS block parser, no libraries)
  -> txValues[i] = sum of outputs of tx i, in BTC   (same contract as Bitmap-LENS-BLK block_parser.py)
  -> classify amounts to square sizes 1-10          (tx_classifier.py port)
  -> MondrianLayout placement                       (mondrian_layout.py port)
  -> rasterize rect array (pure JS, -0.5 gap logic)
  -> WebP lossless (sharp)

## Usage

    npm install
    npm run build
    npm run render -- 830000
    npm run render -- 830000 830001 --size 512 --out output
    npm run render -- --from 792000 --to 793000 --skip-existing

## Package layout (handover contract)

Two worlds, one core:

- `src/index.ts` barrel — BROWSER-SAFE, zero dependencies, no Node APIs:
  `fetchRawBlockHex` → `parseRawBlock` → `generateMondrianArray` →
  `drawBitmapToContext` / `createBitmapCanvas`. Bundleable into a Vite app
  or an inscription (ordinals.com serves `/r/*` same-origin, CSP 'self'
  allows the fetch).
- `./node` export (src/webpRenderer.ts) — Node-only, sharp: `renderWebp`
  for the build-time pass that writes lossless WebP files to disk.
- CLI — batch/range rendering for server-side generation.

### Consuming from another app (Vite / inscribed) — display

    import { fetchRawBlockHex, hexToBytes, parseRawBlock,
             generateMondrianArray, drawBitmapToContext }
      from "rblock-bitmap-render/src";

    const hex = await fetchRawBlockHex(height);          // one /r/block fetch
    const { txValues } = parseRawBlock(hexToBytes(hex));
    const { rects, viewBox } = generateMondrianArray(txValues);
    drawBitmapToContext(canvas.getContext("2d"), rects, viewBox, 512);

### Consuming from an app that SAVES FILES (download in browser)

    import { downloadBitmap, openBitmapFolder, writeBlobToDirectory,
             encodeBitmapBlob, fetchRawBlockHex, hexToBytes, parseRawBlock,
             generateMondrianArray }
      from "rblock-bitmap-render/src";

    const { rects, viewBox } = generateMondrianArray(
      parseRawBlock(hexToBytes(await fetchRawBlockHex(height))).txValues);

    // single file, one click:
    await downloadBitmap(height, rects, viewBox, { mime: "image/png" });

    // bulk, one folder picker then silent writes (Chromium):
    const dir = await openBitmapFolder();
    if (dir) for (const h of heights) {
      const blob = await encodeBitmapBlob(rectsOf(h), viewBoxOf(h), { size: 1024 });
      await writeBlobToDirectory(dir, `${h}.png`, blob);
    }

    // Browser encode formats: PNG = lossless (default). toBlob webp is
    // ALWAYS lossy in browsers — for true lossless WebP files use the
    // Node pass below.

### Consuming from a Node build script (writes .webp files)

    import { renderWebp } from "rblock-bitmap-render/node";
    import { writeFileSync } from "node:fs";

    const webp = await renderWebp(rects, viewBox, { size: 1024 });
    writeFileSync(`${height}.webp`, webp);

## Outputs

output/{height}.webp — lossless WebP, 1024px default.
With --dump-values also output/{height}.txvalues.json for cross-checking
against the Python pipeline.

## Verification

Compare txValues with Bitmap-LENS-BLK on the same block:

    PYTHONPATH=... python3 -c "from bitmap_svg.block_parser import parse_block; print(parse_block(830000, '/mnt/f/Bitcoin/blocks', '/mnt/f/Bitcoin/blocks/index')['txValues'][:5])"

See tools/ for the cross-check script.
