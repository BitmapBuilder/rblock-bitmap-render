/**
 * Transaction classifier — direct port of Bitmap-LENS-BLK bitmap_svg/tx_classifier.py
 * Maps a tx amount (BTC) to an anatomy square size 1-10.
 */

const THRESHOLDS = [0.01, 0.1, 1, 10, 100, 1000, 10000, 100000, 1000000];

export function classifyTransaction(amount: number): number {
  for (let idx = 0; idx < THRESHOLDS.length; idx++) {
    if (amount <= THRESHOLDS[idx]) {
      return idx + 1;
    }
  }
  return 10;
}

export function classifyTransactions(txValues: number[]): number[] {
  return txValues.map(classifyTransaction);
}
