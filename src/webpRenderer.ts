/**
 * WebP lossless encoder (Node-only, sharp). Server/build-time rendering for
 * writing bitmap files to disk. Browser apps should use canvasRenderer.ts.
 *
 * Rendering contract (identical to canvasRenderer.drawBitmapToContext):
 * - SQUARE output, always
 * - squares are ALWAYS square: uniform -0.5-unit gap on both axes
 * - fit to (longSide - 0.5) so top/bottom are flush; the side margins
 *   remain as the normal, relatively equal centering bands
 */

import sharp from "sharp";
import type { Rect, ViewBox } from "./canvasRenderer.js";

export interface RenderOptions {
  /** Output square pixel size. Default 1024. */
  size?: number;
}

const BG = { r: 0x1a, g: 0x1a, b: 0x1a };
const FG = { r: 0xff, g: 0xa5, b: 0x00 }; // orange

/** Pixel-identical to canvasRenderer.drawBitmapToContext. */
export async function renderWebp(
  rects: Rect[],
  viewBox: ViewBox,
  opts: RenderOptions = {}
): Promise<Buffer> {
  const size = opts.size ?? 1024;
  const [, , vbW, vbH] = viewBox;
  const width = Math.max(1, vbW);
  const height = Math.max(1, vbH);

  const scale = size / (Math.max(width, height) - 0.5);
  const offsetX = Math.floor((size - (width - 0.5) * scale) / 2);
  const offsetY = Math.floor((size - (height - 0.5) * scale) / 2);

  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = BG.r;
    px[i * 4 + 1] = BG.g;
    px[i * 4 + 2] = BG.b;
    px[i * 4 + 3] = 255;
  }

  const gap = 0.5 * scale;

  const fillRect = (x0: number, y0: number, w: number, h: number) => {
    const xi0 = Math.max(0, Math.floor(x0));
    const yi0 = Math.max(0, Math.floor(y0));
    const xi1 = Math.min(size - 1, Math.ceil(x0 + w) - 1);
    const yi1 = Math.min(size - 1, Math.ceil(y0 + h) - 1);
    for (let yy = yi0; yy <= yi1; yy++) {
      let row = (yy * size + xi0) * 4;
      for (let xx = xi0; xx <= xi1; xx++) {
        px[row] = FG.r;
        px[row + 1] = FG.g;
        px[row + 2] = FG.b;
        px[row + 3] = 255;
        row += 4;
      }
    }
  };

  for (const [x, y, s] of rects) {
    if (s <= 0) continue;
    // Squares are ALWAYS square: uniform -0.5 gap on both axes.
    const w = Math.max(1, s * scale - gap);
    fillRect(offsetX + x * scale, offsetY + y * scale, w, w);
  }

  return sharp(px, { raw: { width: size, height: size, channels: 4 } })
    .webp({ lossless: true })
    .toBuffer();
}
