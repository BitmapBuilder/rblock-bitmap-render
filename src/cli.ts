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
import { join } from "node:path";
import { fetchRawBlockHex, hexToBytes } from "./rawBlock.js";
import { parseRawBlock } from "./blockParser.js";
import { generateMondrianArray } from "./mondrian.js";
import { renderWebp } from "./webpRenderer.js";

interface Args {
  heights: number[];
  size: number;
  out: string;
  dumpValues: boolean;
  skipExisting: boolean;
  centered: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const heights: number[] = [];
  let size = 1024;
  let out = "output";
  let dumpValues = false;
  let skipExisting = false;
  let centered = true;
  let concurrency = 8;
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
  return { heights, size, out, dumpValues, skipExisting, centered, concurrency };
}

async function renderBlock(height: number, size: number, outDir: string, dumpValues: boolean, centered = true): Promise<void> {
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

  const webp = await renderWebp(rects, viewBox, { size, centered });
  const outPath = join(outDir, `${height}.webp`);
  writeFileSync(outPath, webp);
  console.log(`  wrote ${outPath} (${(webp.length / 1024).toFixed(1)} KB, ${size}px, ${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
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
        await renderBlock(h, args.size, args.out, args.dumpValues, args.centered);
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
