// Preparing a picked photo for upload. Every image endpoint here takes base64
// inside a JSON body, and the reference-image path posts each picture TWICE
// (/referenceimages, then the mirrored /thumbnails slot), so a raw phone capture
// — 4-15 MB before base64 adds a third on top — is re-encoded before it goes
// anywhere near the network.

// Longest edge kept. The detail carousel paints well under 1000px, so this leaves
// room to zoom in without carrying a 50MP sensor's full output around.
export const MAX_IMAGE_EDGE = 1600;
export const IMAGE_JPEG_QUALITY = 0.85;
// Already-small files pass through untouched: re-encoding a PNG scan or a
// screenshot as JPEG trades text sharpness for nothing.
export const IMAGE_PASSTHROUGH_BYTES = 512 * 1024;

// HEIC/HEIF containers are ISO base media files: bytes 4-8 are `ftyp` and 8-12
// are the brand. Chrome decodes none of these on any platform and Safari decodes
// them all, which is exactly why a HEIC photo uploads from an iPhone and fails on
// Android. Refusing it with a reason beats storing something nothing can open.
const HEIF_BRANDS = new Set([
  "heic", "heix", "heim", "heis",
  "hevc", "hevx", "hevm", "hevs",
  "mif1", "msf1",
]);

export function isHeifBytes(bytes) {
  if (!bytes || bytes.length < 12) return false;
  const ascii = (start, end) =>
    String.fromCharCode(...Array.from(bytes.slice(start, end)));
  if (ascii(4, 8) !== "ftyp") return false;
  return HEIF_BRANDS.has(ascii(8, 12).toLowerCase());
}

// Name/type fallback: some Android providers hand over a File with an empty
// `type`, and the magic-byte read can itself fail on a revoked content URI.
export function isHeifName(name = "", type = "") {
  return /\.hei[cf]$/i.test(String(name)) || /^image\/hei[cf]/i.test(String(type));
}

// Box the image into `maxEdge` on its longest side, keeping the aspect ratio.
// Never returns a zero dimension — a canvas sized 0 throws on toDataURL.
export function fitWithin(width, height, maxEdge = MAX_IMAGE_EDGE) {
  const longest = Math.max(width || 0, height || 0);
  if (!longest || longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// The stored image_name is what the gallery captions, so a re-encoded picture
// must not still claim to be the .png or .heic it arrived as.
export function jpegName(name) {
  const base = String(name || "").replace(/\.[^.\s/\\]{1,10}$/, "");
  return `${base.trim() || "image"}.jpg`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = src;
  });
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

async function readHead(file, byteCount = 12) {
  try {
    return new Uint8Array(await file.slice(0, byteCount).arrayBuffer());
  } catch {
    return null;
  }
}

// One picked file as { dataUrl, name, width, height }, ready to POST. Throws with
// a message written for the user — callers show `err.message` as-is.
export async function normalizeImageFile(file, {
  maxEdge = MAX_IMAGE_EDGE,
  quality = IMAGE_JPEG_QUALITY,
  passthroughBytes = IMAGE_PASSTHROUGH_BYTES,
} = {}) {
  const label = file?.name ? `"${file.name}"` : "That file";
  // Some Android content providers return a File whose bytes are not there yet.
  if (!file || !file.size) {
    throw new Error(`${label} is empty — the device may not have finished saving it.`);
  }

  const heif = isHeifBytes(await readHead(file)) || isHeifName(file.name, file.type);

  // Decoded through an object URL, not a data URL: the base64 of a raw capture is
  // ~20 MB of string that would otherwise sit in memory beside the bitmap.
  const url = URL.createObjectURL(file);
  let img;
  try {
    img = await loadImage(url);
  } catch {
    throw new Error(
      heif
        ? `${label} is a HEIC/HEIF photo, which this browser cannot open. Switch the camera's format to "Most compatible"/JPEG (Settings › Camera) and take it again, or save the photo as JPEG first.`
        : `${label} could not be read as an image.`
    );
  } finally {
    URL.revokeObjectURL(url);
  }

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const fitted = fitWithin(width, height, maxEdge);
  const fits = fitted.width === width && fitted.height === height;

  // Passed through only when it is already small AND in a format every reader
  // handles: a HEIF that Safari happily decoded still has to leave as JPEG.
  if (fits && !heif && file.size <= passthroughBytes) {
    return { dataUrl: await readDataUrl(file), name: file.name, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext("2d");
  // White ground first: a transparent PNG comes out black once flattened to JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // The browser applies EXIF orientation on decode, so drawing bakes it in and the
  // stored photo is upright even for readers that ignore EXIF (the desktop app).
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    name: jpegName(file.name),
    width: canvas.width,
    height: canvas.height,
  };
}
