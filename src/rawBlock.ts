/**
 * Fetch a full raw Bitcoin block (hex) from the ordinals.com recursive endpoint.
 *
 * GET https://ordinals.com/r/block/{height} -> JSON string containing the
 * complete raw block bytes as hex (header + all transactions).
 *
 * Browser-safe: uses global fetch, no Node APIs. Same-origin when called from
 * an inscription on ordinals.com (CSP default-src 'self' allows it).
 */

const ORDINALS_R_BLOCK = "https://ordinals.com/r/block/";

export async function fetchRawBlockHex(height: number): Promise<string> {
  const res = await fetch(`${ORDINALS_R_BLOCK}${height}`, {
    headers: { "User-Agent": "rblock-bitmap-render/0.2" },
  });
  if (!res.ok) {
    throw new Error(`/r/block/${height} responded ${res.status}`);
  }
  const body = await res.text();
  // Body is a JSON document: a quoted hex string ("0080ee25...")
  const parsed = JSON.parse(body);
  if (typeof parsed !== "string") {
    throw new Error(`/r/block/${height}: expected JSON hex string, got ${typeof parsed}`);
  }
  return parsed;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("hex string has odd length");
  // Fast path: Node Buffer (C++ hex decoder)
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(hex, "hex"));
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
