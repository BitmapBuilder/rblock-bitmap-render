/**
 * Mondrian array generator — port of Bitmap-LENS-BLK
 * bitmap_svg/generate_mondrian_array.py (TX Amount path).
 */

import { classifyTransactions } from "./txClassifier.js";
import { MondrianLayout, type Slot } from "./mondrianLayout.js";

export interface MondrianResult {
  /** Integer square triplets [x, y, size] — the drawing contract. */
  rects: Array<[number, number, number]>;
  slots: Slot[];
  viewBox: [number, number, number, number];
}

export function generateMondrianArray(txValues: number[]): MondrianResult {
  const classified = classifyTransactions(txValues);

  const blockWeight = classified.reduce((acc, size) => acc + size * size, 0);
  const calculatedWidth = Math.ceil(Math.sqrt(blockWeight));

  const mondrian = new MondrianLayout(calculatedWidth, calculatedWidth);

  const slots: Slot[] = [];
  for (const size of classified) {
    slots.push(mondrian.place(size));
  }

  let maxX = 0;
  let maxY = 0;
  const rects: Array<[number, number, number]> = [];
  for (const slot of slots) {
    const x = Math.floor(slot.position?.x ?? 0);
    const y = Math.floor(slot.position?.y ?? 0);
    const size = Math.floor(slot.r ?? 0);
    rects.push([x, y, size]);
    maxX = Math.max(maxX, x + size);
    maxY = Math.max(maxY, y + size);
  }

  return { rects, slots, viewBox: [0, 0, maxX, maxY] };
}
