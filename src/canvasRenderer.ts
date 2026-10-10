/**
 * Canvas renderer — browser-safe. Draws the Mondrian rect array onto a
 * 2D canvas with the exact Bitmap rendering contract:
 *
 * - background #1a1a1a
 * - orange (#ffa500) squares
 * - each square size*scale - 0.5*scale wide (the SVG gap logic), min 1px
 *
 * Mirrors the Netlify CanvasPatternRenderer and the Node WebP renderer
 * pixel-for-pixel.
 */

export type Rect = [x: number, y: number, size: number];
export type ViewBox = [minX: number, minY: number, width: number, height: number];

export const BITMAP_BG = "#1a1a1a";
export const BITMAP_FG = "#ffa500";

/** Draw a bitmap into an existing 2D context (canvas of `size` x `size` px). */
export function drawBitmapToContext(
  ctx: CanvasRenderingContext2D,
  rects: Rect[],
  viewBox: ViewBox,
  size: number
): void {
  const [, , vbW, vbH] = viewBox;
  const width = Math.max(1, vbW);
  const height = Math.max(1, vbH);

  const scale = Math.min(size / width, size / height);
  const offsetX = Math.floor((size - width * scale) / 2);
  const offsetY = Math.floor((size - height * scale) / 2);
  const gap = 0.5 * scale;

  ctx.fillStyle = BITMAP_BG;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = BITMAP_FG;
  for (const [x, y, s] of rects) {
    if (s <= 0) continue;
    // Edge-to-edge: boundary squares render flush; -0.5 gap only BETWEEN squares.
    const w = Math.max(1, s * scale - (x + s >= vbW ? 0 : gap));
    const h = Math.max(1, s * scale - (y + s >= vbH ? 0 : gap));
    ctx.fillRect(offsetX + x * scale, offsetY + y * scale, w, h);
  }
}

/** Create a standalone canvas element with the bitmap rendered at `size` px. */
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
