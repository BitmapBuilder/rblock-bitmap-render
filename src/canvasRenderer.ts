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

/** Draw a bitmap into an existing 2D context sized via bitmapCanvasSize(). */
export function drawBitmapToContext(
  ctx: CanvasRenderingContext2D,
  rects: Rect[],
  viewBox: ViewBox
): void {
  const [, , vbW, vbH] = viewBox;
  const width = Math.max(1, vbW);
  const height = Math.max(1, vbH);

  // Uniform scale, never distorts squares. With a canvas sized by
  // bitmapCanvasSize() the offsets are 0 and the art is flush on all edges.
  const scale = Math.min(
    ctx.canvas.width / (width - 0.5),
    ctx.canvas.height / (height - 0.5)
  );
  const offsetX = (ctx.canvas.width - (width - 0.5) * scale) / 2;
  const offsetY = (ctx.canvas.height - (height - 0.5) * scale) / 2;
  const gap = 0.5 * scale;

  ctx.fillStyle = BITMAP_BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = BITMAP_FG;
  for (const [x, y, s] of rects) {
    if (s <= 0) continue;
    // Squares are ALWAYS square: uniform -0.5 gap on both axes.
    const w = Math.max(1, s * scale - gap);
    ctx.fillRect(offsetX + x * scale, offsetY + y * scale, w, w);
  }
}

/**
 * Exact canvas dimensions for a bitmap: content aspect ratio (like the
 * original SVG's width=100% height=auto), with the trailing 0.5-unit gap
 * removed so the art is flush on all four edges. `longSide` caps the
 * longer dimension.
 */
export function bitmapCanvasSize(
  viewBox: ViewBox,
  longSide = 1024
): { width: number; height: number } {
  const [, , vbW, vbH] = viewBox;
  const width = Math.max(1, vbW);
  const height = Math.max(1, vbH);
  const scale = longSide / Math.max(width, height);
  return {
    width: Math.max(1, Math.round((width - 0.5) * scale)),
    height: Math.max(1, Math.round((height - 0.5) * scale)),
  };
}

/** Create a standalone canvas element with the bitmap rendered (content-aspect). */
export function createBitmapCanvas(
  rects: Rect[],
  viewBox: ViewBox,
  longSide = 1024
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const { width, height } = bitmapCanvasSize(viewBox, longSide);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  drawBitmapToContext(ctx, rects, viewBox);
  return canvas;
}
