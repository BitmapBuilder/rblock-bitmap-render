/**
 * Canvas renderer — browser-safe. Renders a bitmap's rect array onto a 2D
 * canvas. This is the in-browser counterpart of webpRenderer (Node); both
 * produce identical pixels for the same inputs.
 *
 * Rendering contract:
 * - SQUARE output canvas, always
 * - dark background with orange squares
 * - every square drawn with a uniform half-unit gap on both axes, so squares
 *   stay perfectly square (no boundary stretching)
 * - scaled to the gap-trimmed longer side: the flush axis is edge-to-edge,
 *   and any remainder becomes a symmetric margin on the other axis
 */

export type Rect = [x: number, y: number, size: number];
export type ViewBox = [minX: number, minY: number, width: number, height: number];

export const BITMAP_BG = "#0d0d0d";
export const BITMAP_FG = "#f7921c";

export interface DrawOptions {
  size?: number;
  /** Content alignment when it doesn't fill the square: true = centered
   *  (default, relatively equal bands), false = flush top-left, all
   *  excess pushed to right/bottom. */
  centered?: boolean;
  /** Square color (hex). Default #f7921c. */
  parcels?: string;
  /** Background color (hex). Default #0d0d0d. */
  gaps?: string;
}

/** Draw a bitmap into an existing 2D context (square canvas of `size` px). */
export function drawBitmapToContext(
  ctx: CanvasRenderingContext2D,
  rects: Rect[],
  viewBox: ViewBox,
  sizeOrOpts: number | DrawOptions = 1024
): void {
  const opts: DrawOptions =
    typeof sizeOrOpts === "number" ? { size: sizeOrOpts } : sizeOrOpts;
  const size = opts.size ?? 1024;
  const centered = opts.centered ?? true;
  const bg = opts.gaps ?? BITMAP_BG;
  const fg = opts.parcels ?? BITMAP_FG;
  const [, , vbW, vbH] = viewBox;
  const width = Math.max(1, vbW);
  const height = Math.max(1, vbH);

  // Uniform scale fit to the gap-trimmed longer side: never distorts
  // squares, makes the flush axes edge-to-edge, keeps the remainder as
  // bands on the other side (centered) or right/bottom (top-left aligned).
  const scale = size / (Math.max(width, height) - 0.5);
  const offsetX = centered
    ? Math.floor((size - (width - 0.5) * scale) / 2)
    : 0;
  const offsetY = centered
    ? Math.floor((size - (height - 0.5) * scale) / 2)
    : 0;
  const gap = 0.5 * scale;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = fg;
  for (const [x, y, s] of rects) {
    if (s <= 0) continue;
    // Squares are ALWAYS square: uniform -0.5 gap on both axes.
    const w = Math.max(1, s * scale - gap);
    ctx.fillRect(offsetX + x * scale, offsetY + y * scale, w, w);
  }
}

/** Create a standalone square canvas element with the bitmap rendered. */
export function createBitmapCanvas(
  rects: Rect[],
  viewBox: ViewBox,
  sizeOrOpts: number | DrawOptions = 1024
): HTMLCanvasElement {
  const opts: DrawOptions =
    typeof sizeOrOpts === "number" ? { size: sizeOrOpts } : sizeOrOpts;
  const size = opts.size ?? 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  drawBitmapToContext(ctx, rects, viewBox, opts);
  return canvas;
}
