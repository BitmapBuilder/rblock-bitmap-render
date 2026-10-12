/**
 * Static SVG writer (standard image SVG — no script).
 *
 * Squares are drawn as dashed stroked lines, one <path> per square size.
 *
 * A square of side s at (x, y) is drawn as a horizontal line of length (s-0.5)
 * whose stroke-width equals (s-0.5), i.e. a stroked segment centred on
 * y + (s-0.5)/2. When a row contains several squares of the SAME size placed
 * shoulder to shoulder, they sit at a fixed stride, so a single segment with
 * stroke-dasharray="(s-0.5) 1" regenerates every square in the run from one
 * "h" command. A single line command can therefore encode dozens of squares.
 *
 * Coordinates are emitted at SCALE = 2. The scale is non-minimal on purpose:
 * it keeps the numbers small, and in dash mode the occasional half unit costs
 * nothing measurable because each run is dominated by its command, not its
 * value.
 *
 * Measured ~80% smaller than the previous single-<path>-per-square encoding,
 * and pixel-identical to it.
 */

import type { Rect, ViewBox } from "./canvasRenderer.js";
import { resolveCentered } from "./canvasRenderer.js";
import { DEFAULT_PARCELS, DEFAULT_GAPS } from "./color.js";

export const SVG_BG = DEFAULT_GAPS;
export const SVG_FG = DEFAULT_PARCELS;

/** Coordinate scale. 2 keeps values small; the dash stride absorbs the halves. */
const SCALE = 2;

export interface SvgOptions {
  /** Optional background rect (else transparent). */
  background?: string | null;
  /** Intrinsic pixel size (width/height attrs). When set, the SVG opens and
   *  rasterizes at exactly this square size. When omitted, it's responsive:
   *  100% up to 1024px. */
  size?: number;
  /** Content alignment within the square: true = centered (default),
   *  false = flush top-left with excess pushed to the right/bottom. */
  centered?: boolean;
  /** Auto alignment: center when the bitmap is clearly non-square, flush
   *  left when it is near-square (kills the thin side sliver). Overrides
   *  `centered` when set. */
  auto?: boolean;
  /** Square color. Default #f7921c. */
  parcels?: string;
  /** Background color. Default #0d0d0d. */
  gaps?: string;
}

/** Build the static SVG string for a bitmap. */
export function renderSvg(
  rects: Rect[],
  viewBox: ViewBox,
  opts: SvgOptions = {}
): string {
  const [, , vbW, vbH] = viewBox;
  const bg = opts.background === undefined ? (opts.gaps ?? SVG_BG) : opts.background;
  const fg = opts.parcels ?? SVG_FG;
  const centered = resolveCentered(opts.centered, opts.auto, vbW, vbH);

  // Square frame at SCALE, matching the raster renderers. The art sits inside
  // it — centered horizontally, or flush left with --no-center — and always
  // flush to the top so no blank band appears above the artwork. The trailing
  // half-unit gap is trimmed exactly as the raster renderers do.
  const contentW = (Math.max(1, vbW) - 0.5) * SCALE;
  const contentH = (Math.max(1, vbH) - 0.5) * SCALE;
  const side = Math.max(contentW, contentH);
  const offX = centered ? (side - contentW) / 2 : 0;
  const offY = 0;

  const dims =
    opts.size !== undefined
      ? `width="${opts.size}" height="${opts.size}"`
      : `width="100%" height="100%" style="max-width: 1024px;"`;

  // Group squares by size, preserving the input order of sizes.
  const bySize = new Map<number, Array<[number, number]>>();
  let squareCount = 0;
  for (const [x, y, s] of rects) {
    if (s <= 0) continue;
    squareCount++;
    let cells = bySize.get(s);
    if (!cells) bySize.set(s, (cells = []));
    cells.push([x, y]);
  }

  const paths: string[] = [];
  for (const [s, cells] of bySize) {
    const w = (s - 0.5) * SCALE;               // stroke width AND dash length
    // Sort by row, then column, so same-row neighbours are consecutive.
    cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

    // Merge consecutive same-row cells that are exactly one stride apart.
    const runs: Array<[number, number, number]> = []; // [xStart, y, xLastStart]
    let i = 0;
    while (i < cells.length) {
      const [x0, y0] = cells[i];
      let xLast = x0;
      let j = i + 1;
      while (j < cells.length && cells[j][1] === y0 && cells[j][0] === xLast + s) {
        xLast = cells[j][0];
        j++;
      }
      runs.push([x0, y0, xLast]);
      i = j;
    }

    // Emit: first run absolute (M), the rest relative (m) to shave bytes.
    const segs: string[] = [];
    let prevX = 0;
    let prevY = 0;
    for (let k = 0; k < runs.length; k++) {
      const [x0, y0, xL] = runs[k];
      const sx = offX + x0 * SCALE;
      const cy = offY + y0 * SCALE + w / 2;
      const len = (xL - x0) * SCALE + w;       // run length in user units
      if (k === 0) {
        segs.push(`M${sx} ${cy}h${len}`);
      } else {
        segs.push(`m${sx - prevX} ${cy - prevY}h${len}`);
      }
      prevX = sx + len;
      prevY = cy;
    }
    paths.push(
      `<path stroke-width="${w}" stroke-dasharray="${w} 1" d="${segs.join("")}"/>`
    );
  }

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" ${dims}>`
  );
  // Number of squares, in the standard SVG metadata slot. Machine-readable
  // and ignored by every renderer.
  parts.push(`<metadata>{"squares":${squareCount}}</metadata>`);
  if (bg) {
    parts.push(`<rect width="${side}" height="${side}" fill="${bg}"/>`);
  }
  parts.push(`<g fill="none" stroke="${fg}">${paths.join("")}</g>`);
  parts.push("</svg>");
  return parts.join("");
}
