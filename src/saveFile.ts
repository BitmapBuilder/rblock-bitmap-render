/**
 * Browser-side file export: render a bitmap and save it as an image file.
 *
 * For an app whose objective is "generate in browser, user downloads the
 * file" — canvas here is only the encoding surface, nothing is displayed.
 *
 * Format truth (browsers, 2025+):
 * - image/png via canvas.toBlob: LOSSLESS, guaranteed everywhere. Default.
 * - image/webp via canvas.toBlob: always LOSSY internally (quality 1.0 is
 *   best-quality lossy, not lossless). Fine for previews, not archival.
 * - True lossless WebP requires Node + sharp (./node export) or a wasm
 *   encoder.
 *
 * For bulk saving (thousands of files, no per-file dialog) use
 * openBitmapFolder() + writeBlobToDirectory() — File System Access API
 * (Chromium). Falls back to per-file download otherwise.
 */

import { createBitmapCanvas, type Rect, type ViewBox } from "./canvasRenderer.js";

export interface EncodeOptions {
  /** Output square pixel size. Default 1024. */
  size?: number;
  /** MIME type. "image/png" (lossless, default) or "image/webp" (lossy). */
  mime?: string;
  /** Encoder quality 0..1 (webp/jpeg only). Default 1.0. */
  quality?: number;
}

/** Render a bitmap and encode it as a Blob (file contents). */
export async function encodeBitmapBlob(
  rects: Rect[],
  viewBox: ViewBox,
  opts: EncodeOptions = {}
): Promise<Blob> {
  const { size = 1024, mime = "image/png", quality = 1.0 } = opts;
  const canvas = createBitmapCanvas(rects, viewBox, size);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`toBlob failed for ${mime}`))),
      mime,
      quality
    );
  });
}

/** Trigger a single-file browser download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Convenience: render + download in one call. */
export async function downloadBitmap(
  height: number,
  rects: Rect[],
  viewBox: ViewBox,
  opts: EncodeOptions = {}
): Promise<void> {
  const mime = opts.mime ?? "image/png";
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "img";
  const blob = await encodeBitmapBlob(rects, viewBox, opts);
  downloadBlob(blob, `${height}.${ext}`);
}

/** Minimal File System Access API typings (not in TS lib.dom for older targets). */
export interface DirectoryPickerHandle {
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    createWritable(): Promise<{
      write(data: Blob): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
}

interface DirectoryPickerWindow {
  showDirectoryPicker?(opts?: { mode?: "read" | "readwrite" }): Promise<DirectoryPickerHandle>;
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Ask the user to pick an output folder once (Chromium). Returns a handle
 * for writing many files without further dialogs. Returns null when the
 * API is unavailable — caller should fall back to per-file downloads.
 */
export async function openBitmapFolder(): Promise<DirectoryPickerHandle | null> {
  const w = window as unknown as DirectoryPickerWindow;
  if (!w.showDirectoryPicker) return null;
  try {
    return await w.showDirectoryPicker({ mode: "readwrite" });
  } catch {
    return null; // user cancelled
  }
}

/** Write one file into a previously opened folder. */
export async function writeBlobToDirectory(
  dir: DirectoryPickerHandle,
  filename: string,
  blob: Blob
): Promise<void> {
  const fh = await dir.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}
