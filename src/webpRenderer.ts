/**
 * WebP lossless encoder (Node-only, sharp). Server/build-time rendering for
 * writing bitmap files to disk. Browser apps should use canvasRenderer.ts.
 *
 * Rendering contract (identical to canvasRenderer.drawBitmapToContext):
 * - SQUARE output, always
 * - squares are ALWAYS square: uniform -0.5-unit gap on both axes
 * - fit to (longSide - 0.5) so top/bottom are flush; side bands per `centered`
 *
 * Fidelity at small sizes: when the requested size is below SUPER (the
 * internal supersample resolution), the raster is drawn at SUPER and
 * downscaled with sharp's area-average filter — every gap gets identical
 * sub-pixel treatment (no fat/thin gap wobble). At SUPER itself (and above,
 * up to raw pixel-grid rendering), drawn directly.
 */

import sharp from "sharp";
import type { Rect, ViewBox } from "./canvasRenderer.js";
import { resolveCentered } from "./canvasRenderer.js";
import { parseHexColor, DEFAULT_PARCELS, DEFAULT_GAPS, type RGB } from "./color.js";

export interface RenderOptions {
  /** Output square pixel size. Default 1024. */
  size?: number;
  /** Content alignment: true = centered (default), false = flush top-left
   *  with all excess on the right/bottom. Formatting only, no algorithm change. */
  centered?: boolean;
  /** Auto alignment: center when the bitmap is clearly non-square, flush
   *  left when it is near-square. Overrides `centered` when set. */
  auto?: boolean;
  /** Internal supersample resolution. Sizes below this render at SUPER then
   *  downscale. Default 1024. Set equal to `size` to force direct rendering. */
  superResolution?: number;
  /** Opt-in: draw at superResolution then downscale for smoother gap
   *  placement. Off by default — direct rendering is clean, 2-color and tiny.
   *  Supersampling costs file size (blended edges) or speckle (snapped). */
  supersample?: boolean;
  /** NATIVE PIXEL GRID: pick an EVEN-INTEGER pixels-per-unit scale so every
   *  square edge lands on a whole pixel — every gap is exactly S/2 px, every
   *  square exactly n*S px, two colors only, no fractional wobble, no
   *  supersampling. `size` becomes the approximate target; actual output is
   *  the closest natural multiple of the viewBox. */
  native?: boolean;
  /** Square color (hex). Default #f7921c. */
  parcels?: string;
  /** Background color (hex). Default #0d0d0d. */
  gaps?: string;
}

/** Internal render resolution for supersampling. */
const SUPER = 1024;

/** Rasterize the rect array into an RGBA buffer at directSize px.
 *  If scaleUnits is provided (native mode), use it directly as px/unit — 
 *  it must be an even integer so all edges land on whole pixels. */
function rasterize(
  rects: Rect[],
  viewBox: ViewBox,
  directSize: number,
  centered: boolean,
  fg: RGB,
  bg: RGB,
  scaleUnits?: number
): { px: Buffer; size: number } {
  const size = directSize;
  const [, , vbW, vbH] = viewBox;
  const width = Math.max(1, vbW);
  const height = Math.max(1, vbH);

  const scale =
    scaleUnits !== undefined
      ? scaleUnits
      : size / (Math.max(width, height) - 0.5);
  // Horizontal: centered or flush left. Vertical: always flush to the top,
  // so the artwork never starts with a blank band above it — any vertical
  // slack from non-square content falls below the image.
  const offsetX = centered
    ? Math.floor((size - (width - 0.5) * scale) / 2)
    : 0;
  const offsetY = 0;

  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = bg.r;
    px[i * 4 + 1] = bg.g;
    px[i * 4 + 2] = bg.b;
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
        px[row] = fg.r;
        px[row + 1] = fg.g;
        px[row + 2] = fg.b;
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

  return { px, size };
}

/** Pixel-identical to canvasRenderer.drawBitmapToContext (direct path). */
export async function renderWebp(
  rects: Rect[],
  viewBox: ViewBox,
  opts: RenderOptions = {}
): Promise<Buffer> {
  const outSize = opts.size ?? 1024;
  const centered = resolveCentered(opts.centered, opts.auto, viewBox[2], viewBox[3]);
  const fg = parseHexColor(opts.parcels ?? DEFAULT_PARCELS);
  const bg = parseHexColor(opts.gaps ?? DEFAULT_GAPS);

  if (opts.native) {
    // NATIVE PIXEL GRID: even-integer px/unit scale so every square edge
    // lands on a whole pixel, every gap is exactly s/2 px, two colors only.
    const [, , vbW, vbH] = viewBox;
    const trimmedLong = Math.max(Math.max(1, vbW), Math.max(1, vbH)) - 0.5;
    let s = Math.max(2, Math.round(outSize / trimmedLong));
    if (s % 2 !== 0) s += 1; // force even: gap = s/2 stays whole-pixel
    const nativeW = Math.round((Math.max(1, vbW) - 0.5) * s);
    const nativeH = Math.round((Math.max(1, vbH) - 0.5) * s);
    const side = Math.max(nativeW, nativeH);
    const raster = rasterize(rects, viewBox, side, centered, fg, bg, s);
    return sharp(raster.px, {
      raw: { width: raster.size, height: raster.size, channels: 4 },
    })
      .webp({ lossless: true })
      .toBuffer();
  }

  // Direct render is the default for every size: 2-color, clean, tiny.
  // Supersampling is opt-in (opts.supersample).
  if (opts.supersample) {
    const superRes = opts.superResolution ?? SUPER;
    const raster = rasterize(rects, viewBox, superRes, centered, fg, bg);
    const down = await sharp(raster.px, {
      raw: { width: raster.size, height: raster.size, channels: 4 },
    })
      .resize(outSize, outSize, { kernel: "lanczos3" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = down;
    const n = info.width * info.height;
    for (let i = 0; i < n; i++) {
      const o = i * info.channels;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      const dFg = (r - fg.r) ** 2 + (g - fg.g) ** 2 + (b - fg.b) ** 2;
      const dBg = (r - bg.r) ** 2 + (g - bg.g) ** 2 + (b - bg.b) ** 2;
      const isFg = dFg <= dBg;
      data[o] = isFg ? fg.r : bg.r;
      data[o + 1] = isFg ? fg.g : bg.g;
      data[o + 2] = isFg ? fg.b : bg.b;
    }

    return sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    })
      .webp({ lossless: true })
      .toBuffer();
  }

  const raster = rasterize(rects, viewBox, outSize, centered, fg, bg);
  return sharp(raster.px, {
    raw: { width: raster.size, height: raster.size, channels: 4 },
  })
    .webp({ lossless: true })
    .toBuffer();
}
