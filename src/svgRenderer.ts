/**
 * Static SVG writer (standard image SVG — no script).
 *
 * All squares are emitted as a single <path> of relative move-and-rect
 * subpaths (M x y h w v w h -w z). This is geometrically identical to one
 * <rect> per square but far smaller: a 3,700-square block that was ~228 KB as
 * rect elements is ~80 KB as path data (and compresses better too).
 *
 * The half-unit gap is preserved (each square is drawn size - 0.5), matching
 * the raster renderers exactly.
 */

import type { Rect, ViewBox } from "./canvasRenderer.js";
import { DEFAULT_PARCELS, DEFAULT_GAPS } from "./color.js";

export const SVG_BG = DEFAULT_GAPS;
export const SVG_FG = DEFAULT_PARCELS;

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
  /** Square color (hex). Default #ffa500. */
  parcels?: string;
  /** Background color (hex). Default #1a1a1a. */
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
  const centered = opts.centered !== false;

  // Square frame, matching the raster renderers. The art sits inside it —
  // centered, or flush top-left with --no-center — and the background covers
  // the whole square. The trailing half-unit gap is trimmed as the rasters do.
  const contentW = Math.max(1, vbW) - 0.5;
  const contentH = Math.max(1, vbH) - 0.5;
  const side = Math.max(contentW, contentH);
  // Horizontal: centered or flush left. Vertical: always flush to the top,
  // so the artwork never starts with a blank band above it.
  const offX = centered ? (side - contentW) / 2 : 0;
  const offY = 0;

  const dims =
    opts.size !== undefined
      ? `width="${opts.size}" height="${opts.size}"`
      : `width="100%" height="100%" style="max-width: 1024px;"`;

  // All squares as one path: relative h/v commands, no separator waste.
  const d: string[] = [];
  for (const [x, y, s] of rects) {
    if (s <= 0) continue;
    const g = s - 0.5;
    d.push(`M${offX + x} ${offY + y}h${g}v${g}h${-g}z`);
  }

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" ${dims}>`
  );
  if (bg) {
    parts.push(`<rect width="${side}" height="${side}" fill="${bg}"/>`);
  }
  parts.push(`<path fill="${fg}" d="${d.join("")}"/>`);
  parts.push("</svg>");
  return parts.join("");
}
