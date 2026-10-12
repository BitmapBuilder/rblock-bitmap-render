/**
 * CLI: render bitmap images from ordinals.com /r/block data.
 *
 * Default output is a static SVG at 512px. Pass --webp for a lossless WebP
 * raster instead (then --size and --native apply).
 *
 * Pass block heights as bare numbers (comma-separated for several), and ranges
 * with --range:
 *
 *   N                a block height (or comma-separated: 830000,830001)
 *   --range A-B      an inclusive block range
 *   --webp           output WebP instead of SVG
 *   --size N         output size in pixels
 *   --parcels HEX    square color
 *   --gaps HEX       background color
 *   --native         WebP only: whole-pixel grid
 *   --out DIR        output directory
 *   --no-center      flush top-left instead of centered
 *   --auto           center when clearly non-square, flush when near-square
 *   --concurrency N  blocks fetched in parallel
 *   --skip-existing  skip already-rendered blocks
 *
 * Examples:
 *   node dist/cli.js 830000
 *   node dist/cli.js 830000,830001
 *   node dist/cli.js --range 792000-793000 --skip-existing
 *   node dist/cli.js 830000 --webp --size 1024
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fetchRawBlockHex, hexToBytes } from "./rawBlock.js";
import { parseRawBlock } from "./blockParser.js";
import { generateMondrianArray } from "./mondrian.js";
import { renderWebp } from "./webpRenderer.js";
import { renderSvg } from "./svgRenderer.js";
import { parseHexColor, DEFAULT_PARCELS, DEFAULT_GAPS } from "./color.js";

interface Args {
  heights: number[];
  size: number;
  out: string;
  skipExisting: boolean;
  centered: boolean;
  auto: boolean;
  native: boolean;
  concurrency: number;
  format: "svg" | "webp";
  parcels: string;
  gaps: string;
}

/** Parse "792000-793000" (inclusive) into an explicit list of heights. */
function parseRange(spec: string): number[] {
  const m = spec.match(/^(\d+)-(\d+)$/);
  if (!m) throw new Error(`invalid --range "${spec}" (expected START-END, e.g. 792000-793000)`);
  const start = parseInt(m[1], 10);
  const end = parseInt(m[2], 10);
  if (end < start) throw new Error(`--range end (${end}) is before start (${start})`);
  const out: number[] = [];
  for (let h = start; h <= end; h++) out.push(h);
  return out;
}

function parseArgs(argv: string[]): Args {
  const heights: number[] = [];
  let size = 512;
  let out = "output";
  let skipExisting = false;
  let centered = true;
  let auto = false;
  let native = false;
  let concurrency = 32;
  let format: "svg" | "webp" = "svg";
  let parcels = DEFAULT_PARCELS;
  let gaps = DEFAULT_GAPS;

  const needValue = (flag: string, i: number): string => {
    const v = argv[++i];
    if (v === undefined) throw new Error(`${flag} requires a value`);
    return v;
  };
  const addBlocks = (spec: string): void => {
    for (const piece of spec.split(",")) {
      const h = parseInt(piece.trim(), 10);
      if (!Number.isFinite(h) || h < 0) throw new Error(`invalid block height: "${piece}"`);
      heights.push(h);
    }
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--range") {
      heights.push(...parseRange(needValue(a, i++)));
    } else if (a === "--size") {
      size = parseInt(needValue(a, i++), 10);
      if (!Number.isFinite(size) || size < 16) throw new Error(`invalid --size`);
    } else if (a === "--out") {
      out = needValue(a, i++);
    } else if (a === "--parcels") {
      parcels = needValue(a, i++);
      parseHexColor(parcels); // validated once, reused for every block
    } else if (a === "--gaps") {
      gaps = needValue(a, i++);
      parseHexColor(gaps);
    } else if (a === "--skip-existing") {
      skipExisting = true;
    } else if (a === "--no-center") {
      centered = false;
    } else if (a === "--auto") {
      auto = true;
    } else if (a === "--svg") {
      format = "svg";
    } else if (a === "--webp") {
      format = "webp";
    } else if (a === "--native") {
      native = true;
    } else if (a === "--concurrency" || a === "-c") {
      concurrency = Math.max(1, parseInt(needValue(a, i++), 10) || 8);
    } else if (a.startsWith("-")) {
      throw new Error(`unknown option: "${a}"`);
    } else {
      // bare block height(s): "830000" or "830000,830001"
      addBlocks(a);
    }
  }

  if (heights.length === 0) {
    console.error(
      "usage: cli <height>[,<height>...] | --range A-B [--webp] [--size N] [--out DIR] [--skip-existing]"
    );
    process.exit(1);
  }
  return { heights, size, out, skipExisting, centered, auto, concurrency, native, format, parcels, gaps };
}

async function renderBlock(
  height: number,
  args: Args
): Promise<void> {
  const { size, out: outDir, centered, auto, native, format, parcels, gaps } = args;
  const t0 = Date.now();
  console.log(`block ${height}: fetching /r/block/${height}...`);
  const hex = await fetchRawBlockHex(height);
  console.log(`  fetched ${hex.length / 2} bytes (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  const raw = hexToBytes(hex);
  const { txCount, txValues } = parseRawBlock(raw);
  console.log(`  parsed ${txCount} txs`);

  const { rects, viewBox } = generateMondrianArray(txValues);
  console.log(`  mondrian: ${rects.length} squares, viewBox ${viewBox.join(" ")}`);

  if (format === "svg") {
    const svg = renderSvg(rects, viewBox, { size, centered, auto, parcels, gaps });
    const outPath = join(outDir, `${height}.svg`);
    writeFileSync(outPath, svg);
    console.log(`  wrote ${outPath} (${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB, svg ${size}px, ${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
    return;
  }

  const webp = await renderWebp(rects, viewBox, { size, centered, auto, native, parcels, gaps });
  const outPath = join(outDir, `${height}.webp`);
  writeFileSync(outPath, webp);
  const mode = native ? "native grid" : "direct";
  console.log(`  wrote ${outPath} (${(webp.length / 1024).toFixed(1)} KB, ${mode}, ${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });

  const ext = args.format === "svg" ? "svg" : "webp";
  let done = 0;
  let failed = 0;
  const total = args.heights.length;
  const t0 = Date.now();

  const report = () => {
    const secs = (Date.now() - t0) / 1000;
    const rate = (done + failed) / secs;
    const eta = rate > 0 ? Math.round((total - done - failed) / rate) : 0;
    console.log(`progress: ${done + failed}/${total} (${failed} failed) ${rate.toFixed(1)} blk/s ETA ${eta}s`);
  };

  const worker = async (queue: number[]): Promise<void> => {
    while (queue.length > 0) {
      const h = queue.shift();
      if (h === undefined) return;
      if (args.skipExisting && existsSync(join(args.out, `${h}.${ext}`))) {
        done++;
        continue;
      }
      try {
        await renderBlock(h, args);
        done++;
      } catch (err) {
        failed++;
        console.error(`block ${h}: FAILED — ${err instanceof Error ? err.message : err}`);
      }
      if (total > 1 && (done + failed) % 100 === 0) report();
    }
  };

  const queue = [...args.heights];
  const n = Math.max(1, Math.min(args.concurrency, queue.length));
  await Promise.all(Array.from({ length: n }, () => worker(queue)));

  const secs = (Date.now() - t0) / 1000;
  console.log(`finished: ${done} rendered, ${failed} failed in ${secs.toFixed(0)}s (${((done + failed) / secs).toFixed(1)} blk/s)`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
