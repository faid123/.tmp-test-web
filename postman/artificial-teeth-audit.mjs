import fs from "node:fs";
import path from "node:path";

const BASE_URL = "https://live.api.smartrpdai.com/api/smartrpd";
const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
const DEFAULT_COLLECTION = path.resolve("postman/smartrpd.postman_collection.json");
const messagePackTextDecoder = new TextDecoder("utf-8");
const messagePackTextEncoder = new TextEncoder();
const shapeOnly = process.env.ARTIFICIAL_TEETH_SHAPE_ONLY === "1";

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeAuditJson(filePath, value) {
  const seen = new WeakSet();
  const replacer = (_key, entry) => {
    if (Array.isArray(entry) && entry.length > 500) {
      return {
        __truncatedArrayLength: entry.length,
        sample: entry.slice(0, 20),
      };
    }
    if (entry && typeof entry === "object") {
      if (seen.has(entry)) return "[Circular]";
      seen.add(entry);
      const keys = Object.keys(entry);
      if (keys.length > 500) {
        return {
          __truncatedObjectKeyCount: keys.length,
          sample: Object.fromEntries(keys.slice(0, 20).map((key) => [key, entry[key]])),
        };
      }
    }
    return entry;
  };
  fs.writeFileSync(filePath, `${JSON.stringify(value, replacer, 2)}\n`);
}

function readCollectionLogin() {
  if (!fs.existsSync(DEFAULT_COLLECTION)) return null;
  const collection = JSON.parse(fs.readFileSync(DEFAULT_COLLECTION, "utf8"));
  const stack = [...(collection.item || [])];

  while (stack.length) {
    const item = stack.shift();
    if (item.item) stack.push(...item.item);
    const rawUrl = item.request?.url?.raw || "";
    const rawBody = item.request?.body?.raw || "";
    if (!/\/user\/login$/i.test(rawUrl) || !rawBody) continue;

    try {
      const payload = JSON.parse(rawBody);
      return {
        machineId: payload[0]?.machine_id || MACHINE_ID,
        username: payload[1]?.username,
        password: payload[1]?.password,
      };
    } catch {
      return null;
    }
  }

  return null;
}

async function postJson(endpoint, body) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { rawText: text };
  }
  if (!response.ok) {
    throw new Error(`${endpoint} failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

async function login() {
  const collectionLogin = readCollectionLogin();
  const username = process.env.SMARTRPD_USERNAME || collectionLogin?.username;
  const password = process.env.SMARTRPD_PASSWORD || collectionLogin?.password;
  const machineId = process.env.SMARTRPD_MACHINE_ID || collectionLogin?.machineId || MACHINE_ID;

  if (!username || !password) {
    throw new Error(
      "Missing login credentials. Set SMARTRPD_UUID, or set SMARTRPD_USERNAME and SMARTRPD_PASSWORD."
    );
  }

  const response = await postJson("/user/login", [
    { machine_id: machineId },
    { username, password },
  ]);

  const user = Array.isArray(response) ? response[0] : response;
  const uuid =
    user?.uuid ??
    user?.data?.uuid ??
    response?.uuid ??
    response?.data?.uuid;
  if (!uuid) {
    throw new Error(`Login succeeded but no uuid was found: ${JSON.stringify(response).slice(0, 500)}`);
  }

  return { uuid, machineId, username };
}

async function fetchToothPlacementData(caseIntID) {
  const session = process.env.SMARTRPD_UUID
    ? {
        uuid: process.env.SMARTRPD_UUID,
        machineId: process.env.SMARTRPD_MACHINE_ID || MACHINE_ID,
        username: process.env.SMARTRPD_USERNAME || null,
      }
    : await login();

  const auth = {
    machine_id: session.machineId,
    uuid: session.uuid,
    caseIntID,
  };

  const response = await postJson("/toothPlacementData/get", [auth]);
  return { response, session: { ...session, uuid: `${session.uuid.slice(0, 6)}...` } };
}

// [Decoder 1] Decode raw MessagePack bytes/base64 from ToothPlacementData.data.
function toUint8Array(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value) && value.every((entry) => Number.isInteger(Number(entry)))) {
    return new Uint8Array(value.map(Number));
  }
  if (typeof value === "string") {
    const text = value.trim();
    const base64Text = text.includes(",") ? text.split(",").pop() : text;
    try {
      return new Uint8Array(Buffer.from(base64Text, "base64"));
    } catch {
      return messagePackTextEncoder.encode(text);
    }
  }
  return null;
}

function decodeMessagePack(value) {
  const bytes = toUint8Array(value);
  if (!bytes?.length) return null;

  let offset = 0;
  const ensure = (length) => {
    if (offset + length > bytes.length) throw new Error("MessagePack payload ended unexpectedly.");
  };
  const readU8 = () => {
    ensure(1);
    return bytes[offset++];
  };
  const read = (length) => {
    ensure(length);
    const slice = bytes.slice(offset, offset + length);
    offset += length;
    return slice;
  };
  const readU16 = () => {
    const data = read(2);
    return (data[0] << 8) | data[1];
  };
  const readU32 = () => {
    const data = read(4);
    return data[0] * 0x1000000 + ((data[1] << 16) | (data[2] << 8) | data[3]);
  };
  const readI8 = () => {
    const parsed = readU8();
    return parsed > 0x7f ? parsed - 0x100 : parsed;
  };
  const readI16 = () => {
    const parsed = readU16();
    return parsed > 0x7fff ? parsed - 0x10000 : parsed;
  };
  const readI32 = () => {
    const parsed = readU32();
    return parsed > 0x7fffffff ? parsed - 0x100000000 : parsed;
  };
  const readNumber64 = (signed) => {
    const data = read(8);
    let parsed = 0n;
    for (const byte of data) parsed = (parsed << 8n) + BigInt(byte);
    if (signed && parsed & (1n << 63n)) parsed -= 1n << 64n;
    const number = Number(parsed);
    return Number.isSafeInteger(number) ? number : parsed.toString();
  };
  const readFloat32 = () => new DataView(read(4).buffer).getFloat32(0, false);
  const readFloat64 = () => new DataView(read(8).buffer).getFloat64(0, false);
  const readString = (length) => messagePackTextDecoder.decode(read(length));
  const readArray = (length) => Array.from({ length }, () => parse());
  const readMap = (length) => {
    const object = {};
    for (let index = 0; index < length; index += 1) {
      object[String(parse())] = parse();
    }
    return object;
  };
  const skipExt = (length) => {
    readU8();
    return { __messagePackExt: true, data: Array.from(read(length)) };
  };

  function parse() {
    const prefix = readU8();
    if (prefix <= 0x7f) return prefix;
    if (prefix >= 0xe0) return prefix - 0x100;
    if ((prefix & 0xe0) === 0xa0) return readString(prefix & 0x1f);
    if ((prefix & 0xf0) === 0x90) return readArray(prefix & 0x0f);
    if ((prefix & 0xf0) === 0x80) return readMap(prefix & 0x0f);

    switch (prefix) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xc4: return Array.from(read(readU8()));
      case 0xc5: return Array.from(read(readU16()));
      case 0xc6: return Array.from(read(readU32()));
      case 0xc7: return skipExt(readU8());
      case 0xc8: return skipExt(readU16());
      case 0xc9: return skipExt(readU32());
      case 0xca: return readFloat32();
      case 0xcb: return readFloat64();
      case 0xcc: return readU8();
      case 0xcd: return readU16();
      case 0xce: return readU32();
      case 0xcf: return readNumber64(false);
      case 0xd0: return readI8();
      case 0xd1: return readI16();
      case 0xd2: return readI32();
      case 0xd3: return readNumber64(true);
      case 0xd4: return skipExt(1);
      case 0xd5: return skipExt(2);
      case 0xd6: return skipExt(4);
      case 0xd7: return skipExt(8);
      case 0xd8: return skipExt(16);
      case 0xd9: return readString(readU8());
      case 0xda: return readString(readU16());
      case 0xdb: return readString(readU32());
      case 0xdc: return readArray(readU16());
      case 0xdd: return readArray(readU32());
      case 0xde: return readMap(readU16());
      case 0xdf: return readMap(readU32());
      default:
        throw new Error(`Unsupported MessagePack prefix 0x${prefix.toString(16)}.`);
    }
  }

  const result = parse();
  if (offset !== bytes.length) throw new Error("MessagePack payload has unread trailing bytes.");
  return result;
}

function isByteArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 4 &&
    value.every((entry) => Number.isInteger(Number(entry)) && Number(entry) >= 0 && Number(entry) <= 255)
  );
}

function looksLikeByteArray(value) {
  if (!Array.isArray(value) || value.length < 4) return false;
  const sampleLength = Math.min(value.length, 256);
  for (let index = 0; index < sampleLength; index += 1) {
    const entry = Number(value[index]);
    if (!Number.isInteger(entry) || entry < 0 || entry > 255) return false;
  }
  return true;
}

function maybeDecodeNestedMessagePack(value) {
  if (!isByteArray(value) && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[A-Za-z0-9+/]+={0,2}$/.test(value.trim())) return null;

  try {
    const decoded = decodeMessagePack(value);
    if (decoded && typeof decoded === "object") return decoded;
  } catch {
    return null;
  }
  return null;
}

function decodeSerializedWrapper(candidate) {
  if (Array.isArray(candidate) && candidate.length === 1 && looksLikeByteArray(candidate[0])) {
    return maybeDecodeNestedMessagePack(candidate[0]) || candidate[0];
  }
  if (looksLikeByteArray(candidate)) {
    return maybeDecodeNestedMessagePack(candidate) || candidate;
  }
  return candidate;
}

function expandSerializedBuffers(candidate, seen = new Set(), depth = 0) {
  if (!candidate || typeof candidate !== "object" || depth > 8) return candidate;
  if (seen.has(candidate)) return candidate;
  seen.add(candidate);

  if (Array.isArray(candidate)) {
    const decoded = maybeDecodeNestedMessagePack(candidate);
    if (decoded) return expandSerializedBuffers(decoded, seen, depth + 1);
    return candidate.map((entry) => expandSerializedBuffers(entry, seen, depth + 1));
  }

  const expanded = { ...candidate };
  Object.entries(candidate).forEach(([key, value]) => {
    expanded[key] = expandSerializedBuffers(value, seen, depth + 1);
    const shouldTryDecode =
      /buffer|bytes|data|serialized|mesh|surface|transform|landmark/i.test(key) ||
      isByteArray(value);
    if (!shouldTryDecode) return;

    const decoded = maybeDecodeNestedMessagePack(value);
    if (decoded) expanded[`${key}_decoded`] = expandSerializedBuffers(decoded, seen, depth + 1);
  });

  return expanded;
}

// [Decoder 2] Map Unity MessagePack numeric keys to StageDataManager/ToothCraftData fields.
function keyedValue(candidate, key) {
  if (!candidate) return undefined;
  if (Array.isArray(candidate)) return candidate[key];
  if (typeof candidate === "object") return candidate[key] ?? candidate[String(key)];
  return undefined;
}

function mapUnityDictionary(candidate) {
  if (!candidate) return {};
  if (Array.isArray(candidate)) {
    return Object.fromEntries(
      candidate
        .map((value, index) => [index, value])
        .filter(([, value]) => value !== undefined && value !== null)
    );
  }
  if (typeof candidate === "object") return candidate;
  return {};
}

function mapGuideLinesData(candidate) {
  if (!candidate) return null;
  return {
    buccalLineEditorData_: keyedValue(candidate, 0),
    gingivalLineEditorData_: keyedValue(candidate, 1),
  };
}

function mapToothCraftData(candidate) {
  if (!candidate) return null;
  const mapped = {
    toothData_: mapUnityDictionary(keyedValue(candidate, 0)),
    toothSurfaceMeshData_: mapUnityDictionary(keyedValue(candidate, 1)),
    toothLandmarkInterfaceData_: mapUnityDictionary(keyedValue(candidate, 2)),
    toothTransformInterfaceData_: mapUnityDictionary(keyedValue(candidate, 3)),
    initialToothSurfaceMeshData_: mapUnityDictionary(keyedValue(candidate, 4)),
    initialToothLandmarkInterfaceData_: mapUnityDictionary(keyedValue(candidate, 5)),
    initialToothTransformInterfaceData_: mapUnityDictionary(keyedValue(candidate, 6)),
  };
  mapped.teeth = shapeOnly ? [] : createToothRecordsFromCraftMaps(mapped);
  return mapped;
}

function mapStageDataManager(candidate) {
  if (!candidate) return null;
  return {
    ToothSelectionData_: keyedValue(candidate, 0),
    guideLinesDataUpperJaw_: mapGuideLinesData(keyedValue(candidate, 1)),
    toothCraftDataUpperJaw_: mapToothCraftData(keyedValue(candidate, 3)),
    guideLinesDataLowerJaw_: mapGuideLinesData(keyedValue(candidate, 4)),
    toothCraftDataLowerJaw_: mapToothCraftData(keyedValue(candidate, 5)),
  };
}

// [Decoder 3] Extract vectors, mesh vertices, and triangle indices from decoded C# objects.
function toNumericArray(value) {
  if (!Array.isArray(value)) return null;
  const numbers = value.map(Number);
  return numbers.every(Number.isFinite) ? numbers : null;
}

function toPointObject(value) {
  if (typeof value === "string") {
    try {
      return toPointObject(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (Array.isArray(value) && value.length >= 3) {
    if (isByteArray(value)) return null;
    const [x, y, z] = value.map(Number);
    return { x, y, z };
  }

  if (value && typeof value === "object") {
    if (isByteArray(value)) return null;
    const x = Number(value.x ?? value.X ?? value.pos_x ?? value.position_x ?? value[0]);
    const y = Number(value.y ?? value.Y ?? value.pos_y ?? value.position_y ?? value[1]);
    const z = Number(value.z ?? value.Z ?? value.pos_z ?? value.position_z ?? value[2]);
    if ([x, y, z].every(Number.isFinite)) return { x, y, z };
  }

  return null;
}

function isValidPoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function pointMagnitude(point) {
  if (!isValidPoint(point)) return 0;
  return Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
}

function readFloat32LE(bytes, offset) {
  if (!bytes || offset + 3 >= bytes.length) return NaN;
  const array = toUint8Array(bytes);
  const view = new DataView(array.buffer, array.byteOffset, array.byteLength);
  return view.getFloat32(offset, true);
}

function readFloat64LE(bytes, offset) {
  if (!bytes || offset + 7 >= bytes.length) return NaN;
  const array = toUint8Array(bytes);
  const view = new DataView(array.buffer, array.byteOffset, array.byteLength);
  return view.getFloat64(offset, true);
}

function readVector3Float64LE(bytes, offset) {
  const point = {
    x: readFloat64LE(bytes, offset),
    y: readFloat64LE(bytes, offset + 8),
    z: readFloat64LE(bytes, offset + 16),
  };
  return isValidPoint(point) && [point.x, point.y, point.z].every((value) => Math.abs(value) < 10000)
    ? point
    : null;
}

function getCerealPayloadOffset(bytes) {
  if (!looksLikeByteArray(bytes)) return null;
  const archiveText = "serialization::archive";
  const archiveCodes = Array.from(archiveText).map((char) => char.charCodeAt(0));
  for (let index = 0; index + archiveCodes.length < bytes.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < archiveCodes.length; offset += 1) {
      if (bytes[index + offset] !== archiveCodes[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index + archiveCodes.length + 15;
  }
  return null;
}

function extractBinaryTransformSummary(candidate) {
  const wrapper = Array.isArray(candidate) && candidate.length === 1 ? candidate[0] : candidate;
  if (!looksLikeByteArray(wrapper) || wrapper.length < 120) return null;
  const preferredOffset = getCerealPayloadOffset(wrapper);
  const offsets = preferredOffset ? [preferredOffset] : [];
  for (let offset = 0; offset + 99 < wrapper.length; offset += 1) {
    if (!offsets.includes(offset)) offsets.push(offset);
  }

  let best = null;
  for (const offset of offsets) {
    const buccalDirection = readVector3Float64LE(wrapper, offset);
    const mesialDistalLine = readVector3Float64LE(wrapper, offset + 24);
    const buccalPoint = readVector3Float64LE(wrapper, offset + 48);
    const gingivalPoint = readVector3Float64LE(wrapper, offset + 72);
    const mesialDistalSizing = readFloat32LE(wrapper, offset + 96);
    if (!buccalDirection || !mesialDistalLine || !buccalPoint || !gingivalPoint) continue;

    const directionScore =
      pointMagnitude(buccalDirection) > 0.25 &&
      pointMagnitude(buccalDirection) < 1.75 &&
      pointMagnitude(mesialDistalLine) > 0.25 &&
      pointMagnitude(mesialDistalLine) < 1.75
        ? 4
        : 0;
    const pointScore =
      pointMagnitude(buccalPoint) > 2 && pointMagnitude(gingivalPoint) > 2 ? 4 : 0;
    const sizingScore =
      Number.isFinite(mesialDistalSizing) && mesialDistalSizing >= 0 && mesialDistalSizing < 100 ? 1 : 0;
    const score = directionScore + pointScore + sizingScore + (offset === preferredOffset ? 2 : 0);

    if (score > (best?.score ?? -1)) {
      best = {
        score,
        offset,
        buccalDirection,
        mesialDistalLine,
        buccalPoint,
        gingivalPoint,
        mesialDistalSizing: Number.isFinite(mesialDistalSizing) ? mesialDistalSizing : null,
      };
    }
  }

  if (!best || best.score < 6) return null;
  const { score, ...summary } = best;
  return summary;
}

function getPointBounds(points) {
  if (!points?.length) return null;
  return points.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      minY: Math.min(acc.minY, point.y),
      minZ: Math.min(acc.minZ, point.z),
      maxX: Math.max(acc.maxX, point.x),
      maxY: Math.max(acc.maxY, point.y),
      maxZ: Math.max(acc.maxZ, point.z),
    }),
    {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity,
    }
  );
}

function getPointBoundsCenter(points) {
  const bounds = getPointBounds(points);
  if (!bounds) return null;
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
}

function looksLikeMeshBounds(points) {
  if (!points?.length) return false;
  const box = getPointBounds(points);
  const spans = [box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ];
  return spans.every((span) => Number.isFinite(span)) && spans.some((span) => span > 0.25);
}

function extractFloatTripletsFromBytes(candidate) {
  const bytes = toUint8Array(candidate);
  if (!bytes || bytes.length < 12) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const best = { points: [], score: 0 };

  for (let offset = 0; offset < Math.min(32, bytes.length - 12); offset += 4) {
    const points = [];
    for (let cursor = offset; cursor + 11 < bytes.length; cursor += 12) {
      const point = {
        x: view.getFloat32(cursor, true),
        y: view.getFloat32(cursor + 4, true),
        z: view.getFloat32(cursor + 8, true),
      };
      if (!isValidPoint(point) || [point.x, point.y, point.z].some((coord) => Math.abs(coord) > 10000)) {
        if (points.length >= 12) break;
        points.length = 0;
        continue;
      }
      points.push(point);
    }

    const score = looksLikeMeshBounds(points) ? points.length : 0;
    if (score > best.score) {
      best.points = points;
      best.score = score;
    }
  }

  return best.score >= 12 ? best.points : [];
}

function decodeBinarySurfaceMesh(candidate) {
  const wrapper = Array.isArray(candidate) && candidate.length === 1 ? candidate[0] : candidate;
  if (!looksLikeByteArray(wrapper) || wrapper.length < 64) return null;
  const bytes = toUint8Array(wrapper);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getInt32(0, true);
  const pointCount = view.getInt32(4, true);
  const faceCount = view.getInt32(8, true);
  const vertexOffset = 12;
  const indexOffset = vertexOffset + pointCount * 3 * 8;
  const indexCount = faceCount * 3;

  if (
    version < 0 ||
    version > 10 ||
    pointCount <= 0 ||
    faceCount <= 0 ||
    pointCount > 1000000 ||
    faceCount > 1000000 ||
    indexOffset + indexCount * 4 > bytes.length
  ) {
    return null;
  }

  const vertices = [];
  for (let index = 0; index < pointCount; index += 1) {
    const offset = vertexOffset + index * 24;
    const point = {
      x: view.getFloat64(offset, true),
      y: view.getFloat64(offset + 8, true),
      z: view.getFloat64(offset + 16, true),
    };
    if (!isValidPoint(point) || [point.x, point.y, point.z].some((coord) => Math.abs(coord) > 100000)) {
      return null;
    }
    vertices.push(point);
  }

  const indices = [];
  for (let index = 0; index < indexCount; index += 1) {
    const value = view.getInt32(indexOffset + index * 4, true);
    if (value < 0 || value >= pointCount) return null;
    indices.push(value);
  }

  return {
    pointSize: pointCount,
    faceSize: faceCount,
    vertices,
    indices,
    bounds: getPointBounds(vertices),
    center: getPointBoundsCenter(vertices),
    binaryLayout: {
      version,
      vertexOffset,
      indexOffset,
      bytes: bytes.length,
    },
  };
}

function extractPointArray(candidate) {
  if (!candidate) return [];
  if (typeof candidate === "string") {
    try {
      return extractPointArray(JSON.parse(candidate));
    } catch {
      return [];
    }
  }
  if (Array.isArray(candidate)) return candidate.map(toPointObject).filter(isValidPoint);
  if (typeof candidate !== "object") return [];

  for (const key of ["points", "vertices", "coordinates", "coords", "positions", "data", "json"]) {
    const points = extractPointArray(candidate[key]);
    if (points.length) return points;
  }
  return [];
}

function extractVertexArray(candidate, expectedCount = null) {
  if (!Array.isArray(candidate)) return extractPointArray(candidate);
  if (isByteArray(candidate)) {
    const points = extractFloatTripletsFromBytes(candidate);
    return expectedCount && points.length >= expectedCount ? points.slice(0, expectedCount) : points;
  }
  if (candidate.every((entry) => typeof entry === "number")) {
    const points = [];
    for (let index = 0; index + 2 < candidate.length; index += 3) {
      const point = toPointObject(candidate.slice(index, index + 3));
      if (isValidPoint(point)) points.push(point);
    }
    return expectedCount && points.length >= expectedCount ? points.slice(0, expectedCount) : points;
  }
  const points = extractPointArray(candidate);
  return expectedCount && points.length >= expectedCount ? points.slice(0, expectedCount) : points;
}

function normalizeToothIndices(indices, expectedLength = null, vertexCount = null) {
  if (!indices?.length || indices.length < 3) return null;
  const trimmed = expectedLength && indices.length >= expectedLength ? indices.slice(0, expectedLength) : indices;
  if (vertexCount && trimmed.some((index) => index < 0 || index >= vertexCount)) return null;
  return trimmed.length >= 3 ? trimmed : null;
}

function parseToothIndices(candidate, expectedLength = null, vertexCount = null) {
  if (isByteArray(candidate)) {
    const bytes = toUint8Array(candidate);
    if (!bytes?.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const indices = [];
    if (bytes.length % 4 === 0) {
      for (let offset = 0; offset + 3 < bytes.length; offset += 4) {
        const value = view.getInt32(offset, true);
        if (value < 0 || value > 10000000) return null;
        indices.push(value);
      }
      return normalizeToothIndices(indices, expectedLength, vertexCount);
    }
    if (bytes.length % 2 === 0) {
      for (let offset = 0; offset + 1 < bytes.length; offset += 2) {
        indices.push(view.getUint16(offset, true));
      }
      return normalizeToothIndices(indices, expectedLength, vertexCount);
    }
  }

  if (!Array.isArray(candidate)) return null;
  let indices = null;
  if (candidate.every((entry) => Number.isInteger(Number(entry)))) {
    indices = candidate.map(Number);
  }
  if (!indices && candidate.every((entry) => Array.isArray(entry))) {
    const flattened = candidate.flatMap((entry) => entry.map(Number));
    indices = flattened.every(Number.isInteger) ? flattened : null;
  }
  return normalizeToothIndices(indices, expectedLength, vertexCount);
}

function getToothGeometryData(candidate) {
  const binarySurfaceMesh = decodeBinarySurfaceMesh(candidate);
  if (binarySurfaceMesh) return binarySurfaceMesh;

  candidate = decodeSerializedWrapper(candidate);
  if (!candidate || typeof candidate !== "object") return null;
  const pointSize = Number(
    candidate.point_size ??
      candidate.pointSize ??
      candidate.vertexCount ??
      candidate.verticesCount ??
      keyedValue(candidate, 0)
  );
  const faceSize = Number(
    candidate.face_size ??
      candidate.faceSize ??
      candidate.faceCount ??
      candidate.triangleCount ??
      keyedValue(candidate, 2)
  );
  const expectedPointCount = Number.isInteger(pointSize) && pointSize > 0 ? pointSize : null;
  const expectedIndexCount = Number.isInteger(faceSize) && faceSize > 0 ? faceSize : null;

  const vertexCandidates = [
    candidate.points,
    candidate.point_data,
    candidate.pointData,
    candidate.pointBuffer,
    candidate.point_buffer,
    candidate.pointsBuffer,
    candidate.points_buffer,
    keyedValue(candidate, 1),
    candidate.vertices,
    candidate.positions,
    candidate.vertexData,
    candidate.meshVertices,
    candidate.vertices_,
    candidate.vertex_buffer,
    candidate.vertexBuffer,
    keyedValue(candidate, 0),
  ];

  let vertices = [];
  for (const vertexCandidate of vertexCandidates) {
    vertices = extractVertexArray(vertexCandidate, expectedPointCount);
    if (vertices.length >= 12 && looksLikeMeshBounds(vertices)) break;
  }
  if (vertices.length < 12 || !looksLikeMeshBounds(vertices)) return null;

  const indexCandidates = [
    candidate.face_index,
    candidate.faceIndex,
    candidate.indices,
    candidate.triangles,
    candidate.faces,
    candidate.faceData,
    candidate.faceBuffer,
    candidate.face_buffer,
    candidate.index_data,
    candidate.indexData,
    candidate.meshIndices,
    candidate.triangles_,
    candidate.indexBuffer,
    keyedValue(candidate, 3),
    keyedValue(candidate, 2),
  ];

  let indices = null;
  for (const indexCandidate of indexCandidates) {
    indices = parseToothIndices(indexCandidate, expectedIndexCount, vertices.length);
    if (indices?.length >= 3) break;
  }

  return {
    pointSize: expectedPointCount,
    faceSize: expectedIndexCount,
    vertices,
    indices,
    bounds: getPointBounds(vertices),
    center: getPointBoundsCenter(vertices),
  };
}

// [Decoder 4] Synthesize jaw-separated tooth records by merging tooth, transform, and mesh maps.
function addNestedValues(candidate, output, seen = new Set(), depth = 0) {
  if (!candidate || typeof candidate !== "object" || depth > 5 || seen.has(candidate)) return;
  const decoded = decodeSerializedWrapper(candidate);
  if (decoded !== candidate) {
    addNestedValues(decoded, output, seen, depth + 1);
    return;
  }
  if (looksLikeByteArray(candidate)) return;
  seen.add(candidate);
  output.push(candidate);
  const values = Array.isArray(candidate) ? candidate : Object.values(candidate);
  values.forEach((value) => addNestedValues(value, output, seen, depth + 1));
}

function getKeyedVector(candidate, key) {
  return toPointObject(keyedValue(candidate, key));
}

function getTransformSummary(candidate) {
  const binaryTransform = extractBinaryTransformSummary(candidate);
  if (binaryTransform) return binaryTransform;

  candidate = decodeSerializedWrapper(candidate);
  if (!candidate || typeof candidate !== "object") return null;
  return {
    buccalDirection: toPointObject(candidate.buccal_direction ?? candidate.buccalDirection) ?? getKeyedVector(candidate, 0),
    mesialDistalLine: toPointObject(candidate.mesial_distal_line ?? candidate.mesialDistalLine) ?? getKeyedVector(candidate, 1),
    buccalPoint: toPointObject(candidate.buccal_point ?? candidate.buccalPoint) ?? getKeyedVector(candidate, 2),
    gingivalPoint: toPointObject(candidate.gingival_point ?? candidate.gingivalPoint) ?? getKeyedVector(candidate, 3),
    mesialDistalSizing: Number(
      candidate.mesial_distal_sizing ?? candidate.mesialDistalSizing ?? keyedValue(candidate, 4)
    ),
  };
}

function getToothIndex(candidate, fallback) {
  if (!candidate || typeof candidate !== "object") return String(fallback);
  const value =
    candidate.tooth ??
    candidate.tooth_id ??
    candidate.toothId ??
    candidate.toothIndex ??
    candidate.tooth_index ??
    candidate.index ??
    candidate.id ??
    candidate.number ??
    candidate.name ??
    keyedValue(candidate, 0);
  return value === undefined || value === null ? String(fallback) : String(value);
}

function getDeepGeometry(...sources) {
  for (const source of sources) {
    const direct = getToothGeometryData(source);
    if (direct) return direct;
  }

  const nested = [];
  sources.forEach((source) => addNestedValues(source, nested));
  for (const candidate of nested) {
    const geometry = getToothGeometryData(candidate);
    if (geometry) return geometry;
  }
  return null;
}

function createToothRecordsFromCraftMaps(craftData) {
  if (!craftData) return [];
  const keys = new Set();
  [
    craftData.toothData_,
    craftData.toothSurfaceMeshData_,
    craftData.toothTransformInterfaceData_,
    craftData.initialToothSurfaceMeshData_,
    craftData.initialToothTransformInterfaceData_,
  ].forEach((dict) => Object.keys(dict || {}).forEach((key) => keys.add(key)));

  return Array.from(keys).flatMap((key) => {
    const toothData = craftData.toothData_?.[key];
    const transformData =
      craftData.toothTransformInterfaceData_?.[key] ??
      craftData.initialToothTransformInterfaceData_?.[key];
    const surfaceData =
      craftData.toothSurfaceMeshData_?.[key] ??
      craftData.initialToothSurfaceMeshData_?.[key];
    const transform = getTransformSummary(transformData);
    const geometry = getDeepGeometry(surfaceData);

    if (!transform && !geometry) return [];

    return [
      {
        mapKey: key,
        toothIndex: getToothIndex(toothData, key),
        position: transform?.gingivalPoint ?? transform?.buccalPoint ?? geometry?.center ?? null,
        transform,
        geometry,
      },
    ];
  });
}

function describeValueShape(value, depth = 0) {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) {
    if (isByteArray(value)) return `byte[${value.length}]`;
    const numeric = toNumericArray(value);
    if (numeric) return `number[${value.length}]`;
    return `array[${value.length}]`;
  }
  if (typeof value !== "object") return typeof value;
  const keys = Object.keys(value);
  if (depth > 1) return `object{${keys.slice(0, 8).join(",")}}`;
  return Object.fromEntries(keys.slice(0, 8).map((key) => [key, describeValueShape(value[key], depth + 1)]));
}

function summarizeCraftData(craftData) {
  if (!craftData) return null;
  const dictNames = [
    "toothData_",
    "toothSurfaceMeshData_",
    "toothLandmarkInterfaceData_",
    "toothTransformInterfaceData_",
    "initialToothSurfaceMeshData_",
    "initialToothLandmarkInterfaceData_",
    "initialToothTransformInterfaceData_",
  ];
  return Object.fromEntries(
    dictNames.map((name) => {
      const dict = craftData[name] || {};
      const keys = Object.keys(dict);
      const firstValue = keys.length ? dict[keys[0]] : null;
      const firstDecoded = firstValue ? decodeSerializedWrapper(firstValue) : null;
      return [
        name,
        {
          count: keys.length,
          keys: keys.slice(0, 24),
          firstShape: firstValue ? describeValueShape(firstValue) : null,
          firstInnerShape:
            Array.isArray(firstValue) && firstValue.length === 1
              ? describeValueShape(firstValue[0])
              : null,
          firstInnerBytes:
            Array.isArray(firstValue) && firstValue.length === 1 && looksLikeByteArray(firstValue[0])
              ? firstValue[0].slice(0, 180)
              : null,
          firstDecodedShape:
            firstDecoded && firstDecoded !== firstValue
              ? describeValueShape(firstDecoded)
              : null,
        },
      ];
    })
  );
}

function getPayloadEntries(rawResponse) {
  if (looksLikeByteArray(rawResponse?.data) || looksLikeByteArray(rawResponse?.Data)) {
    return [rawResponse];
  }
  if (Array.isArray(rawResponse)) return rawResponse;
  if (Array.isArray(rawResponse?.data)) return rawResponse.data;
  if (Array.isArray(rawResponse?.Data)) return rawResponse.Data;
  return [rawResponse];
}

function decodeToothPlacementEntry(entry) {
  const payload =
    entry?.data ??
    entry?.Data ??
    entry?.toothPlacementData ??
    entry?.tooth_placement_data;
  if (!payload) return null;
  const decoded = decodeMessagePack(payload);
  return mapStageDataManager(decoded);
}

function toPointsOutput(caseIntID, rawResponse) {
  const entries = getPayloadEntries(rawResponse);
  const decodedEntries = entries
    .map((entry, entryIndex) => ({ entry, entryIndex, decoded: decodeToothPlacementEntry(entry) }))
    .filter((item) => item.decoded);

  const jaws = { upper: [], lower: [] };
  decodedEntries.forEach(({ decoded, entryIndex }) => {
    decoded.toothCraftDataUpperJaw_?.teeth?.forEach((tooth) => {
      jaws.upper.push({ ...tooth, entryIndex, jaw_type: "upper_jaw" });
    });
    decoded.toothCraftDataLowerJaw_?.teeth?.forEach((tooth) => {
      jaws.lower.push({ ...tooth, entryIndex, jaw_type: "lower_jaw" });
    });
  });

  return {
    case_id: caseIntID,
    upper_jaw: jaws.upper.map(toPointsTooth),
    lower_jaw: jaws.lower.map(toPointsTooth),
  };
}

function toPointsTooth(tooth) {
  const includeFullMesh = process.env.ARTIFICIAL_TEETH_FULL_MESH === "1";
  const mesh = tooth.geometry
    ? {
        pointSize: tooth.geometry.pointSize,
        faceSize: tooth.geometry.faceSize,
        vertexCount: tooth.geometry.vertices.length,
        indexCount: tooth.geometry.indices?.length ?? 0,
        bounds: tooth.geometry.bounds,
        center: tooth.geometry.center,
        firstVertices: tooth.geometry.vertices.slice(0, 20),
        firstIndices: tooth.geometry.indices?.slice(0, 60) ?? null,
      }
    : null;

  if (mesh && includeFullMesh) {
    mesh.vertices = tooth.geometry.vertices;
    mesh.indices = tooth.geometry.indices;
  }

  return {
    entryIndex: tooth.entryIndex,
    jaw_type: tooth.jaw_type,
    mapKey: tooth.mapKey,
    toothIndex: tooth.toothIndex,
    position: tooth.position,
    transform: tooth.transform,
    mesh,
  };
}

function toAuditOutput(caseIntID, rawResponse) {
  const entries = getPayloadEntries(rawResponse);
  const decodedEntries = entries.map((entry, entryIndex) => {
    try {
      const decoded = decodeToothPlacementEntry(entry);
      return { entryIndex, decoded, error: null };
    } catch (error) {
      return { entryIndex, decoded: null, error: error.message };
    }
  });
  const points = toPointsOutput(caseIntID, rawResponse);

  return {
    case_id: caseIntID,
    entryCount: entries.length,
    decodedEntryCount: decodedEntries.filter((entry) => entry.decoded).length,
    errors: decodedEntries.filter((entry) => entry.error),
    jawSummary: {
      upper: summarizeTeeth(points.upper_jaw),
      lower: summarizeTeeth(points.lower_jaw),
    },
    decodedShape: decodedEntries.map(({ entryIndex, decoded, error }) => ({
      entryIndex,
      error,
      upper: summarizeCraftData(decoded?.toothCraftDataUpperJaw_),
      lower: summarizeCraftData(decoded?.toothCraftDataLowerJaw_),
    })),
    teeth: {
      upper: points.upper_jaw.map(toAuditTooth),
      lower: points.lower_jaw.map(toAuditTooth),
    },
  };
}

function summarizeTeeth(teeth) {
  return {
    total: teeth.length,
    withMesh: teeth.filter((tooth) => tooth.mesh?.vertexCount > 0).length,
    withIndices: teeth.filter((tooth) => tooth.mesh?.indexCount > 0).length,
    vertices: teeth.reduce((total, tooth) => total + (tooth.mesh?.vertexCount ?? 0), 0),
    indices: teeth.reduce((total, tooth) => total + (tooth.mesh?.indexCount ?? 0), 0),
    firstMesh: teeth.find((tooth) => tooth.mesh?.vertexCount > 0)
      ? {
          toothIndex: teeth.find((tooth) => tooth.mesh?.vertexCount > 0).toothIndex,
          vertexCount: teeth.find((tooth) => tooth.mesh?.vertexCount > 0).mesh.vertexCount,
          indexCount: teeth.find((tooth) => tooth.mesh?.vertexCount > 0).mesh.indexCount,
          center: teeth.find((tooth) => tooth.mesh?.vertexCount > 0).mesh.center,
        }
      : null,
  };
}

function toAuditTooth(tooth) {
  return {
    entryIndex: tooth.entryIndex,
    mapKey: tooth.mapKey,
    toothIndex: tooth.toothIndex,
    position: tooth.position,
    transform: tooth.transform,
    mesh: tooth.mesh
      ? {
          pointSize: tooth.mesh.pointSize,
          faceSize: tooth.mesh.faceSize,
          vertexCount: tooth.mesh.vertexCount,
          indexCount: tooth.mesh.indexCount,
          bounds: tooth.mesh.bounds,
          center: tooth.mesh.center,
          firstVertices: tooth.mesh.firstVertices?.slice(0, 5) ?? null,
          firstIndices: tooth.mesh.firstIndices?.slice(0, 12) ?? null,
        }
      : null,
  };
}

async function runFetch(caseIntID) {
  const { response, session } = await fetchToothPlacementData(caseIntID);
  const baseName = path.resolve("postman", `artificial-teeth-${caseIntID}`);
  writeJson(`${baseName}-raw.json`, response);
  if (!shapeOnly) writeAuditJson(`${baseName}-points.json`, toPointsOutput(caseIntID, response));
  writeAuditJson(`${baseName}-audit.json`, toAuditOutput(caseIntID, response));
  console.log(`Fetched case ${caseIntID} using ${session.username || "uuid"} (${session.uuid}).`);
  console.log(`Wrote ${path.relative(process.cwd(), `${baseName}-raw.json`)}`);
  if (!shapeOnly) console.log(`Wrote ${path.relative(process.cwd(), `${baseName}-points.json`)}`);
  console.log(`Wrote ${path.relative(process.cwd(), `${baseName}-audit.json`)}`);
}

function runParse(rawFile) {
  const rawPath = path.resolve(rawFile);
  const caseMatch = path.basename(rawPath).match(/(\d+)/);
  const caseIntID = Number(process.argv.find((arg) => /^\d+$/.test(arg)) ?? caseMatch?.[1]);
  if (!caseIntID) throw new Error("Could not infer case id. Pass it as an argument.");
  const rawResponse = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  const baseName = path.resolve(path.dirname(rawPath), `artificial-teeth-${caseIntID}`);
  if (!shapeOnly) writeAuditJson(`${baseName}-points.json`, toPointsOutput(caseIntID, rawResponse));
  writeAuditJson(`${baseName}-audit.json`, toAuditOutput(caseIntID, rawResponse));
  console.log(`Parsed ${path.basename(rawPath)}.`);
  if (!shapeOnly) console.log(`Wrote ${path.relative(process.cwd(), `${baseName}-points.json`)}`);
  console.log(`Wrote ${path.relative(process.cwd(), `${baseName}-audit.json`)}`);
}

const args = process.argv.slice(2);
const rawIndex = args.indexOf("--raw");
try {
  if (rawIndex >= 0) {
    const rawFile = args[rawIndex + 1];
    if (!rawFile) throw new Error("Usage: node postman/artificial-teeth-audit.mjs --raw <raw-json> [case-id]");
    runParse(rawFile);
  } else {
    const caseIntID = Number(args.find((arg) => /^\d+$/.test(arg)) || 1230);
    await runFetch(caseIntID);
  }
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
