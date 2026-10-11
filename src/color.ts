/**
 * Color parsing shared by all renderers.
 *
 * Accepts "#rgb", "#rrggbb", or the same without the leading "#". Returns
 * 0-255 channels. Parsed once at startup (from CLI flags); the resulting
 * object is reused for every block — no per-iteration cost.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function parseHexColor(input: string): RGB {
  let h = input.trim();
  if (h.startsWith("#")) h = h.slice(1);

  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`invalid hex color: "${input}" (expected #rrggbb)`);
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** "rgb(r,g,b)" from a hex string, for CSS contexts. */
export function hexToCss(input: string): string {
  const { r, g, b } = parseHexColor(input);
  return `rgb(${r},${g},${b})`;
}

export const DEFAULT_PARCELS = "#f7921c"; // orange squares
export const DEFAULT_GAPS = "#0d0d0d";    // background
