/**
 * WebP lossless encoder (Node-only, sharp). Server/build-time rendering for
 * writing bitmap files to disk. Browser apps should use canvasRenderer.ts.
 */

import sharp from "sharp";
import type { Rect, ViewBox } from "./canvasRenderer.js";

export interface RenderOptions {
  /** Output square pixel size. Default 1024. */
  size?: number;
}

const BG = { r: 0x1a, g: 0x1a, b: 0x1a };
const FG = { r: 0xff, g: 0xa5, b: 0x00 }; // orange

/**
 * Rasterize the Mondrian rect array and encode WebP (lossless).
 * Pixel-identical to canvasRenderer.drawBitmapToContext.
 */
export async function renderWebp(
  rects: Rect[],
  viewBox: ViewBox,
  opts: RenderOptions = {}
): Promise<Buffer> {
  const size = opts.size ?? 1024;
  const [, , vbW, vbH] = viewBox;
  const width = Math.max(1, vbW);
  const height = Math.max(1, vbH);

  // Non-uniform scale like the canvas client (scaleX/scaleY -> min, centered)
  const scale = Math.min(size / width, size / height);
  const offsetX = Math.floor((size - width * scale) / 2);
  const offsetY = Math.floor((size - height * scale) / 2);

  const px = Buffer.alloc(size * size * 4);
  // fill background
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
    // Edge-to-edge: boundary squares render flush; -0.5 gap only BETWEEN squares.
    const w = Math.max(1, s * scale - (x + s >= width ? 0 : gap));
    const h = Math.max(1, s * scale - (y + s >= height ? 0 : gap));
    fillRect(offsetX + x * scale, offsetY + y * scale, w, h);
  }

  return sharp(px, { raw: { width: size, height: size, channels: 4 } })
    .webp({ lossless: true })
    .toBuffer();
}
