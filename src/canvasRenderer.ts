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

/**
 * Aspect-ratio threshold for auto alignment. Below this, the leftover band is
 * a thin sliver and the content is flushed left (no visible left line); at or
 * above it the content is centered (a deliberate-looking frame).
 */
export const AUTO_ALIGN_RATIO = 1.05;

/**
 * Resolve the alignment for a bitmap.
 * - `auto` given: center when the viewBox aspect ratio >= AUTO_ALIGN_RATIO,
 *   otherwise flush left. (Near-square bitmaps get no sliver; clearly
 *   non-square ones keep the symmetric frame.)
 * - otherwise: centered unless `centered` is explicitly false.
 */
export function resolveCentered(
  centered: boolean | undefined,
  auto: boolean | undefined,
  vbW: number,
  vbH: number
): boolean {
  if (auto) {
    const w = Math.max(1, vbW);
    const h = Math.max(1, vbH);
    const ratio = Math.max(w, h) / Math.min(w, h);
    return ratio >= AUTO_ALIGN_RATIO;
  }
  return centered !== false;
}

export interface DrawOptions {
  size?: number;
  /** Content alignment when it doesn't fill the square: true = centered
   *  (default, relatively equal bands), false = flush top-left, all
   *  excess pushed to right/bottom. */
  centered?: boolean;
  /** Auto alignment: center when the bitmap is clearly non-square, flush
   *  left when it is near-square (kills the thin side sliver). Overrides
   *  `centered` when set. */
  auto?: boolean;
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
  const bg = opts.gaps ?? BITMAP_BG;
  const fg = opts.parcels ?? BITMAP_FG;
  const [, , vbW, vbH] = viewBox;
  const width = Math.max(1, vbW);
  const height = Math.max(1, vbH);
  const centered = resolveCentered(opts.centered, opts.auto, vbW, vbH);

  // Uniform scale fit to the gap-trimmed longer side: never distorts
  // squares, makes the flush axes edge-to-edge, keeps the remainder as
  // bands on the other side (centered) or right/bottom (top-left aligned).
  const scale = size / (Math.max(width, height) - 0.5);
  // Horizontal: centered or flush left. Vertical: always flush to the top,
  // so the artwork never starts with a blank band above it.
  const offsetX = centered
    ? Math.floor((size - (width - 0.5) * scale) / 2)
    : 0;
  const offsetY = 0;
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
