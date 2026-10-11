/**
 * Minimal Bitcoin raw block parser. Browser-safe: Uint8Array/DataView only.
 *
 * Parses the serialized block format directly (no libraries):
 *   [80-byte header][varint txCount][tx]...
 *
 * Each transaction:
 *   [version:4]
 *   [marker:1=0x00][flag:1=0x01]        (only for segwit)
 *   [varint inputCount]
 *     per input: [prevTxid:32][vout:4][varint scriptLen][script][sequence:4]
 *   [varint outputCount]
 *     per output: [value:8 LE][varint scriptLen][script]
 *   (if segwit: per input [varint itemCount][varint len][item]...)
 *   [locktime:4]
 *
 * Extracts what the bitmap pipeline needs from each block:
 *   txValues[i] = sum of all output values of tx i, in BTC (float)
 */

export interface BlockTxData {
  txCount: number;
  /** Per-tx sum of output values, in BTC. */
  txValues: number[];
}

class Reader {
  off = 0;
  private readonly view: DataView;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private need(n: number): void {
    if (this.off + n > this.buf.length) {
      throw new Error(
        `block truncated: need ${n} bytes at offset ${this.off}, have ${this.buf.length - this.off}`
      );
    }
  }

  u8(): number {
    this.need(1);
    return this.buf[this.off++];
  }

  u32LE(): number {
    this.need(4);
    const v = this.view.getUint32(this.off, true);
    this.off += 4;
    return v;
  }

  u64LE(): bigint {
    this.need(8);
    const v = this.view.getBigUint64(this.off, true);
    this.off += 8;
    return v;
  }

  skip(n: number): void {
    this.need(n);
    this.off += n;
  }

  /** Bitcoin CompactSize varint. Returns value as number (safe: scripts < 4GB, counts small). */
  varint(): number {
    const first = this.u8();
    if (first < 0xfd) return first;
    if (first === 0xfd) return this.u16LE();
    if (first === 0xfe) return this.u32LE();
    return Number(this.u64LE());
  }

  private u16LE(): number {
    this.need(2);
    const v = this.view.getUint16(this.off, true);
    this.off += 2;
    return v;
  }
}

export function parseRawBlock(buf: Uint8Array): BlockTxData {
  const r = new Reader(buf);

  // Header: version(4) prevHash(32) merkleRoot(32) time(4) bits(4) nonce(4)
  r.skip(80);

  const txCount = r.varint();
  const txValues: number[] = new Array(txCount);

  for (let t = 0; t < txCount; t++) {
    // version
    r.skip(4);

    // segwit marker+flag
    let segwit = false;
    if (r.u8() === 0x00) {
      const flag = r.u8();
      if (flag !== 0x01) throw new Error(`tx ${t}: invalid segwit flag ${flag}`);
      segwit = true;
    } else {
      r.off -= 1; // was the input count, not a marker
    }

    // inputs
    const inCount = r.varint();
    for (let i = 0; i < inCount; i++) {
      r.skip(32 + 4); // prev txid + vout
      r.skip(r.varint()); // scriptSig
      r.skip(4); // sequence
    }

    // outputs -> value sum
    const outCount = r.varint();
    let sumSats = 0n;
    for (let o = 0; o < outCount; o++) {
      sumSats += r.u64LE();
      r.skip(r.varint()); // pubkeyScript
    }
    txValues[t] = Number(sumSats) / 1e8;

    // witness
    if (segwit) {
      for (let i = 0; i < inCount; i++) {
        const items = r.varint();
        for (let w = 0; w < items; w++) {
          r.skip(r.varint());
        }
      }
    }

    // locktime
    r.skip(4);
  }

  return { txCount, txValues };
}
