/**
 * Canvas renderer — browser-safe. Draws the Mondrian rect array onto a
 * 2D canvas with the exact Bitmap rendering contract:
 *
 * - SQUARE output canvas, always
 * - background #1a1a1a, orange (#ffa500) squares
 * - every square drawn with a uniform -0.5-unit gap on both axes
 *   (squares are ALWAYS square — no boundary stretching)
 * - the trailing 0.5-unit gap is trimmed by fitting to (longSide - 0.5),
 *   so top/bottom land flush; the small side margins remain as the
 *   normal centering bands for non-square content
 */

export type Rect = [x: number, y: number, size: number];
export type ViewBox = [minX: number, minY: number, width: number, height: number];

export const BITMAP_BG = "#1a1a1a";
export const BITMAP_FG = "#ffa500";

/** Draw a bitmap into an existing 2D context (square canvas of `size` px). */
export function drawBitmapToContext(
  ctx: CanvasRenderingContext2D,
  rects: Rect[],
  viewBox: ViewBox,
  size = 1024
): void {
  const [, , vbW, vbH] = viewBox;
  const width = Math.max(1, vbW);
  const height = Math.max(1, vbH);

  // Uniform scale fit to the gap-trimmed longer side: never distorts
  // squares, makes top/bottom flush, keeps equal centering bands on the
  // sides for non-square content.
  const scale = size / (Math.max(width, height) - 0.5);
  const offsetX = Math.floor((size - (width - 0.5) * scale) / 2);
  const offsetY = Math.floor((size - (height - 0.5) * scale) / 2);
  const gap = 0.5 * scale;

  ctx.fillStyle = BITMAP_BG;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = BITMAP_FG;
  for (const [x, y, s] of rects) {
    if (s <= 0) continue;
    // Squares are ALWAYS square: uniform -0.5 gap on both axes.
    const w = Math.max(1, s * scale - gap);
    ctx.fillRect(offsetX + x * scale, offsetY + y * scale, w, w);
  }
}

/** Square canvas dimensions for a bitmap (always size x size). */
export function bitmapCanvasSize(
  _viewBox: ViewBox,
  size = 1024
): { width: number; height: number } {
  return { width: size, height: size };
}

/** Create a standalone square canvas element with the bitmap rendered. */
export function createBitmapCanvas(
  rects: Rect[],
  viewBox: ViewBox,
  size = 1024
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  drawBitmapToContext(ctx, rects, viewBox, size);
  return canvas;
}
