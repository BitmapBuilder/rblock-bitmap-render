/**
 * Static SVG writer (standard image SVG — NO script).
 *
 * Emits every square as a real <rect>, sized size - 0.5 (the uniform gap),
 * exactly like the original Bitmap-LENS SVG geometry — minus the embedded
 * drawing script. Renders in any viewer (img tag, marketplace rasterizer,
 * browser) because the shapes are literally in the file.
 *
 * Scale-independent: whoever displays it rasterizes at their own pixel size,
 * so gaps stay visually uniform at any resolution (no re-sampling wobble).
 */

import type { Rect, ViewBox } from "./canvasRenderer.js";

export const SVG_BG = "#1a1a1a";
export const SVG_FG = "orange";

export interface SvgOptions {
  /** Optional background rect (else transparent). */
  background?: string | null;
  /** Intrinsic pixel size (width/height attrs). When set, the SVG opens and
   *  rasterizes at exactly this square size (content centered, like the
   *  raster renderers). When omitted, it's responsive: 100% up to 1024px. */
  size?: number;
}

/** Build the static SVG string for a bitmap. */
export function renderSvg(
  rects: Rect[],
  viewBox: ViewBox,
  opts: SvgOptions = {}
): string {
  const [minX, minY, vbW, vbH] = viewBox;
  const bg = opts.background === undefined ? SVG_BG : opts.background;

  // Square intrinsic size by default matches the raster renderers (which
  // output size x size with centered content). SVG's default
  // preserveAspectRatio (xMidYMid meet) centers automatically.
  const dims =
    opts.size !== undefined
      ? `width="${opts.size}" height="${opts.size}"`
      : `width="100%" height="100%" style="max-width: 1024px;"`;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${vbW} ${vbH}" ${dims}>`
  );
  if (bg) {
    parts.push(`<rect x="${minX}" y="${minY}" width="${vbW}" height="${vbH}" fill="${bg}"/>`);
  }
  for (const [x, y, s] of rects) {
    if (s <= 0) continue;
    const g = s - 0.5;
    parts.push(`<rect x="${x}" y="${y}" width="${g}" height="${g}" fill="${SVG_FG}"/>`);
  }
  parts.push("</svg>");
  return parts.join("");
}
