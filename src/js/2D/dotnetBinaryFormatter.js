// .NET BinaryFormatter (MS-NRBF) serializer, just enough to reproduce the byte layout the
// SmartRPD desktop writes for noticeboard `filenames`/`data`. Verified byte-for-byte.
//
// Root is a jagged byte[][]: each filenames entry wraps one string, each data entry is
// raw PNG bytes.

const REC_HEADER = 0x00; // SerializationHeaderRecord
const REC_BIN_ARRAY = 0x07; // BinaryArray
const REC_OBJ_STRING = 0x06; // BinaryObjectString
const REC_MEMBER_REF = 0x09; // MemberReference
const REC_ARRAY_PRIM = 0x0f; // ArraySinglePrimitive
const REC_MSG_END = 0x0b; // MessageEnd
const BINTYPE_PRIMITIVE_ARRAY = 0x07; // BinaryTypeEnumeration.PrimitiveArray
const PRIM_BYTE = 0x02; // PrimitiveTypeEnumeration.Byte
const ARRAYTYPE_JAGGED = 0x01; // BinaryArrayTypeEnumeration.Jagged

class ByteWriter {
  constructor() {
    this.parts = [];
    this.len = 0;
  }
  u8(b) {
    this.parts.push(Uint8Array.of(b & 0xff));
    this.len += 1;
    return this;
  }
  i32(n) {
    const a = new Uint8Array(4);
    new DataView(a.buffer).setInt32(0, n, true); // little-endian
    this.parts.push(a);
    this.len += 4;
    return this;
  }
  bytes(u8) {
    const a = u8 instanceof Uint8Array ? u8 : Uint8Array.from(u8);
    this.parts.push(a);
    this.len += a.length;
    return this;
  }
  // .NET 7-bit-encoded length prefix (used by BinaryObjectString).
  varint(n) {
    let v = n >>> 0;
    while (v >= 0x80) {
      this.u8((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.u8(v);
    return this;
  }
  toUint8() {
    const out = new Uint8Array(this.len);
    let off = 0;
    for (const p of this.parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }
}

function writeHeader(w) {
  // recordType 0x00, rootId=1, headerId=-1, major=1, minor=0
  w.u8(REC_HEADER).i32(1).i32(-1).i32(1).i32(0);
}

// A complete BinaryFormatter stream that wraps a single string.
export function serializeStringStream(str) {
  const utf8 = new TextEncoder().encode(String(str ?? ""));
  const w = new ByteWriter();
  writeHeader(w);
  w.u8(REC_OBJ_STRING).i32(1).varint(utf8.length).bytes(utf8);
  w.u8(REC_MSG_END);
  return w.toUint8();
}

// Serialize a list of byte arrays as a root jagged byte[][].
export function serializeByteArrayList(items) {
  const list = (items || []).map((it) =>
    it instanceof Uint8Array ? it : Uint8Array.from(it)
  );
  const w = new ByteWriter();
  writeHeader(w);
  // Root BinaryArray (objectId 1): jagged, rank 1, length N, element = byte[].
  w.u8(REC_BIN_ARRAY)
    .i32(1)
    .u8(ARRAYTYPE_JAGGED)
    .i32(1)
    .i32(list.length)
    .u8(BINTYPE_PRIMITIVE_ARRAY)
    .u8(PRIM_BYTE);
  // Member references to the byte[] objects (ids 2..N+1)…
  for (let i = 0; i < list.length; i += 1) {
    w.u8(REC_MEMBER_REF).i32(i + 2);
  }
  // …followed by the referenced ArraySinglePrimitive(Byte) objects in order.
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    w.u8(REC_ARRAY_PRIM).i32(i + 2).i32(b.length).u8(PRIM_BYTE).bytes(b);
  }
  w.u8(REC_MSG_END);
  return w.toUint8();
}

export function bytesToBase64(u8) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) u8[i] = bin.charCodeAt(i);
  return u8;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// The desktop stores raw PNG bytes, so decode a PNG data URL directly and re-encode
// anything else through a canvas — the read-back scans for PNG signatures.
export async function dataUrlToPngBytes(dataUrl) {
  const m = /^data:([a-z0-9.+/-]+);base64,(.*)$/i.exec(String(dataUrl || ""));
  if (m && m[1].toLowerCase() === "image/png") return base64ToBytes(m[2]);

  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  canvas.getContext("2d").drawImage(img, 0, 0);
  const png = canvas.toDataURL("image/png");
  return base64ToBytes(png.slice(png.indexOf(",") + 1));
}

// Force a `.png` extension so the web's BinaryFormatter read-back regex
// (extractFilenamesFromBinaryFormatter) can recover the filename next time.
function ensurePngName(name, idx) {
  let t = String(name || "").trim() || `Image ${idx + 1}`;
  if (!/\.(png|jpe?g|gif|bmp)$/i.test(t)) t += ".png";
  return t;
}

// Encodes parallel filenames/data-URL arrays into the desktop's editedview columns,
// skipping unusable entries so the two stay aligned. Returns base64 ready to POST.
export async function encodeEditedViewColumns(filenames, dataUrls) {
  const names = Array.isArray(filenames) ? filenames : [];
  const datas = Array.isArray(dataUrls) ? dataUrls : [];
  const outNames = [];
  const outBytes = [];
  for (let i = 0; i < datas.length; i += 1) {
    const url = datas[i];
    if (typeof url !== "string" || !url.startsWith("data:image")) continue;
    let bytes;
    try {
      bytes = await dataUrlToPngBytes(url);
    } catch {
      continue;
    }
    if (!bytes || !bytes.length) continue;
    outNames.push(ensurePngName(names[i], outNames.length));
    outBytes.push(bytes);
  }
  const filenamesBlob = serializeByteArrayList(outNames.map(serializeStringStream));
  const dataBlob = serializeByteArrayList(outBytes);
  return {
    filenames: bytesToBase64(filenamesBlob),
    data: bytesToBase64(dataBlob),
    count: outBytes.length,
  };
}

// Base64 decode tolerant of whitespace, URL-safe alphabet and missing padding —
// the shapes the backend actually returns. Returns null instead of throwing.
export function safeAtob(b64) {
  if (typeof b64 !== "string") return null;
  try {
    const cleaned = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
    // atob in browser; Buffer fallback for Node-based tests.
    if (typeof atob === "function") return atob(padded);
    return Buffer.from(padded, "base64").toString("binary");
  } catch {
    return null;
  }
}

// Captures are stored as a base64'd BinaryFormatter image list, not JSON, so scan
// the decoded bytes for PNG signatures and rebuild data URLs from them.
export function extractPngsFromBinaryFormatter(outerBase64) {
  const decoded = safeAtob(outerBase64);
  if (!decoded) return [];

  const out = [];
  const PNG_SIG = "\x89PNG\r\n\x1a\n";
  const PNG_END = "IEND\xae\x42\x60\x82";
  let i = 0;
  while (true) {
    const start = decoded.indexOf(PNG_SIG, i);
    if (start === -1) break;
    const endMarker = decoded.indexOf(PNG_END, start);
    if (endMarker === -1) break;
    const end = endMarker + PNG_END.length;
    out.push("data:image/png;base64," + btoa(decoded.slice(start, end)));
    i = end;
  }
  if (out.length) return out;

  // Fallback: the blob may hold base64-encoded PNG *strings* rather than raw
  // bytes, so scan for the canonical base64-PNG header instead.
  const B64_PNG_HEAD = "iVBORw0KGgo";
  let j = 0;
  while (true) {
    const idx = decoded.indexOf(B64_PNG_HEAD, j);
    if (idx === -1) break;
    let k = idx;
    while (k < decoded.length && /[A-Za-z0-9+/=]/.test(decoded[k])) k += 1;
    const b64 = decoded.slice(idx, k).replace(/=+$/, "");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    out.push("data:image/png;base64," + b64 + pad);
    j = k;
  }
  return out;
}

// Image filenames out of the same blob, in stored order.
export function extractFilenamesFromBinaryFormatter(outerBase64) {
  const decoded = safeAtob(outerBase64);
  if (!decoded) return [];
  const out = [];
  const RE = /[A-Za-z0-9_\-\. ]{1,80}\.(?:png|jpe?g|gif|bmp)/gi;
  let m;
  while ((m = RE.exec(decoded)) !== null) out.push(m[0]);
  return out;
}
