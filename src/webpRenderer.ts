/**
 * WebP lossless encoder (Node-only, sharp). Server/build-time rendering for
 * writing bitmap files to disk. Browser apps should use canvasRenderer.ts.
 *
 * Output dimensions follow the content's true aspect ratio (like the
 * original SVG's width=100% height=auto): the trailing 0.5-unit gap is
 * trimmed so the art is flush on all four edges, and every square stays
 * perfectly square — uniform -0.5 gap on both axes, no boundary stretching.
 */

import sharp from "sharp";
import type { Rect, ViewBox } from "./canvasRenderer.js";

export interface RenderOptions {
  /** Longer output side in pixels. Default 1024. */
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
  const longSide = opts.size ?? 1024;
  const [, , vbW, vbH] = viewBox;
  const width = Math.max(1, vbW);
  const height = Math.max(1, vbH);

  // uniform scale, flush edges, trailing 0.5-unit gap trimmed
  const scale = longSide / Math.max(width, height);
  const outW = Math.max(1, Math.round((width - 0.5) * scale));
  const outH = Math.max(1, Math.round((height - 0.5) * scale));

  const px = Buffer.alloc(outW * outH * 4);
  for (let i = 0; i < outW * outH; i++) {
    px[i * 4] = BG.r;
    px[i * 4 + 1] = BG.g;
    px[i * 4 + 2] = BG.b;
    px[i * 4 + 3] = 255;
  }

  const gap = 0.5 * scale;

  const fillRect = (x0: number, y0: number, w: number, h: number) => {
    const xi0 = Math.max(0, Math.floor(x0));
    const yi0 = Math.max(0, Math.floor(y0));
    const xi1 = Math.min(outW - 1, Math.ceil(x0 + w) - 1);
    const yi1 = Math.min(outH - 1, Math.ceil(y0 + h) - 1);
    for (let yy = yi0; yy <= yi1; yy++) {
      let row = (yy * outW + xi0) * 4;
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
    fillRect(x * scale, y * scale, w, w);
  }

  return sharp(px, { raw: { width: outW, height: outH, channels: 4 } })
    .webp({ lossless: true })
    .toBuffer();
}
