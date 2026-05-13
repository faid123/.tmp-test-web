import * as THREE from "three";

const ARTIFICIAL_TOOTH_ENDPOINTS = [
  "/toothPlacementData/get",
  "/toothplacementdata/get",
  "/toothplacement/get",
  "/tooth-placement/get",
  "/artificialteeth/get",
  "/artificialteeth/getall",
];

const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
const FALLBACK_UUID = "AC4gRQXZJoNz9EhhW36Q8jMJXBsf";

function getLoggedInUuid() {
  try {
    const user = JSON.parse(localStorage.getItem("loggedInUser") || "null");
    return user?.uuid || FALLBACK_UUID;
  } catch {
    return FALLBACK_UUID;
  }
}

function createAuthData(caseIntID) {
  return {
    machine_id: MACHINE_ID,
    uuid: getLoggedInUuid(),
    caseIntID,
  };
}

// [Decoder 1] Decode raw MessagePack bytes/base64 from ToothPlacementData.data.
const messagePackTextDecoder = new TextDecoder("utf-8");

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
      const binary = atob(base64Text);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes;
    } catch {
      return new TextEncoder().encode(text);
    }
  }
  return null;
}

function decodeMessagePack(value) {
  const bytes = toUint8Array(value);
  if (!bytes?.length) return null;

  let offset = 0;
  const ensure = (length) => {
    if (offset + length > bytes.length) {
      throw new Error("MessagePack payload ended unexpectedly.");
    }
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
  const readFloat32 = () => {
    const data = read(4);
    return new DataView(data.buffer, data.byteOffset, data.byteLength).getFloat32(0, false);
  };
  const readFloat64 = () => {
    const data = read(8);
    return new DataView(data.buffer, data.byteOffset, data.byteLength).getFloat64(0, false);
  };
  const readString = (length) => messagePackTextDecoder.decode(read(length));
  const readArray = (length) => {
    const array = [];
    for (let index = 0; index < length; index += 1) array.push(parse());
    return array;
  };
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
  if (offset !== bytes.length) {
    throw new Error("MessagePack payload has unread trailing bytes.");
  }
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

function unwrapSerializedBuffer(candidate) {
  if (Array.isArray(candidate) && candidate.length === 1 && looksLikeByteArray(candidate[0])) {
    return candidate[0];
  }
  return candidate;
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

function maybeDecodeNestedMessagePack(value) {
  if (!isByteArray(value) && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[A-Za-z0-9+/]+={0,2}$/.test(value.trim())) return null;

  try {
    const decoded = decodeMessagePack(value);
    if (decoded && typeof decoded === "object") return decoded;
  } catch {
    // Not every byte/string field is a nested MessagePack object.
  }
  return null;
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
    if (decoded) {
      expanded[`${key}_decoded`] = expandSerializedBuffers(decoded, seen, depth + 1);
    }
  });

  return expanded;
}

function disposeObject3D(object) {
  if (!object) return;
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

function normalizeJawKey(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("upper_jaw") || text.includes("upper") || text.includes("maxillary") || text === "2") {
    return "upper";
  }
  if (text.includes("lower_jaw") || text.includes("lower") || text.includes("mandibular") || text === "1") {
    return "lower";
  }
  return null;
}

function isValidPoint(point) {
  return (
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
  );
}

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

function getKeyedVector(candidate, key) {
  return toPointObject(keyedValue(candidate, key));
}

function pointMagnitude(point) {
  if (!isValidPoint(point)) return 0;
  return Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
}

function looksLikeModelPosition(point) {
  return isValidPoint(point) && pointMagnitude(point) > 2;
}

function toDataView(candidate) {
  const bytes = toUint8Array(candidate);
  if (!bytes?.length) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readFloat64LE(view, offset) {
  if (!view || offset + 7 >= view.byteLength) return NaN;
  return view.getFloat64(offset, true);
}

function readFloat32LE(view, offset) {
  if (!view || offset + 3 >= view.byteLength) return NaN;
  return view.getFloat32(offset, true);
}

function readVector3Float64LE(view, offset) {
  const point = {
    x: readFloat64LE(view, offset),
    y: readFloat64LE(view, offset + 8),
    z: readFloat64LE(view, offset + 16),
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
  const bytes = unwrapSerializedBuffer(candidate);
  if (!looksLikeByteArray(bytes) || bytes.length < 120) return null;

  const view = toDataView(bytes);
  const preferredOffset = getCerealPayloadOffset(bytes);
  const offsets = preferredOffset ? [preferredOffset] : [];
  for (let offset = 0; offset + 99 < bytes.length; offset += 1) {
    if (!offsets.includes(offset)) offsets.push(offset);
  }

  let best = null;
  for (const offset of offsets) {
    if (offset + 99 >= bytes.length) continue;
    const buccalDirection = readVector3Float64LE(view, offset);
    const mesialDistalLine = readVector3Float64LE(view, offset + 24);
    const buccalPoint = readVector3Float64LE(view, offset + 48);
    const gingivalPoint = readVector3Float64LE(view, offset + 72);
    const mesialDistalSizing = readFloat32LE(view, offset + 96);
    if (!buccalDirection || !mesialDistalLine || !buccalPoint || !gingivalPoint) continue;

    const directionScore =
      pointMagnitude(buccalDirection) > 0.25 &&
      pointMagnitude(buccalDirection) < 1.75 &&
      pointMagnitude(mesialDistalLine) > 0.25 &&
      pointMagnitude(mesialDistalLine) < 1.75
        ? 4
        : 0;
    const positionScore =
      pointMagnitude(buccalPoint) > 2 && pointMagnitude(gingivalPoint) > 2 ? 4 : 0;
    const sizingScore =
      Number.isFinite(mesialDistalSizing) && mesialDistalSizing >= 0 && mesialDistalSizing < 100 ? 1 : 0;
    const score = directionScore + positionScore + sizingScore + (offset === preferredOffset ? 2 : 0);

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

function getToothInterfacePosition(candidate) {
  const binaryTransform = extractBinaryTransformSummary(candidate);
  if (looksLikeModelPosition(binaryTransform?.gingivalPoint)) return binaryTransform.gingivalPoint;
  if (looksLikeModelPosition(binaryTransform?.buccalPoint)) return binaryTransform.buccalPoint;

  if (!candidate || typeof candidate !== "object") return null;
  const gingivalPoint = toPointObject(candidate.gingival_point ?? candidate.gingivalPoint);
  if (looksLikeModelPosition(gingivalPoint)) return gingivalPoint;

  const buccalPoint = toPointObject(candidate.buccal_point ?? candidate.buccalPoint);
  if (looksLikeModelPosition(buccalPoint)) return buccalPoint;

  // Tooth_Transformation_Interface order from C#:
  // [0] buccal_direction, [1] mesial_distal_line, [2] buccal_point,
  // [3] gingival_point, [4] mesial_distal_sizing.
  const keyedGingival = getKeyedVector(candidate, 3);
  if (looksLikeModelPosition(keyedGingival)) return keyedGingival;

  const keyedBuccal = getKeyedVector(candidate, 2);
  if (looksLikeModelPosition(keyedBuccal)) return keyedBuccal;

  return null;
}

function looksLikeMeshBounds(points) {
  if (!points?.length) return false;
  const box = getPointBounds(points);
  const spans = [
    box.maxX - box.minX,
    box.maxY - box.minY,
    box.maxZ - box.minZ,
  ];
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
  const bytes = unwrapSerializedBuffer(candidate);
  if (!looksLikeByteArray(bytes) || bytes.length < 64) return null;
  const view = toDataView(bytes);
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
      x: readFloat64LE(view, offset),
      y: readFloat64LE(view, offset + 8),
      z: readFloat64LE(view, offset + 16),
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
    vertices,
    indices,
    source: "api-surface-mesh-binary",
    pointSize: pointCount,
    faceSize: faceCount,
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
  if (Array.isArray(candidate)) {
    return candidate.map(toPointObject).filter(isValidPoint);
  }
  if (typeof candidate !== "object") return [];

  const keys = ["points", "vertices", "coordinates", "coords", "positions", "data", "json"];
  for (const key of keys) {
    const points = extractPointArray(candidate[key]);
    if (points.length) return points;
  }
  return [];
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
    rawMessagePack: candidate,
  };
  mapped.teeth = createToothRecordsFromCraftMaps(mapped);
  return mapped;
}

function mapGuideLinesData(candidate) {
  if (!candidate) return null;
  return {
    buccalLineEditorData_: keyedValue(candidate, 0),
    gingivalLineEditorData_: keyedValue(candidate, 1),
    rawMessagePack: candidate,
  };
}

function mapStageDataManager(candidate) {
  if (!candidate) return null;
  return {
    ToothSelectionData_: keyedValue(candidate, 0),
    guideLinesDataUpperJaw_: mapGuideLinesData(keyedValue(candidate, 1)),
    toothCraftDataUpperJaw_: mapToothCraftData(keyedValue(candidate, 3)),
    guideLinesDataLowerJaw_: mapGuideLinesData(keyedValue(candidate, 4)),
    toothCraftDataLowerJaw_: mapToothCraftData(keyedValue(candidate, 5)),
    rawMessagePack: candidate,
  };
}

function findToothPlacementPayload(candidate, seen = new Set()) {
  if (!candidate) return null;
  if (looksLikeByteArray(candidate) || typeof candidate === "string") return candidate;
  if (typeof candidate !== "object" || seen.has(candidate)) return null;
  seen.add(candidate);

  const directPayload =
    candidate.data ??
    candidate.Data ??
    candidate.toothPlacementData ??
    candidate.tooth_placement_data;
  if (directPayload) return directPayload;

  if (Array.isArray(candidate)) {
    for (const entry of candidate) {
      const payload = findToothPlacementPayload(entry, seen);
      if (payload) return payload;
    }
    return null;
  }

  for (const value of Object.values(candidate)) {
    const payload = findToothPlacementPayload(value, seen);
    if (payload) return payload;
  }
  return null;
}

function decodeToothPlacementData(rawResponse) {
  const payload = findToothPlacementPayload(rawResponse);
  if (!payload) return null;

  try {
    const decoded = decodeMessagePack(payload);
    return mapStageDataManager(decoded);
  } catch (error) {
    console.warn("[artificial teeth] Unable to decode ToothPlacementData.data.", error);
    return null;
  }
}

function decodeArtificialToothText(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const detectionPattern =
    /artificial\s*teeth|denture\s*teeth|replacement\s*teeth|tooth|teeth|jaw|position/i;

  try {
    const decoded = atob(value.trim());
    if (detectionPattern.test(decoded)) return decoded;
  } catch {
    // Keep going: the payload may already be plain text.
  }

  return detectionPattern.test(value) ? value : "";
}

function getToothIndex(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
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
  return value === undefined || value === null ? null : String(value);
}

function getToothPosition(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const interfacePosition = getToothInterfacePosition(candidate);
  if (isValidPoint(interfacePosition)) return interfacePosition;

  const direct = toPointObject(candidate);
  if (looksLikeModelPosition(direct)) return direct;

  for (const key of ["position", "pos", "translation", "localPosition", "center", "origin", "location"]) {
    const point = toPointObject(candidate[key]);
    if (looksLikeModelPosition(point)) return point;
  }

  for (const key of [3, 2, 5]) {
    const point = getKeyedVector(candidate, key);
    if (looksLikeModelPosition(point)) return point;
  }

  const transform =
    candidate.transform ??
    candidate.localTransform ??
    candidate.toothTransform ??
    candidate.toothTransformInterfaceData_;
  return transform && typeof transform === "object" ? getToothPosition(transform) : null;
}

function getToothScale(candidate) {
  const binaryTransform = extractBinaryTransformSummary(candidate);
  if (
    binaryTransform?.mesialDistalSizing &&
    binaryTransform.mesialDistalSizing > 0 &&
    binaryTransform.mesialDistalSizing < 100
  ) {
    const value = Math.max(0.65, Math.min(2.4, binaryTransform.mesialDistalSizing / 4));
    return { x: value, y: value, z: value };
  }

  if (!candidate || typeof candidate !== "object") return null;
  const sizing = Number(
    candidate.mesial_distal_sizing ??
      candidate.mesialDistalSizing ??
      keyedValue(candidate, 4)
  );
  if (Number.isFinite(sizing) && sizing > 0 && sizing < 1000) {
    return { x: sizing, y: sizing, z: sizing };
  }

  const point = toPointObject(candidate.scale ?? candidate.localScale ?? candidate.size ?? candidate.dimensions);
  if (isValidPoint(point)) return point;

  for (const key of [2, 3, 4, 5, 6]) {
    const keyed = getKeyedVector(candidate, key);
    if (isValidPoint(keyed) && [keyed.x, keyed.y, keyed.z].every((value) => value > 0 && value < 1000)) {
      return keyed;
    }
  }

  const x = Number(candidate.scaleX ?? candidate.scale_x ?? candidate.width);
  const y = Number(candidate.scaleY ?? candidate.scale_y ?? candidate.height);
  const z = Number(candidate.scaleZ ?? candidate.scale_z ?? candidate.depth);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function getToothRotation(candidate) {
  const binaryTransform = extractBinaryTransformSummary(candidate);
  if (isValidPoint(binaryTransform?.buccalDirection) && isValidPoint(binaryTransform?.mesialDistalLine)) {
    return {
      x: Math.atan2(binaryTransform.buccalDirection.y, binaryTransform.buccalDirection.z),
      y: Math.atan2(binaryTransform.buccalDirection.x, binaryTransform.buccalDirection.z),
      z: Math.atan2(binaryTransform.mesialDistalLine.y, binaryTransform.mesialDistalLine.x),
    };
  }

  if (!candidate || typeof candidate !== "object") return null;
  const buccalDirection = toPointObject(candidate.buccal_direction ?? candidate.buccalDirection);
  const mesialDistalLine = toPointObject(candidate.mesial_distal_line ?? candidate.mesialDistalLine);
  if (isValidPoint(buccalDirection) && isValidPoint(mesialDistalLine)) {
    return {
      x: Math.atan2(buccalDirection.y, buccalDirection.z),
      y: Math.atan2(buccalDirection.x, buccalDirection.z),
      z: Math.atan2(mesialDistalLine.y, mesialDistalLine.x),
    };
  }

  const keyedBuccalDirection = getKeyedVector(candidate, 0);
  const keyedMesialDistalLine = getKeyedVector(candidate, 1);
  if (isValidPoint(keyedBuccalDirection) && isValidPoint(keyedMesialDistalLine)) {
    return {
      x: Math.atan2(keyedBuccalDirection.y, keyedBuccalDirection.z),
      y: Math.atan2(keyedBuccalDirection.x, keyedBuccalDirection.z),
      z: Math.atan2(keyedMesialDistalLine.y, keyedMesialDistalLine.x),
    };
  }

  const point = toPointObject(
    candidate.rotation ??
      candidate.euler ??
      candidate.eulerAngles ??
      candidate.localEulerAngles ??
      candidate.rot
  );
  if (isValidPoint(point)) return point;

  for (const key of [1, 2, 3, 4, 5]) {
    const keyed = getKeyedVector(candidate, key);
    if (isValidPoint(keyed)) return keyed;
  }

  const x = Number(candidate.rotationX ?? candidate.rot_x ?? candidate.rx);
  const y = Number(candidate.rotationY ?? candidate.rot_y ?? candidate.ry);
  const z = Number(candidate.rotationZ ?? candidate.rot_z ?? candidate.rz);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
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

function normalizeToothIndices(indices, expectedLength = null, vertexCount = null) {
  if (!indices?.length || indices.length < 3) return null;
  const trimmed = expectedLength && indices.length >= expectedLength
    ? indices.slice(0, expectedLength)
    : indices;
  if (vertexCount && trimmed.some((index) => index < 0 || index >= vertexCount)) return null;
  return trimmed.length >= 3 ? trimmed : null;
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

function getToothGeometryData(candidate) {
  const binarySurfaceMesh = decodeBinarySurfaceMesh(candidate);
  if (binarySurfaceMesh) return binarySurfaceMesh;

  candidate = decodeSerializedWrapper(candidate);
  if (looksLikeByteArray(candidate)) return null;
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
  const expectedFaceCount = Number.isInteger(faceSize) && faceSize > 0 ? faceSize : null;
  const expectedIndexCount = expectedFaceCount ? expectedFaceCount * 3 : null;

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
  let points = [];
  for (const vertexCandidate of vertexCandidates) {
    points = extractVertexArray(vertexCandidate, expectedPointCount);
    if (points.length >= 12 && looksLikeMeshBounds(points)) break;
  }
  if (points.length < 12 || !looksLikeMeshBounds(points)) return null;

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
    indices = parseToothIndices(indexCandidate, expectedIndexCount, points.length);
    if (indices?.length >= 3) break;
  }

  return {
    vertices: points,
    indices,
    source: "api-mesh-vertices",
    pointSize: expectedPointCount,
    faceSize: expectedFaceCount,
    bounds: getPointBounds(points),
    center: getPointBoundsCenter(points),
  };
}

// [Decoder 3] Synthesize tooth records by merging metadata, transform, and surface dictionaries.
function addNestedValues(candidate, output, seen = new Set(), depth = 0) {
  if (!candidate || typeof candidate !== "object" || depth > 5 || seen.has(candidate)) {
    return;
  }
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

function getDeepToothPosition(...sources) {
  for (const source of sources) {
    const direct = getToothPosition(source);
    if (isValidPoint(direct)) return direct;
  }

  const nested = [];
  sources.forEach((source) => addNestedValues(source, nested));
  for (const candidate of nested) {
    const point = toPointObject(candidate);
    if (isValidPoint(point)) return point;
  }
  return null;
}

function getDeepToothRotation(...sources) {
  for (const source of sources) {
    const direct = getToothRotation(source);
    if (isValidPoint(direct)) return direct;
  }
  return null;
}

function getDeepToothScale(...sources) {
  for (const source of sources) {
    const direct = getToothScale(source);
    if (isValidPoint(direct)) return direct;
  }
  return null;
}

function getDeepToothGeometry(...sources) {
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
  ].forEach((dict) => {
    Object.keys(dict || {}).forEach((key) => keys.add(key));
  });

  return Array.from(keys).flatMap((key) => {
    const toothData = craftData.toothData_?.[key];
    const transformData =
      craftData.toothTransformInterfaceData_?.[key] ??
      craftData.initialToothTransformInterfaceData_?.[key];
    const surfaceData =
      craftData.toothSurfaceMeshData_?.[key] ??
      craftData.initialToothSurfaceMeshData_?.[key];
    const source = { toothData, transformData, surfaceData };
    const position = getDeepToothPosition(transformData, toothData);
    const geometry = getDeepToothGeometry(surfaceData);

    if (!position && !geometry) return [];

    return [{
      toothIndex: getToothIndex(toothData) ?? key,
      position: position || { x: 0, y: 0, z: 0 },
      rotation: getDeepToothRotation(transformData, toothData),
      scale: getDeepToothScale(transformData, toothData),
      geometry,
      source,
    }];
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
  return Object.fromEntries(
    keys.slice(0, 8).map((key) => [key, describeValueShape(value[key], depth + 1)])
  );
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
      return [
        name,
        {
          count: keys.length,
          keys: keys.slice(0, 12),
          firstShape: keys.length ? describeValueShape(dict[keys[0]]) : null,
        },
      ];
    })
  );
}

function summarizeDecodedStageData(decodedStageData) {
  return {
    upper: summarizeCraftData(decodedStageData?.toothCraftDataUpperJaw_),
    lower: summarizeCraftData(decodedStageData?.toothCraftDataLowerJaw_),
  };
}

function summarizeToothRenderData(toothByJaw) {
  const summarizeJaw = (teeth = []) => ({
    total: teeth.length,
    apiMesh: teeth.filter((tooth) => tooth.geometry?.vertices?.length >= 3).length,
    fallback: teeth.filter((tooth) => !tooth.geometry?.vertices?.length).length,
    vertices: teeth.reduce((sum, tooth) => sum + (tooth.geometry?.vertices?.length ?? 0), 0),
    indexed: teeth.filter((tooth) => tooth.geometry?.indices?.length >= 3).length,
    firstApiMesh: teeth.find((tooth) => tooth.geometry?.vertices?.length >= 3)
      ? {
          toothIndex: teeth.find((tooth) => tooth.geometry?.vertices?.length >= 3)?.toothIndex,
          vertexCount: teeth.find((tooth) => tooth.geometry?.vertices?.length >= 3)?.geometry?.vertices?.length,
          indexCount: teeth.find((tooth) => tooth.geometry?.vertices?.length >= 3)?.geometry?.indices?.length ?? 0,
          center: getPointBoundsCenter(teeth.find((tooth) => tooth.geometry?.vertices?.length >= 3)?.geometry?.vertices),
        }
      : null,
  });
  return {
    upper: summarizeJaw(toothByJaw.upper),
    lower: summarizeJaw(toothByJaw.lower),
  };
}

function distanceBetweenPoints(a, b) {
  if (!isValidPoint(a) || !isValidPoint(b)) return 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function extractPointSets(candidate, output = [], seen = new Set(), depth = 0) {
  if (!candidate || depth > 8) return output;
  if (typeof candidate === "object") {
    if (seen.has(candidate)) return output;
    seen.add(candidate);
  }

  const points = extractPointArray(candidate);
  if (points.length >= 6 && looksLikeMeshBounds(points)) {
    output.push(points);
  }

  if (Array.isArray(candidate)) {
    if (!isByteArray(candidate)) {
      candidate.forEach((entry) => extractPointSets(entry, output, seen, depth + 1));
    }
    return output;
  }

  if (typeof candidate === "object") {
    Object.values(candidate).forEach((value) => extractPointSets(value, output, seen, depth + 1));
  }
  return output;
}

function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distanceBetweenPoints(points[index - 1], points[index]);
  }
  return length;
}

function samplePolyline(points, t) {
  if (!points?.length) return null;
  if (points.length === 1) return points[0];
  const total = polylineLength(points);
  if (!total) return points[Math.floor(t * (points.length - 1))];

  let target = total * Math.max(0, Math.min(1, t));
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segment = distanceBetweenPoints(start, end);
    if (target <= segment || index === points.length - 1) {
      const ratio = segment ? target / segment : 0;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
        z: start.z + (end.z - start.z) * ratio,
      };
    }
    target -= segment;
  }
  return points[points.length - 1];
}

function getGuidelinePoints(guideData) {
  if (!guideData) return [];
  const pointSets = extractPointSets(guideData)
    .filter((points) => points.length >= 6)
    .sort((a, b) => polylineLength(b) - polylineLength(a));
  return pointSets[0] || [];
}

function getPolylineAttributePoints(positionAttribute) {
  if (!positionAttribute?.count) return [];
  const points = [];
  for (let index = 0; index < positionAttribute.count; index += 1) {
    points.push({
      x: positionAttribute.getX(index),
      y: positionAttribute.getY(index),
      z: positionAttribute.getZ(index),
    });
  }
  return points.filter(isValidPoint);
}

function getRenderedPolylineJawlinePoints(scene, arch) {
  const candidates = [];
  scene.traverse((child) => {
    if (child.userData?.overlayType !== "polyline") return;
    if (child.userData?.arch !== arch) return;

    const component = String(child.userData?.component || "");
    const points = getPolylineAttributePoints(child.userData?.positionAttribute);
    if (points.length < 6 || !looksLikeMeshBounds(points)) return;

    const priority =
      /gingival/i.test(component) ? 4 :
        /reversal/i.test(component) ? 3 :
          /major/i.test(component) ? 2 :
            1;
    candidates.push({ points, priority, length: polylineLength(points), component });
  });

  candidates.sort((a, b) => b.priority - a.priority || b.length - a.length);
  return candidates[0]?.points || [];
}

function positionSpread(points) {
  if (!points.length) return 0;
  const box = points.reduce(
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
  return Math.max(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ);
}

function shouldUseGuidelinePlacement(teeth, guidelinePoints) {
  if (!teeth.length || guidelinePoints.length < 6) return false;
  const positions = teeth.map((tooth) => tooth.position).filter(isValidPoint);
  if (positions.length !== teeth.length) return true;
  const toothSpread = positionSpread(positions);
  const lineSpread = positionSpread(guidelinePoints);
  return toothSpread < Math.max(3, lineSpread * 0.12);
}

function toothSortValue(tooth, index) {
  const numeric = Number(String(tooth.toothIndex ?? "").match(/\d+/)?.[0]);
  return Number.isFinite(numeric) ? numeric : index;
}

function sortTeethLinearly(teeth) {
  return [...teeth].sort((a, b) => toothSortValue(a, 0) - toothSortValue(b, 0));
}

function placeTeethOnGuideline(teeth, guideData, arch, scene = null) {
  const renderedPolylinePoints = scene ? getRenderedPolylineJawlinePoints(scene, arch) : [];
  const guidelinePoints = renderedPolylinePoints.length
    ? renderedPolylinePoints
    : getGuidelinePoints(guideData);
  if (!shouldUseGuidelinePlacement(teeth, guidelinePoints)) return teeth;

  const sorted = sortTeethLinearly(teeth);
  const count = sorted.length;
  const placed = sorted.map((tooth, index) => {
    const t = count === 1 ? 0.5 : 0.08 + (index / (count - 1)) * 0.84;
    const position = samplePolyline(guidelinePoints, arch === "upper" ? 1 - t : t);
    return position
      ? {
          ...tooth,
          position,
          source: { ...tooth.source, guidelinePlaced: true },
        }
      : tooth;
  });

  console.log("[artificial teeth] placed teeth along API guideline", {
    arch,
    teeth: placed.length,
    guidelinePoints: guidelinePoints.length,
    source: renderedPolylinePoints.length ? "rendered-polyline" : "decoded-guideline",
  });
  return placed;
}

function createToothRecord(candidate, jawHint = null) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;

  const position = getToothPosition(candidate);
  const geometry = getToothGeometryData(candidate);
  if (!position && !geometry) return null;

  return {
    arch:
      normalizeJawKey(
        candidate.jaw ??
          candidate.jaw_type ??
          candidate.jawType ??
          candidate.arch ??
          candidate.type ??
          candidate.name
      ) || jawHint,
    toothIndex: getToothIndex(candidate),
    position: position || { x: 0, y: 0, z: 0 },
    rotation: getToothRotation(candidate),
    scale: getToothScale(candidate),
    geometry,
    source: candidate,
  };
}

function parseToothText(value, jawHint = null) {
  const text = decodeArtificialToothText(value);
  if (!text) return [];

  const records = [];
  const numberPattern = /[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  let currentJaw = jawHint;
  let currentToothIndex = null;

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const jawMatch = line.match(/\b(upper|lower|maxillary|mandibular)\b/i);
    if (jawMatch) currentJaw = normalizeJawKey(jawMatch[1]);

    const toothMatch = line.match(/\b(?:tooth|index|id|number)\s*[:=]\s*([-\w]+)/i);
    if (toothMatch) currentToothIndex = toothMatch[1];

    if (!/^[\s+\-.0-9eE,;|]+$/.test(line)) return;
    const numbers = line.match(numberPattern)?.map(Number) || [];
    const hasSentinel = numbers.some((coord) => !Number.isFinite(coord) || Math.abs(coord + 9e91) < 1e80);
    if (numbers.length < 3 || hasSentinel) return;

    const coords = numbers.slice(-3);
    records.push({
      arch: currentJaw,
      toothIndex: currentToothIndex || (numbers.length >= 4 ? String(numbers[0]) : null),
      position: { x: coords[0], y: coords[1], z: coords[2] },
      rotation: null,
      scale: null,
      geometry: null,
      source: line,
    });
  });

  return records.slice(0, 64);
}

function extractToothRecords(candidate, jawHint = null, seen = new Set()) {
  if (!candidate) return [];
  if (seen.has(candidate)) return [];
  if (typeof candidate === "object") seen.add(candidate);

  if (typeof candidate === "string") {
    const textRecords = parseToothText(candidate, jawHint);
    if (textRecords.length) return textRecords;
    try {
      return extractToothRecords(JSON.parse(candidate), jawHint, seen);
    } catch {
      return [];
    }
  }

  if (Array.isArray(candidate)) {
    if (candidate.every((entry) => typeof entry === "number")) return [];
    return candidate.flatMap((entry) => extractToothRecords(entry, jawHint, seen));
  }

  if (typeof candidate !== "object") return [];

  const inferredJaw =
    normalizeJawKey(
      candidate.jaw ??
        candidate.jaw_type ??
        candidate.jawType ??
        candidate.arch ??
        candidate.type ??
        candidate.name
    ) || jawHint;
  const directRecord = createToothRecord(candidate, inferredJaw);
  if (directRecord) return [directRecord];

  const nestedKeys = [
    "artificialTeeth",
    "artificial_teeth",
    "dentureTeeth",
    "denture_teeth",
    "replacementTeeth",
    "replacement_teeth",
    "teeth",
    "tooth",
    "toothData_",
    "toothData",
    "toothSurfaceMeshData_",
    "toothTransformInterfaceData_",
    "toothCraftDataUpperJaw_",
    "toothCraftDataLowerJaw_",
    "upper",
    "lower",
    "upperJaw",
    "lowerJaw",
    "upper_jaw",
    "lower_jaw",
    "data",
    "json",
  ];

  const nestedRecords = nestedKeys.flatMap((key) => {
    if (!(key in candidate)) return [];
    const nextJaw = key.toLowerCase().includes("upper")
      ? "upper"
      : key.toLowerCase().includes("lower")
        ? "lower"
        : inferredJaw;
    return extractToothRecords(candidate[key], nextJaw, seen);
  });

  if (nestedRecords.length) return nestedRecords;

  return Object.entries(candidate).flatMap(([key, value]) => {
    if (!value || typeof value !== "object") return [];
    if (!/^\d+$|tooth|teeth|jaw|upper|lower/i.test(key) && !inferredJaw) return [];
    return extractToothRecords(value, inferredJaw, seen);
  });
}

function isAnteriorTooth(toothIndex) {
  const digits = String(toothIndex || "").match(/\d+/)?.[0];
  if (!digits) return false;
  const value = Number(digits);
  if (value >= 0 && value <= 15) return value >= 5 && value <= 10;
  const lastDigit = value % 10;
  return (value >= 6 && value <= 11) || (lastDigit >= 1 && lastDigit <= 3);
}

function getToothTemplate(toothIndex) {
  const digits = String(toothIndex || "").match(/\d+/)?.[0];
  if (!digits) return "premolar";
  const value = Number(digits);
  const normalized = value >= 0 && value <= 15 ? value : ((value % 10) + 10) % 10;
  if (normalized === 7 || normalized === 8) return "central-incisor";
  if (normalized === 6 || normalized === 9) return "lateral-incisor";
  if (normalized === 5 || normalized === 10) return "canine";
  if (normalized === 4 || normalized === 11 || normalized === 3 || normalized === 12) return "premolar";
  return "molar";
}

function getToothTemplateScaleFactor(template) {
  return {
    "central-incisor": 1.18,
    "lateral-incisor": 1.03,
    canine: 1.16,
    premolar: 1.25,
    molar: 1.42,
  }[template] || 1;
}

function createProceduralToothGeometry(tooth) {
  const template = getToothTemplate(tooth.toothIndex);
  const anterior = template.includes("incisor") || template === "canine";
  const canine = template === "canine";
  const premolar = template === "premolar";
  const molar = template === "molar";
  const geometry = new THREE.SphereGeometry(1, 64, 40);
  const position = geometry.attributes.position;

  for (let index = 0; index < position.count; index += 1) {
    let x = position.getX(index);
    let y = position.getY(index);
    let z = position.getZ(index);
    const crownT = (y + 1) / 2;
    const neckTaper = y < -0.22 ? 0.68 + crownT * 0.42 : 1;

    if (anterior) {
      const pointLift = canine ? Math.exp(-(x ** 2) * 9) * Math.max(0, y) * 0.18 : 0;
      const incisalFlatten = canine
        ? y > 0.32 ? 0.32 + (y - 0.32) * 0.34 + pointLift : y
        : y > 0.46 ? 0.46 + (y - 0.46) * 0.1 : y;
      const labialBulge = 1 + (canine ? 0.28 : 0.22) * Math.max(0, z) * (1 - Math.abs(y) * 0.35);
      const lingualHollow = z < 0 ? 1 - (canine ? 0.12 : 0.08) * Math.max(0, y + 0.2) : 1;
      const edgeNotch = !canine && y > 0.42 ? 0.025 * Math.cos(x * Math.PI * 3) : 0;
      const centralRidge = Math.exp(-(x ** 2) * (canine ? 18 : 12)) * Math.max(0, y + 0.2) * (canine ? 0.075 : 0.035);
      x *= neckTaper * ((canine ? 1.02 : 1.12) - 0.08 * Math.max(0, y));
      y = incisalFlatten - edgeNotch + centralRidge;
      z *= neckTaper * labialBulge * lingualHollow * (canine ? 1.02 : 0.92);
    } else {
      const occlusal = Math.max(0, y);
      const table = y > 0.28 ? 0.28 + (y - 0.28) * (premolar ? 0.26 : 0.2) : y;
      const spreadX = molar ? 0.54 : 0.36;
      const spreadZ = molar ? 0.42 : 0.28;
      const cusp1 = Math.exp(-((x - spreadX) ** 2 + (z - spreadZ) ** 2) * (premolar ? 12 : 9));
      const cusp2 = Math.exp(-((x + spreadX) ** 2 + (z - spreadZ) ** 2) * (premolar ? 12 : 9));
      const cusp3 = molar ? Math.exp(-((x - 0.42) ** 2 + (z + 0.36) ** 2) * 9) : 0;
      const cusp4 = molar ? Math.exp(-((x + 0.42) ** 2 + (z + 0.36) ** 2) * 9) : 0;
      const centralGroove = Math.exp(-(z ** 2) * (premolar ? 36 : 24)) * Math.max(0, 1 - Math.abs(x) * 0.75);
      const sideGroove = molar ? Math.exp(-(x ** 2) * 18) * Math.max(0, 1 - Math.abs(z) * 0.8) : 0;
      const cuspLift = (cusp1 + cusp2 + cusp3 + cusp4) * (premolar ? 0.18 : 0.16);
      const grooveDrop = (centralGroove + sideGroove) * (premolar ? 0.1 : 0.13);
      x *= neckTaper * ((premolar ? 1.18 : 1.42) - 0.05 * occlusal);
      y = table + occlusal * (cuspLift - grooveDrop);
      z *= neckTaper * ((premolar ? 1.08 : 1.32) - 0.04 * occlusal);
    }

    position.setXYZ(index, x, y, z);
  }

  const scaleByTemplate = {
    "central-incisor": [1.22, 1.5, 0.95],
    "lateral-incisor": [1.05, 1.38, 0.88],
    canine: [1.12, 1.58, 1.02],
    premolar: [1.48, 1.18, 1.18],
    molar: [2.18, 1.04, 1.58],
  }[template];
  geometry.scale(scaleByTemplate[0], scaleByTemplate[1], scaleByTemplate[2]);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData = {
    artificialToothGeometrySource: "procedural-fallback",
    toothTemplate: template,
    vertexCount: geometry.attributes.position.count,
    indexCount: geometry.index?.count ?? 0,
  };
  return geometry;
}

function createDetailTube(points, radius = 0.025) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(point.x, point.y, point.z)));
  return new THREE.TubeGeometry(curve, Math.max(2, points.length * 3), radius, 6, false);
}

export function createArtificialTeethRenderer({ scene, parentObject, camera = null, apiClient, onStatus = null }) {
  const group = new THREE.Group();
  group.name = "artificial-tooth-overlay-group";
  scene.add(group);
  let lastNormalizedTeeth = { upper: [], lower: [] };
  const storedReferenceMode = localStorage.getItem("artificialTeethReferenceMode");
  let referenceMode = storedReferenceMode === "scene-world" ? "scene-world" : "jaw-local";
  let meshOnlyMode = false;
  let vertexDebugMode = localStorage.getItem("artificialTeethVertexDebug") === "true";

  const jawVisibility = new Map([
    ["upper", true],
    ["lower", true],
  ]);
  let statusHideTimer = null;
  const material = new THREE.MeshStandardMaterial({
    color: 0xe5e87c,
    roughness: 0.38,
    metalness: 0,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const vertexDebugMaterial = new THREE.PointsMaterial({
    color: 0xff2d55,
    size: 1.8,
    sizeAttenuation: true,
    depthTest: true,
    depthWrite: false,
  });
  const guidelineMaterial = new THREE.MeshStandardMaterial({
    color: 0xff9f1c,
    roughness: 0.25,
    metalness: 0,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const grooveMaterial = new THREE.MeshStandardMaterial({
    color: 0xc6b84e,
    roughness: 0.6,
    metalness: 0,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const getStatusElement = () => {
    let wrapper = document.getElementById("artificial-teeth-loading-status");
    if (wrapper) return wrapper;

    wrapper = document.createElement("div");
    wrapper.id = "artificial-teeth-loading-status";
    wrapper.style.position = "fixed";
    wrapper.style.right = "20px";
    wrapper.style.bottom = "184px";
    wrapper.style.zIndex = "1000";
    wrapper.style.width = "190px";
    wrapper.style.padding = "9px 10px";
    wrapper.style.borderRadius = "7px";
    wrapper.style.background = "rgba(31, 41, 55, 0.9)";
    wrapper.style.color = "#fff";
    wrapper.style.font = "12px Arial, sans-serif";
    wrapper.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.2)";
    wrapper.style.display = "none";

    const label = document.createElement("div");
    label.dataset.role = "label";
    label.textContent = "Artificial teeth";
    label.style.fontWeight = "700";
    label.style.marginBottom = "7px";

    const bar = document.createElement("div");
    bar.style.height = "6px";
    bar.style.borderRadius = "999px";
    bar.style.overflow = "hidden";
    bar.style.background = "rgba(255, 255, 255, 0.22)";

    const fill = document.createElement("div");
    fill.dataset.role = "fill";
    fill.style.width = "0%";
    fill.style.height = "100%";
    fill.style.background = "#e5e87c";
    fill.style.transition = "width 0.25s ease";
    bar.appendChild(fill);

    wrapper.appendChild(label);
    wrapper.appendChild(bar);
    document.body.appendChild(wrapper);
    return wrapper;
  };

  const setStatus = (label, progress = 0.1, autoHide = false) => {
    if (typeof document === "undefined") return;
    if (typeof onStatus === "function") {
      onStatus(label, progress, autoHide);
      return;
    }
    const wrapper = getStatusElement();
    const labelNode = wrapper.querySelector("[data-role='label']");
    const fillNode = wrapper.querySelector("[data-role='fill']");
    wrapper.style.display = "block";
    labelNode.textContent = label;
    fillNode.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
    window.clearTimeout(statusHideTimer);
    if (autoHide) {
      statusHideTimer = window.setTimeout(() => {
        wrapper.style.display = "none";
      }, 2200);
    }
  };

  const getLoadedJawKeys = () => {
    const keys = new Set();
    parentObject.children.forEach((child) => {
      const jawKey = normalizeJawKey(child.userData?.jaw_type ?? child.name);
      if (jawKey) keys.add(jawKey);
    });
    return Array.from(keys);
  };

  const getJawMesh = (jawType) => {
    const jawText = jawType.toLowerCase();
    return parentObject.children.find((child) => {
      const type = String(child.userData?.jaw_type || child.name || "").toLowerCase();
      return type.includes(jawText);
    });
  };

  const applyJawTransform = (target, jawType) => {
    const jawMesh = getJawMesh(jawType);
    if (!jawMesh) return;
    target.position.copy(jawMesh.position);
    target.rotation.copy(jawMesh.rotation);
    target.scale.copy(jawMesh.scale);
  };

  const attachRootGroup = () => {
    const useParentObject = referenceMode === "parent-local";
    const targetParent = useParentObject ? parentObject : scene;
    if (group.parent !== targetParent) {
      group.parent?.remove(group);
      targetParent.add(group);
    }
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);
  };

  const shouldApplyJawTransform = () => referenceMode !== "scene-world";

  const getClosestJawSurfacePoint = (jawType, point) => {
    const jawMesh = getJawMesh(jawType);
    const position = jawMesh?.geometry?.attributes?.position;
    if (!position || !isValidPoint(point)) return null;

    let bestPoint = null;
    let bestDistanceSq = Infinity;
    const stride = Math.max(1, Math.floor(position.count / 25000));

    for (let index = 0; index < position.count; index += stride) {
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      const dx = point.x - x;
      const dy = point.y - y;
      const dz = point.z - z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestPoint = { x, y, z };
      }
    }

    return bestPoint;
  };

  const getGeometryRadius = (tooth) => {
    if (tooth.geometry?.vertices?.length) {
      const center = tooth.geometry.vertices.reduce(
        (acc, point) => ({
          x: acc.x + point.x,
          y: acc.y + point.y,
          z: acc.z + point.z,
        }),
        { x: 0, y: 0, z: 0 }
      );
      center.x /= tooth.geometry.vertices.length;
      center.y /= tooth.geometry.vertices.length;
      center.z /= tooth.geometry.vertices.length;
      return Math.max(
        1,
        Math.min(
          8,
          tooth.geometry.vertices.reduce(
            (maxDistance, point) => Math.max(maxDistance, distanceBetweenPoints(center, point)),
            0
          )
        )
      );
    }
    return isAnteriorTooth(tooth.toothIndex) ? 2.5 : 3.2;
  };

  const snapTeethToJawSurface = (teeth, jawType) => {
    const snapped = teeth.map((tooth) => {
      const geometryCenter = getPointBoundsCenter(tooth.geometry?.vertices);
      const referencePoint = looksLikeModelPosition(tooth.position)
        ? tooth.position
        : geometryCenter;

      const surfacePoint = getClosestJawSurfacePoint(jawType, referencePoint);
      if (!surfacePoint) return tooth;

      const fromSurface = {
        x: referencePoint.x - surfacePoint.x,
        y: referencePoint.y - surfacePoint.y,
        z: referencePoint.z - surfacePoint.z,
      };
      const length = Math.max(0.0001, Math.sqrt(
        fromSurface.x * fromSurface.x +
        fromSurface.y * fromSurface.y +
        fromSurface.z * fromSurface.z
      ));
      const offset = Math.max(1.2, getGeometryRadius(tooth) * 0.35);
      const surfaceOffset = length < 0.0002
        ? { x: 0, y: jawType === "upper" ? -1 : 1, z: 0 }
        : {
            x: fromSurface.x / length,
            y: fromSurface.y / length,
            z: fromSurface.z / length,
          };
      const position = {
        x: surfacePoint.x + surfaceOffset.x * offset,
        y: surfacePoint.y + surfaceOffset.y * offset,
        z: surfacePoint.z + surfaceOffset.z * offset,
      };

      return {
        ...tooth,
        position,
        source: { ...tooth.source, jawSurfaceSnapped: true },
      };
    });

    if (snapped.length) {
      console.log("[artificial teeth] snapped teeth to jaw surface", {
        arch: jawType,
        teeth: snapped.length,
      });
    }
    return snapped;
  };

  const isJawVisible = (arch) => jawVisibility.get(arch) ?? true;

  const syncVisibility = () => {
    group.visible = true;
    group.children.forEach((child) => {
      const arch = child.userData?.arch;
      child.visible = arch ? isJawVisible(arch) : true;
    });
  };

  const reveal = () => {
    jawVisibility.set("upper", true);
    jawVisibility.set("lower", true);
    group.visible = true;
    group.traverse((child) => {
      if (
        child.userData?.overlayType === "artificial-teeth" ||
        child.userData?.overlayType === "artificial-tooth" ||
        child.userData?.overlayType === "artificial-teeth-guideline" ||
        child.userData?.overlayType === "artificial-tooth-vertices"
      ) {
        child.visible = true;
      }
    });
    syncVisibility();
  };

  const updateCameraVisibility = (viewerCamera = camera) => {
    if (!viewerCamera) return;
    syncVisibility();
  };

  const clear = () => {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      disposeObject3D(child);
    }
  };

  const normalizeResponse = (rawResponse) => {
    const normalized = { upper: [], lower: [] };
    const decodedStageData = decodeToothPlacementData(rawResponse);
    const records = extractToothRecords(decodedStageData || rawResponse);
    const loadedJawKeys = getLoadedJawKeys();
    const fallbackJaw = loadedJawKeys.length === 1 ? loadedJawKeys[0] : null;
    let skippedUnknownJaw = 0;

    records.forEach((record) => {
      const arch = record.arch || fallbackJaw;
      if (arch !== "upper" && arch !== "lower") {
        skippedUnknownJaw += 1;
        return;
      }
      if (!isValidPoint(record.position)) return;
      normalized[arch].push({ ...record, arch });
    });

    ["upper", "lower"].forEach((arch) => {
      normalized[arch] = normalized[arch].map((tooth) => {
        if (looksLikeModelPosition(tooth.position)) return tooth;
        const meshCenter = getPointBoundsCenter(tooth.geometry?.vertices);
        if (!looksLikeModelPosition(meshCenter)) return tooth;
        return {
          ...tooth,
          position: meshCenter,
          source: { ...tooth.source, meshCenterPosition: true },
        };
      });
    });

    if (skippedUnknownJaw) {
      console.warn(
        `[artificial teeth] Skipped ${skippedUnknownJaw} tooth record(s) without an upper/lower jaw.`
      );
    }

    if (decodedStageData) {
      normalized.upper = placeTeethOnGuideline(
        normalized.upper,
        decodedStageData.guideLinesDataUpperJaw_,
        "upper",
        scene
      );
      normalized.lower = placeTeethOnGuideline(
        normalized.lower,
        decodedStageData.guideLinesDataLowerJaw_,
        "lower",
        scene
      );
      window.lastDecodedToothPlacementData = decodedStageData;
      window.lastDecodedToothPlacementSummary = summarizeDecodedStageData(decodedStageData);
      console.log("[artificial teeth] decoded ToothPlacementData", {
        upperCraftTeeth: decodedStageData.toothCraftDataUpperJaw_?.teeth?.length ?? 0,
        lowerCraftTeeth: decodedStageData.toothCraftDataLowerJaw_?.teeth?.length ?? 0,
        extractedRecords: records.length,
        summary: window.lastDecodedToothPlacementSummary,
      });
    }

    return normalized;
  };

  const createGeometry = (tooth) => {
    if (tooth.geometry?.vertices?.length >= 3) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(tooth.geometry.vertices.length * 3);
      const sourceCenter = getPointBoundsCenter(tooth.geometry.vertices) || { x: 0, y: 0, z: 0 };
      const useAbsoluteGeometryCenter = looksLikeModelPosition(sourceCenter);
      tooth.geometry.vertices.forEach((point, index) => {
        positions[index * 3] = useAbsoluteGeometryCenter ? point.x - sourceCenter.x : point.x;
        positions[index * 3 + 1] = useAbsoluteGeometryCenter ? point.y - sourceCenter.y : point.y;
        positions[index * 3 + 2] = useAbsoluteGeometryCenter ? point.z - sourceCenter.z : point.z;
      });
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      if (tooth.geometry.indices?.length >= 3) {
        geometry.setIndex(tooth.geometry.indices);
      } else if (tooth.geometry.vertices.length % 3 !== 0) {
        console.warn("[artificial teeth] API mesh vertices had no triangle indices", {
          toothIndex: tooth.toothIndex,
          vertices: tooth.geometry.vertices.length,
        });
      }
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      geometry.userData = {
        ...geometry.userData,
        sourceCenter: useAbsoluteGeometryCenter ? sourceCenter : null,
        artificialToothGeometrySource: "api-mesh-vertices",
        vertexCount: tooth.geometry.vertices.length,
        indexCount: tooth.geometry.indices?.length ?? 0,
      };
      return geometry;
    }

    if (meshOnlyMode) {
      console.warn("[artificial teeth] mesh-only mode requested, but no API tooth mesh was available; using procedural fallback.");
    }

    // TODO: replace this procedural placeholder with the real tooth STL/OBJ/GLTF
    // asset once the production artificial-tooth asset format is available.
    return createProceduralToothGeometry(tooth);
  };

  const applyToothTransform = (mesh, tooth) => {
    const geometryCenter = mesh.geometry?.userData?.sourceCenter;
    const usesAbsoluteApiMesh = looksLikeModelPosition(geometryCenter);
    const hasSeatedPosition =
      tooth.source?.guidelinePlaced ||
      tooth.source?.jawSurfaceSnapped ||
      tooth.source?.linearGuidelinePlaced;
    const position = usesAbsoluteApiMesh && !hasSeatedPosition
      ? geometryCenter
      : tooth.position;
    mesh.position.set(position.x, position.y, position.z);
    if (usesAbsoluteApiMesh && !hasSeatedPosition) {
      mesh.userData.transformMode = "api-mesh-vertices-in-place";
      return;
    } else if (usesAbsoluteApiMesh) {
      mesh.userData.transformMode = "api-mesh-centered-on-seated-position";
    }

    if (tooth.rotation) {
      const values = [tooth.rotation.x, tooth.rotation.y, tooth.rotation.z];
      const useDegrees = values.some((value) => Math.abs(value) > Math.PI * 2);
      mesh.rotation.set(
        useDegrees ? THREE.MathUtils.degToRad(tooth.rotation.x) : tooth.rotation.x,
        useDegrees ? THREE.MathUtils.degToRad(tooth.rotation.y) : tooth.rotation.y,
        useDegrees ? THREE.MathUtils.degToRad(tooth.rotation.z) : tooth.rotation.z
      );
    }
    if (tooth.scale) {
      mesh.scale.multiply(new THREE.Vector3(tooth.scale.x, tooth.scale.y, tooth.scale.z));
    }
  };

  const createMesh = (jawType, tooth, toothIndex) => {
    const geometry = createGeometry(tooth);
    if (!geometry) return null;
    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.name = `${jawType}-artificial-tooth-${tooth.toothIndex ?? toothIndex}`;
    mesh.renderOrder = 12;
    mesh.userData = {
      overlayType: "artificial-tooth",
      selectable: true,
      arch: jawType,
      toothIndex: tooth.toothIndex ?? toothIndex,
      toothTemplate: tooth.toothTemplate ?? geometry.userData?.toothTemplate,
      source: tooth.source,
      geometrySource: geometry.userData?.artificialToothGeometrySource,
      vertexCount: geometry.userData?.vertexCount,
      indexCount: geometry.userData?.indexCount,
    };
    applyToothTransform(mesh, tooth);
    addProceduralToothDetails(mesh, tooth);
    return mesh;
  };

  const addProceduralToothDetails = (mesh, tooth) => {
    if (mesh.userData.geometrySource !== "procedural-fallback") return;

    const template = getToothTemplate(tooth.toothIndex);
    const detailGroup = new THREE.Group();
    detailGroup.name = `${mesh.name}-surface-details`;
    detailGroup.userData = {
      overlayType: "artificial-tooth-detail",
      arch: mesh.userData.arch,
      toothIndex: mesh.userData.toothIndex,
    };

    const detailSetsByTemplate = {
      "central-incisor": [
        [
          { x: 0, y: -0.55, z: 0.63 },
          { x: 0.02, y: -0.05, z: 0.7 },
          { x: 0.01, y: 0.58, z: 0.64 },
        ],
      ],
      "lateral-incisor": [
        [
          { x: -0.02, y: -0.5, z: 0.58 },
          { x: 0.04, y: 0.02, z: 0.65 },
          { x: 0.02, y: 0.5, z: 0.59 },
        ],
      ],
      canine: [
        [
          { x: 0, y: -0.58, z: 0.7 },
          { x: 0.02, y: 0.0, z: 0.82 },
          { x: 0, y: 0.72, z: 0.68 },
        ],
      ],
      premolar: [
        [
          { x: -0.55, y: 0.48, z: 0 },
          { x: -0.15, y: 0.36, z: 0.02 },
          { x: 0.15, y: 0.36, z: -0.02 },
          { x: 0.55, y: 0.48, z: 0 },
        ],
      ],
      molar: [
        [
          { x: -0.78, y: 0.42, z: 0 },
          { x: -0.25, y: 0.35, z: 0.03 },
          { x: 0.25, y: 0.35, z: -0.03 },
          { x: 0.78, y: 0.42, z: 0 },
        ],
        [
          { x: 0, y: 0.43, z: -0.55 },
          { x: 0.03, y: 0.35, z: -0.18 },
          { x: -0.03, y: 0.35, z: 0.18 },
          { x: 0, y: 0.43, z: 0.55 },
        ],
      ],
    };
    const detailSets = detailSetsByTemplate[template] || detailSetsByTemplate.premolar;

    detailSets.forEach((points, index) => {
      const detail = new THREE.Mesh(
        createDetailTube(points, template.includes("incisor") || template === "canine" ? 0.018 : 0.026),
        grooveMaterial.clone()
      );
      detail.name = `${mesh.name}-surface-detail-${index}`;
      detail.renderOrder = 14;
      detail.userData = detailGroup.userData;
      detailGroup.add(detail);
    });

    mesh.add(detailGroup);
  };

  const createVertexDebugPoints = (jawType, tooth, toothIndex) => {
    if (!vertexDebugMode || !tooth.geometry?.vertices?.length) return null;
    const geometry = createGeometry(tooth);
    if (!geometry) return null;
    const points = new THREE.Points(geometry, vertexDebugMaterial.clone());
    points.name = `${jawType}-artificial-tooth-${tooth.toothIndex ?? toothIndex}-vertices`;
    points.renderOrder = 11;
    points.userData = {
      overlayType: "artificial-tooth-vertices",
      arch: jawType,
      toothIndex: tooth.toothIndex ?? toothIndex,
      vertexCount: tooth.geometry.vertices.length,
    };
    applyToothTransform(points, tooth);
    return points;
  };

  const createGuidelineSegment = (jawType, start, end, edgeIndex) => {
    const startVector = new THREE.Vector3(start.x, start.y, start.z);
    const endVector = new THREE.Vector3(end.x, end.y, end.z);
    const length = startVector.distanceTo(endVector);
    if (!Number.isFinite(length) || length <= 0.001) return null;

    const geometry = new THREE.TubeGeometry(
      new THREE.LineCurve3(startVector, endVector),
      1,
      0.38,
      8,
      false
    );
    const tube = new THREE.Mesh(geometry, guidelineMaterial.clone());
    tube.name = `${jawType}-artificial-teeth-guideline-${edgeIndex}`;
    tube.renderOrder = 13;
    tube.userData = {
      overlayType: "artificial-teeth-guideline",
      arch: jawType,
      edgeIndex,
    };
    return tube;
  };

  const createGuidelineGroup = (jawType, teeth) => {
    const points = sortTeethLinearly(teeth)
      .map((tooth) => tooth.position)
      .filter(isValidPoint);
    if (points.length < 2) return null;

    const guidelineGroup = new THREE.Group();
    guidelineGroup.name = `${jawType}-artificial-teeth-linear-guideline`;
    guidelineGroup.userData = {
      overlayType: "artificial-teeth-guideline",
      arch: jawType,
      pointCount: points.length,
    };
    for (let index = 1; index < points.length; index += 1) {
      const segment = createGuidelineSegment(jawType, points[index - 1], points[index], index - 1);
      if (segment) guidelineGroup.add(segment);
    }
    return guidelineGroup.children.length ? guidelineGroup : null;
  };

  const renderData = (toothByJaw) => {
    lastNormalizedTeeth = toothByJaw;
    attachRootGroup();
    clear();
    window.lastArtificialTeethRenderSummary = summarizeToothRenderData(toothByJaw);
    console.log("[artificial teeth] render summary", window.lastArtificialTeethRenderSummary);
    jawVisibility.set("upper", true);
    jawVisibility.set("lower", true);
    const createdCounts = { upper: 0, lower: 0 };
    ["upper", "lower"].forEach((jawType) => {
      const teeth = toothByJaw[jawType] || [];
      if (!teeth.length) return;
      const seatedTeeth = snapTeethToJawSurface(teeth, jawType);

      const jawGroup = new THREE.Group();
      jawGroup.name = `${jawType}-artificial-teeth`;
      jawGroup.userData = { overlayType: "artificial-teeth", arch: jawType };
      jawGroup.visible = isJawVisible(jawType);
      const guideline = createGuidelineGroup(jawType, seatedTeeth);
      if (guideline) jawGroup.add(guideline);
      seatedTeeth.forEach((tooth, index) => {
        const mesh = createMesh(jawType, tooth, index);
        if (mesh) {
          jawGroup.add(mesh);
          createdCounts[jawType] += 1;
        }
        const vertexDebug = createVertexDebugPoints(jawType, tooth, index);
        if (vertexDebug) jawGroup.add(vertexDebug);
      });
      if (shouldApplyJawTransform()) {
        applyJawTransform(jawGroup, jawType);
      }
      group.add(jawGroup);
    });
    console.log("[artificial teeth] rendered meshes", createdCounts);
    reveal();
  };

  const setReferenceMode = (mode) => {
    if (!["jaw-local", "parent-local", "scene-world"].includes(mode)) {
      console.warn("[artificial teeth] Unknown reference mode", mode);
      return referenceMode;
    }
    referenceMode = mode;
    localStorage.setItem("artificialTeethReferenceMode", mode);
    console.log("[artificial teeth] reference mode", mode);
    renderData(lastNormalizedTeeth);
    return referenceMode;
  };

  const getReferenceMode = () => referenceMode;

  const setMeshOnlyMode = (enabled) => {
    meshOnlyMode = Boolean(enabled);
    localStorage.setItem("artificialTeethMeshOnly", String(meshOnlyMode));
    console.log("[artificial teeth] mesh-only mode", meshOnlyMode);
    renderData(lastNormalizedTeeth);
    return meshOnlyMode;
  };

  const setVertexDebugMode = (enabled) => {
    vertexDebugMode = Boolean(enabled);
    localStorage.setItem("artificialTeethVertexDebug", String(vertexDebugMode));
    console.log("[artificial teeth] vertex debug mode", vertexDebugMode);
    renderData(lastNormalizedTeeth);
    return vertexDebugMode;
  };

  const getFallbackToothIndex = (index, count) => {
    if (count <= 1) return "8";
    return String(Math.round((index / (count - 1)) * 15));
  };

  const createFallbackTeethFromGuideline = (jawType, count, source) => {
    const guidelinePoints = getRenderedPolylineJawlinePoints(scene, jawType);
    if (guidelinePoints.length < 6) return null;

    const toothCount = Math.max(1, Number(count) || 16);
    const lineLength = Math.max(polylineLength(guidelinePoints), 1);
    const baseScale = Math.max(1.15, Math.min(lineLength / Math.max(toothCount * 5.45, 1), 2.45));
    const archReverse = jawType === "upper";

    return Array.from({ length: toothCount }, (_, index) => {
      const t = toothCount === 1 ? 0.5 : 0.035 + (index / (toothCount - 1)) * 0.93;
      const sampleT = archReverse ? 1 - t : t;
      const position = samplePolyline(guidelinePoints, sampleT);
      const before = samplePolyline(guidelinePoints, Math.max(0, sampleT - 0.018));
      const after = samplePolyline(guidelinePoints, Math.min(1, sampleT + 0.018));
      const tangent = before && after
        ? { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z }
        : { x: 0, y: 0, z: 1 };
      const centered = toothCount === 1 ? 0 : index / (toothCount - 1) - 0.5;
      const toothIndex = getFallbackToothIndex(index, toothCount);
      const anterior = isAnteriorTooth(toothIndex);
      const template = getToothTemplate(toothIndex);
      const lateralFullness = 1 + Math.abs(centered) * 0.1;
      const size = baseScale * (anterior ? 0.98 : 1.12) * getToothTemplateScaleFactor(template) * lateralFullness;

      return {
        arch: jawType,
        toothIndex,
        toothTemplate: template,
        position,
        rotation: {
          x: 0,
          y: Math.atan2(tangent.x, tangent.z) + (archReverse ? Math.PI : 0),
          z: centered * 0.12,
        },
        scale: { x: size, y: size, z: size },
        source: {
          kind: source,
          guidelineFallback: true,
          guidelinePoints: guidelinePoints.length,
          linearGuidelinePlaced: true,
          proceduralTemplate: template,
        },
      };
    }).filter((tooth) => isValidPoint(tooth.position));
  };

  const createDebugTeethForJaw = (jawType, count = 16, source = "debug-generated") => {
    const guidelineTeeth = createFallbackTeethFromGuideline(jawType, count, source);
    if (guidelineTeeth?.length) {
      console.log("[artificial teeth] created fallback teeth from rendered guideline", {
        arch: jawType,
        teeth: guidelineTeeth.length,
      });
      return guidelineTeeth;
    }

    const jawMesh = getJawMesh(jawType);
    if (!jawMesh?.geometry) return [];

    jawMesh.geometry.computeBoundingBox();
    const box = jawMesh.geometry.boundingBox;
    if (!box) return [];

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const toothCount = Math.max(1, Number(count) || 10);
    const xSpan = Math.max(size.x * 0.58, 30);
    const zSpan = Math.max(size.z * 0.24, 14);
    const baseScale = Math.max(Math.min(size.x || 50, size.z || 50) / 34, 1.2);
    const archDirection = jawType === "upper" ? -1 : 1;
    const y = box.max.y + Math.max(size.y * 0.035, 1.5);

    return Array.from({ length: toothCount }, (_, index) => {
      const t = toothCount === 1 ? 0.5 : index / (toothCount - 1);
      const centered = t - 0.5;
      const x = center.x + centered * xSpan;
      const z = center.z + archDirection * Math.sin(t * Math.PI) * zSpan;
      const toothIndex = getFallbackToothIndex(index, toothCount);
      return {
        arch: jawType,
        toothIndex,
        position: { x, y, z },
        rotation: { x: 0, y: centered * -0.7, z: 0 },
        scale: { x: baseScale, y: baseScale, z: baseScale },
        source: { kind: source, jawBoundsFallback: true },
      };
    });
  };

  const renderDebugArtificialTeeth = (options = {}) => {
    setStatus("Generating artificial teeth", 0.72);
    const loadedJawKeys = getLoadedJawKeys();
    const source = options.source || "debug-generated";
    const normalized = {
      upper: loadedJawKeys.includes("upper")
        ? createDebugTeethForJaw("upper", options.upper ?? options.count ?? 16, source)
        : [],
      lower: loadedJawKeys.includes("lower")
        ? createDebugTeethForJaw("lower", options.lower ?? options.count ?? 16, source)
        : [],
    };
    window.lastArtificialTeethNormalized = normalized;
    renderData(normalized);
    const counts = { upper: normalized.upper.length, lower: normalized.lower.length };
    setStatus(`Artificial teeth ready (${counts.upper + counts.lower})`, 1, true);
    console.log("[artificial teeth] rendered debug teeth", counts);
    return counts;
  };

  const ensureFallbackTeeth = (options = {}) => {
    if (hasRenderedTeeth()) {
      reveal();
      return { alreadyRendered: true };
    }
    return renderDebugArtificialTeeth({
      upper: options.upper ?? 16,
      lower: options.lower ?? 16,
      source: options.source || "persistent-fallback",
    });
  };

  const setJawVisibility = (arch, isVisible) => {
    if (arch !== "upper" && arch !== "lower") return;
    jawVisibility.set(arch, Boolean(isVisible));
    syncVisibility();
  };

  const getJawVisibility = (arch) => isJawVisible(arch);

  const hasRenderedTeeth = () => {
    let count = 0;
    group.traverse((child) => {
      if (child.userData?.overlayType === "artificial-tooth") count += 1;
    });
    return count > 0;
  };

  const postArtificialTeethJson = async (endpoint, payload) => {
    const response = await fetch(`${apiClient.baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 500) {
        console.warn("[artificial teeth] endpoint returned no usable payload", {
          endpoint,
          status: response.status,
        });
        return "stl";
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const postArtificialTeethDebug = async (endpoint, payload) => {
    const response = await fetch(`${apiClient.baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return {
      endpoint,
      status: response.status,
      ok: response.ok,
      payload,
      length: text.length,
      body: parsed,
      sample: text.slice(0, 500),
    };
  };

  const getToothPlacementData = async (caseIntID) => {
    const authPayload = [createAuthData(caseIntID)];
    return postArtificialTeethJson("/toothPlacementData/get", authPayload);
  };

  const debugToothPlacementData = async (caseIntID) => {
    const auth = createAuthData(caseIntID);
    const payloads = [
      { label: "auth-only", payload: [auth] },
      { label: "case_id", payload: [auth, { case_id: caseIntID }] },
      { label: "caseIntID", payload: [auth, { caseIntID }] },
      { label: "case_int_id", payload: [auth, { case_int_id: caseIntID }] },
      { label: "all-case-fields", payload: [auth, { case_id: caseIntID, caseIntID, case_int_id: caseIntID }] },
    ];

    const results = [];
    for (const entry of payloads) {
      try {
        const result = await postArtificialTeethDebug(
          "/toothPlacementData/get",
          entry.payload
        );
        results.push({ label: entry.label, ...result });
      } catch (error) {
        results.push({
          label: entry.label,
          endpoint: "/toothPlacementData/get",
          ok: false,
          error: error.message || String(error),
          payload: entry.payload,
        });
      }
    }

    console.table(
      results.map((result) => ({
        label: result.label,
        status: result.status ?? "ERR",
        ok: result.ok,
        length: result.length ?? 0,
        sample: result.sample ?? result.error ?? "",
      }))
    );
    window.lastToothPlacementDebugResults = results;
    return results;
  };

  const fetchAndRender = async (caseIntID) => {
    setStatus("Loading artificial teeth", 0.12);
    const authPayload = [createAuthData(caseIntID)];
    const fallbackPayload = [
      authPayload[0],
      { case_id: caseIntID, caseIntID },
    ];

    for (const endpoint of ARTIFICIAL_TOOTH_ENDPOINTS) {
      try {
        setStatus(`Checking ${endpoint.replaceAll("/", " ")}`, 0.28);
        const payload = /toothPlacementData\/get$/i.test(endpoint)
          ? authPayload
          : fallbackPayload;
        const response = await postArtificialTeethJson(endpoint, payload);
        if (!response || response === "stl") continue;

        const normalized = normalizeResponse(response);
        const upperCount = normalized.upper.length;
        const lowerCount = normalized.lower.length;
        const totalCount = upperCount + lowerCount;
        console.log("[artificial teeth] records", { endpoint, upper: upperCount, lower: lowerCount });
        setStatus(`Decoded artificial teeth (${totalCount})`, totalCount ? 0.82 : 0.52);
        window.lastArtificialTeethResponse = response;
        window.lastArtificialTeethNormalized = normalized;

        if (!totalCount) continue;
        renderData(normalized);
        setStatus(`Artificial teeth ready (${totalCount})`, 1, true);
        return;
      } catch (error) {
        console.warn("[artificial teeth] fetch failed", {
          endpoint,
          payloadShape: /toothPlacementData\/get$/i.test(endpoint)
            ? "auth-only"
            : "auth-with-case",
          error,
        });
      }
    }

    console.log("[artificial teeth] No JSON/TXT tooth placement data returned.");
    const fallbackCounts = renderDebugArtificialTeeth({
      upper: 16,
      lower: 16,
      source: "jaw-generated-fallback-no-api-data",
    });
    console.log("[artificial teeth] rendered jaw-generated fallback teeth", fallbackCounts);
  };

  window.getToothPlacementData = getToothPlacementData;
  window.debugToothPlacementData = debugToothPlacementData;
  window.fetchAndRenderArtificialTeeth = fetchAndRender;
  window.revealArtificialTeeth = reveal;
  window.updateArtificialTeethCameraVisibility = updateCameraVisibility;
  window.setArtificialTeethReferenceMode = setReferenceMode;
  window.getArtificialTeethReferenceMode = getReferenceMode;
  window.setArtificialTeethMeshOnly = setMeshOnlyMode;
  window.setArtificialTeethVertexDebug = setVertexDebugMode;
  window.summarizeArtificialTeethData = () => {
    const summary = summarizeDecodedStageData(window.lastDecodedToothPlacementData);
    console.log("[artificial teeth] decoded summary", summary);
    return summary;
  };
  window.renderDebugArtificialTeeth = renderDebugArtificialTeeth;
  window.ensureFallbackArtificialTeeth = ensureFallbackTeeth;
  window.hasRenderedArtificialTeeth = hasRenderedTeeth;
  window.clearArtificialTeeth = clear;
  window.setArtificialTeethJawVisibility = setJawVisibility;
  window.getArtificialTeethJawVisibility = getJawVisibility;

  return {
    clear,
    fetchAndRender,
    getToothPlacementData,
    debugToothPlacementData,
    renderDebugArtificialTeeth,
    ensureFallbackTeeth,
    reveal,
    hasRenderedTeeth,
    updateCameraVisibility,
    setReferenceMode,
    getReferenceMode,
    setMeshOnlyMode,
    setVertexDebugMode,
    setJawVisibility,
    getJawVisibility,
  };
}
