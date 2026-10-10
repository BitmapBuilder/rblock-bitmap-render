/**
 * Browser-safe barrel: everything an app needs to render bitmaps live.
 * No Node APIs, no sharp, no Buffer. Safe to bundle into an inscription.
 */

export { fetchRawBlockHex, hexToBytes } from "./rawBlock.js";
export { parseRawBlock, type BlockTxData } from "./blockParser.js";
export { classifyTransaction, classifyTransactions } from "./txClassifier.js";
export { MondrianLayout, type Slot, type Position } from "./mondrianLayout.js";
export { generateMondrianArray, type MondrianResult } from "./mondrian.js";
export {
  drawBitmapToContext,
  createBitmapCanvas,
  BITMAP_BG,
  BITMAP_FG,
  type Rect,
  type ViewBox,
} from "./canvasRenderer.js";
export {
  encodeBitmapBlob,
  downloadBlob,
  downloadBitmap,
  openBitmapFolder,
  writeBlobToDirectory,
  supportsDirectoryPicker,
  type EncodeOptions,
  type DirectoryPickerHandle,
} from "./saveFile.js";
