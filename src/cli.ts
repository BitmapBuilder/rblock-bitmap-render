/**
 * CLI: render bitmap WebPs from ordinals.com /r/block data.
 *
 * Usage:
 *   node dist/cli.ts <height> [<height2> ...] [--from N --to N]
 *                     [--size 1024] [--out DIR] [--dump-values]
 *                     [--skip-existing]
 *
 * Examples:
 *   node dist/cli.ts 830000
 *   node dist/cli.ts 830000 830001 --size 512 --out output
 *   node dist/cli.ts --from 792000 --to 793000 --skip-existing
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";
import { join } from "node:path";
import { fetchRawBlockHex, hexToBytes } from "./rawBlock.js";
import { parseRawBlock } from "./blockParser.js";
import { generateMondrianArray } from "./mondrian.js";
import { renderWebp } from "./webpRenderer.js";
import { renderSvg } from "./svgRenderer.js";

interface Args {
  heights: number[];
  size: number;
  out: string;
  dumpValues: boolean;
  skipExisting: boolean;
  centered: boolean;
  native: boolean;
  concurrency: number;
  format: string;
}

function parseArgs(argv: string[]): Args {
  const heights: number[] = [];
  let size = 1024;
  let out = "output";
  let dumpValues = false;
  let skipExisting = false;
  let centered = true;
  let native = false;
  let concurrency = 32;
  let format = "webp";
  let from: number | null = null;
  let to: number | null = null;

  const needValue = (flag: string, i: number): string => {
    const v = argv[++i];
    if (v === undefined) throw new Error(`${flag} requires a value`);
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--size") {
      size = parseInt(needValue(a, i++), 10);
      if (!Number.isFinite(size) || size < 16) throw new Error(`invalid --size`);
    } else if (a === "--out") {
      out = needValue(a, i++);
    } else if (a === "--dump-values") {
      dumpValues = true;
    } else if (a === "--skip-existing") {
      skipExisting = true;
    } else if (a === "--no-center" || a === "--top-left") {
      centered = false;
    } else if (a === "--svg") {
      format = "svg";
    } else if (a === "--svg-br") {
      format = "svg-br";
    } else if (a === "--format") {
      format = needValue(a, i++);
    } else if (a === "--native") {
      native = true;
    } else if (a === "--concurrency" || a === "-c") {
      concurrency = Math.max(1, parseInt(needValue(a, i++), 10) || 8);
    } else if (a === "--from") {
      from = parseInt(needValue(a, i++), 10);
    } else if (a === "--to") {
      to = parseInt(needValue(a, i++), 10);
    } else {
      const h = parseInt(a, 10);
      if (!Number.isFinite(h) || h < 0) throw new Error(`invalid block height: ${a}`);
      heights.push(h);
    }
  }

  if (from !== null || to !== null) {
    const start = from ?? 0;
    const end = to ?? start;
    if (end < start) throw new Error(`--to (${end}) < --from (${start})`);
    for (let h = start; h <= end; h++) heights.push(h);
  }

  if (heights.length === 0) {
    console.error("usage: cli <height> [...] | --from N --to N [--size N] [--out DIR] [--dump-values] [--skip-existing]");
    process.exit(1);
  }
  return { heights, size, out, dumpValues, skipExisting, centered, concurrency, native, format };
}

async function renderBlock(height: number, size: number, outDir: string, dumpValues: boolean, centered = true, native = false, format = "webp"): Promise<void> {
  const t0 = Date.now();
  console.log(`block ${height}: fetching /r/block/${height}...`);
  const hex = await fetchRawBlockHex(height);
  console.log(`  fetched ${hex.length / 2} bytes (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  const raw = hexToBytes(hex);
  const { txCount, txValues } = parseRawBlock(raw);
  console.log(`  parsed ${txCount} txs`);

  if (dumpValues) {
    writeFileSync(join(outDir, `${height}.txvalues.json`), JSON.stringify(txValues));
  }

  const { rects, viewBox } = generateMondrianArray(txValues);
  console.log(`  mondrian: ${rects.length} squares, viewBox ${viewBox.join(" ")}`);

  if (format === "svg") {
    const svg = renderSvg(rects, viewBox, { size });
    const outPath = join(outDir, `${height}.svg`);
    writeFileSync(outPath, svg);
    console.log(`  wrote ${outPath} (${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB, static svg ${size}px, ${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
    return;
  }

  if (format === "svg-br") {
    const svg = renderSvg(rects, viewBox, { size });
    const br = brotliCompressSync(Buffer.from(svg), {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    });
    const outPath = join(outDir, `${height}.svg.br`);
    writeFileSync(outPath, br);
    console.log(`  wrote ${outPath} (${(br.length / 1024).toFixed(1)} KB brotli, from ${(Buffer.byteLength(svg) / 1024).toFixed(1)} KB raw, ${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
    return;
  }

  const webp = await renderWebp(rects, viewBox, { size, centered, native });
  const outPath = join(outDir, `${height}.webp`);
  writeFileSync(outPath, webp);
  const mode = native ? "native grid" : "direct";
  console.log(`  wrote ${outPath} (${(webp.length / 1024).toFixed(1)} KB, ${mode}, ${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });

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
      if (args.skipExisting && existsSync(join(args.out, `${h}.webp`))) {
        done++;
        continue;
      }
      try {
        await renderBlock(h, args.size, args.out, args.dumpValues, args.centered, args.native, args.format);
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
