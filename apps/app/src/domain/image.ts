/**
 * Client-side image downscaling (REQUIREMENTS §10). Decodes a picked image and
 * re-encodes two JPEGs: a small THUMB (in-vault BLOB) and a bounded FULL image
 * (encrypted sidecar). Re-encoding normalises odd formats (incl. iPhone HEIC on
 * Safari, which decodes natively) to JPEG and caps the bytes we persist. Fully
 * offline — pure canvas, no network.
 */

export interface ProcessedImage {
  thumb: Uint8Array;
  full: Uint8Array;
  mime: string; // always image/jpeg (we re-encode)
  width: number; // source pixel dimensions
  height: number;
}

export interface ProcessImageOptions {
  thumbMax?: number; // longest-edge px for the grid thumbnail
  fullMax?: number; // longest-edge px for the stored "full" image
}

function scaledDims(w: number, h: number, max: number): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h };
  const s = max / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

async function encodeScaled(
  src: CanvasImageSource,
  sw: number,
  sh: number,
  max: number,
  quality: number,
): Promise<Uint8Array> {
  const { w, h } = scaledDims(sw, sh, max);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(src, 0, 0, w, h);
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image encode failed."))), "image/jpeg", quality),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

async function decodeViaImg(file: Blob): Promise<{ src: HTMLImageElement; sw: number; sh: number; revoke: () => void }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not decode this image (unsupported format?)."));
    img.src = url;
  });
  return { src: img, sw: img.naturalWidth, sh: img.naturalHeight, revoke: () => URL.revokeObjectURL(url) };
}

export async function processImage(file: Blob, opts: ProcessImageOptions = {}): Promise<ProcessedImage> {
  const thumbMax = opts.thumbMax ?? 320;
  const fullMax = opts.fullMax ?? 2048;

  let src: CanvasImageSource;
  let sw: number;
  let sh: number;
  let cleanup: () => void = () => {};

  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      src = bmp;
      sw = bmp.width;
      sh = bmp.height;
      cleanup = () => bmp.close();
    } catch {
      const r = await decodeViaImg(file);
      src = r.src;
      sw = r.sw;
      sh = r.sh;
      cleanup = r.revoke;
    }
  } else {
    const r = await decodeViaImg(file);
    src = r.src;
    sw = r.sw;
    sh = r.sh;
    cleanup = r.revoke;
  }

  try {
    const full = await encodeScaled(src, sw, sh, fullMax, 0.85);
    const thumb = await encodeScaled(src, sw, sh, thumbMax, 0.72);
    return { thumb, full, mime: "image/jpeg", width: sw, height: sh };
  } finally {
    cleanup();
  }
}
