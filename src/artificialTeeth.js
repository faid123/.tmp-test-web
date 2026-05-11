import * as THREE from "three";

const ARTIFICIAL_TOOTH_ENDPOINTS = [
  "/toothPlacementData/get",
  "/toothplacementdata/get",
  "/toothplacement/get",
  "/tooth-placement/get",
  "/artificialteeth/get",
  "/artificialteeth/getall",
];

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

  return parse();
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

function toPointObject(value) {
  if (typeof value === "string") {
    try {
      return toPointObject(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value.map(Number);
    return { x, y, z };
  }

  if (value && typeof value === "object") {
    const x = Number(value.x ?? value.X ?? value.pos_x ?? value.position_x ?? value[0]);
    const y = Number(value.y ?? value.Y ?? value.pos_y ?? value.position_y ?? value[1]);
    const z = Number(value.z ?? value.Z ?? value.pos_z ?? value.position_z ?? value[2]);
    if ([x, y, z].every(Number.isFinite)) return { x, y, z };
  }

  return null;
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

function decodeToothPlacementData(rawResponse) {
  const payload =
    rawResponse?.data ??
    rawResponse?.Data ??
    rawResponse?.toothPlacementData ??
    rawResponse?.tooth_placement_data;
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
    candidate.name;
  return value === undefined || value === null ? null : String(value);
}

function getToothPosition(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const direct = toPointObject(candidate);
  if (isValidPoint(direct)) return direct;

  for (const key of ["position", "pos", "translation", "localPosition", "center", "origin", "location"]) {
    const point = toPointObject(candidate[key]);
    if (isValidPoint(point)) return point;
  }

  const transform =
    candidate.transform ??
    candidate.localTransform ??
    candidate.toothTransform ??
    candidate.toothTransformInterfaceData_;
  return transform && typeof transform === "object" ? getToothPosition(transform) : null;
}

function getToothScale(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const point = toPointObject(candidate.scale ?? candidate.localScale ?? candidate.size ?? candidate.dimensions);
  if (isValidPoint(point)) return point;

  const x = Number(candidate.scaleX ?? candidate.scale_x ?? candidate.width);
  const y = Number(candidate.scaleY ?? candidate.scale_y ?? candidate.height);
  const z = Number(candidate.scaleZ ?? candidate.scale_z ?? candidate.depth);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function getToothRotation(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const point = toPointObject(
    candidate.rotation ??
      candidate.euler ??
      candidate.eulerAngles ??
      candidate.localEulerAngles ??
      candidate.rot
  );
  if (isValidPoint(point)) return point;

  const x = Number(candidate.rotationX ?? candidate.rot_x ?? candidate.rx);
  const y = Number(candidate.rotationY ?? candidate.rot_y ?? candidate.ry);
  const z = Number(candidate.rotationZ ?? candidate.rot_z ?? candidate.rz);
  return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function parseToothIndices(candidate) {
  if (!Array.isArray(candidate)) return null;
  if (candidate.every((entry) => Number.isInteger(Number(entry)))) {
    return candidate.map(Number);
  }
  if (candidate.every((entry) => Array.isArray(entry))) {
    const flattened = candidate.flatMap((entry) => entry.map(Number));
    return flattened.every(Number.isInteger) ? flattened : null;
  }
  return null;
}

function extractVertexArray(candidate) {
  if (!Array.isArray(candidate)) return extractPointArray(candidate);
  if (candidate.every((entry) => typeof entry === "number")) {
    const points = [];
    for (let index = 0; index + 2 < candidate.length; index += 3) {
      const point = toPointObject(candidate.slice(index, index + 3));
      if (isValidPoint(point)) points.push(point);
    }
    return points;
  }
  return extractPointArray(candidate);
}

function getToothGeometryData(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const vertices =
    candidate.vertices ??
    candidate.points ??
    candidate.positions ??
    candidate.vertexData ??
    candidate.meshVertices;
  const indices =
    candidate.indices ??
    candidate.triangles ??
    candidate.faces ??
    candidate.meshIndices;
  const points = extractVertexArray(vertices);
  if (points.length < 3) return null;
  return { vertices: points, indices: parseToothIndices(indices) };
}

// [Decoder 3] Synthesize tooth records by merging metadata, transform, and surface dictionaries.
function addNestedValues(candidate, output, seen = new Set(), depth = 0) {
  if (!candidate || typeof candidate !== "object" || depth > 5 || seen.has(candidate)) {
    return;
  }
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
  const lastDigit = value % 10;
  return (value >= 6 && value <= 11) || (lastDigit >= 1 && lastDigit <= 3);
}

export function createArtificialTeethRenderer({ scene, parentObject, apiClient }) {
  const group = new THREE.Group();
  group.name = "artificial-tooth-overlay-group";
  scene.add(group);

  const jawVisibility = new Map([
    ["upper", true],
    ["lower", true],
  ]);
  const material = new THREE.MeshStandardMaterial({
    color: 0xe5e87c,
    roughness: 0.38,
    metalness: 0,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
  });

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

  const isJawVisible = (arch) => jawVisibility.get(arch) ?? true;

  const syncVisibility = () => {
    group.children.forEach((child) => {
      const arch = child.userData?.arch;
      child.visible = arch ? isJawVisible(arch) : true;
    });
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

    if (skippedUnknownJaw) {
      console.warn(
        `[artificial teeth] Skipped ${skippedUnknownJaw} tooth record(s) without an upper/lower jaw.`
      );
    }

    if (decodedStageData) {
      window.lastDecodedToothPlacementData = decodedStageData;
      console.log("[artificial teeth] decoded ToothPlacementData", {
        upperCraftTeeth: decodedStageData.toothCraftDataUpperJaw_?.teeth?.length ?? 0,
        lowerCraftTeeth: decodedStageData.toothCraftDataLowerJaw_?.teeth?.length ?? 0,
        extractedRecords: records.length,
      });
    }

    return normalized;
  };

  const createGeometry = (tooth) => {
    if (tooth.geometry?.vertices?.length >= 3) {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(tooth.geometry.vertices.length * 3);
      tooth.geometry.vertices.forEach((point, index) => {
        positions[index * 3] = point.x;
        positions[index * 3 + 1] = point.y;
        positions[index * 3 + 2] = point.z;
      });
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      if (tooth.geometry.indices?.length >= 3) geometry.setIndex(tooth.geometry.indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return geometry;
    }

    const geometry = new THREE.SphereGeometry(1, 32, 20);
    const position = geometry.attributes.position;
    const anterior = isAnteriorTooth(tooth.toothIndex);
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      const occlusalRipple = 1 + 0.08 * Math.sin(x * Math.PI * 2) * Math.cos(z * Math.PI * 2);
      const neckTaper = y < -0.35 ? 0.72 + (y + 1) * 0.28 : 1;
      position.setXYZ(index, x * neckTaper, y * occlusalRipple, z * neckTaper);
    }
    geometry.scale(anterior ? 1.35 : 1.85, anterior ? 2.25 : 1.35, 1.55);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  };

  const applyToothTransform = (mesh, tooth) => {
    mesh.position.set(tooth.position.x, tooth.position.y, tooth.position.z);
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
    const mesh = new THREE.Mesh(createGeometry(tooth), material.clone());
    mesh.name = `${jawType}-artificial-tooth-${tooth.toothIndex ?? toothIndex}`;
    mesh.renderOrder = 10;
    mesh.userData = {
      overlayType: "artificial-tooth",
      selectable: true,
      arch: jawType,
      toothIndex: tooth.toothIndex ?? toothIndex,
      source: tooth.source,
    };
    applyToothTransform(mesh, tooth);
    return mesh;
  };

  const renderData = (toothByJaw) => {
    clear();
    ["upper", "lower"].forEach((jawType) => {
      const teeth = toothByJaw[jawType] || [];
      if (!teeth.length) return;

      const jawGroup = new THREE.Group();
      jawGroup.name = `${jawType}-artificial-teeth`;
      jawGroup.userData = { overlayType: "artificial-teeth", arch: jawType };
      jawGroup.visible = isJawVisible(jawType);
      teeth.forEach((tooth, index) => jawGroup.add(createMesh(jawType, tooth, index)));
      applyJawTransform(jawGroup, jawType);
      group.add(jawGroup);
    });
    syncVisibility();
  };

  const createDebugTeethForJaw = (jawType, count = 10, source = "debug-generated") => {
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
      return {
        arch: jawType,
        toothIndex: `${jawType}-debug-${index + 1}`,
        position: { x, y, z },
        rotation: { x: 0, y: centered * -0.7, z: 0 },
        scale: { x: baseScale, y: baseScale, z: baseScale },
        source,
      };
    });
  };

  const renderDebugArtificialTeeth = (options = {}) => {
    const loadedJawKeys = getLoadedJawKeys();
    const source = options.source || "debug-generated";
    const normalized = {
      upper: loadedJawKeys.includes("upper")
        ? createDebugTeethForJaw("upper", options.upper ?? options.count ?? 10, source)
        : [],
      lower: loadedJawKeys.includes("lower")
        ? createDebugTeethForJaw("lower", options.lower ?? options.count ?? 10, source)
        : [],
    };
    window.lastArtificialTeethNormalized = normalized;
    renderData(normalized);
    const counts = { upper: normalized.upper.length, lower: normalized.lower.length };
    console.log("[artificial teeth] rendered debug teeth", counts);
    return counts;
  };

  const setJawVisibility = (arch, isVisible) => {
    if (arch !== "upper" && arch !== "lower") return;
    jawVisibility.set(arch, Boolean(isVisible));
    syncVisibility();
  };

  const getJawVisibility = (arch) => isJawVisible(arch);

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
    const authPayload = [
      {
        machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
        uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
        caseIntID,
      },
    ];
    return postArtificialTeethJson("/toothPlacementData/get", authPayload);
  };

  const debugToothPlacementData = async (caseIntID) => {
    const auth = {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
      caseIntID,
    };
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
    clear();
    const authPayload = [
      {
        machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
        uuid: "AC4gRQXZJoNz9EhhW36Q8jMJXBsf",
        caseIntID,
      },
    ];
    const fallbackPayload = [
      authPayload[0],
      { case_id: caseIntID, caseIntID },
    ];

    for (const endpoint of ARTIFICIAL_TOOTH_ENDPOINTS) {
      try {
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
        window.lastArtificialTeethResponse = response;
        window.lastArtificialTeethNormalized = normalized;

        if (!totalCount) continue;
        renderData(normalized);
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
    console.log("[artificial teeth] Nothing was rendered because the API did not return tooth data.");
  };

  window.getToothPlacementData = getToothPlacementData;
  window.debugToothPlacementData = debugToothPlacementData;
  window.renderDebugArtificialTeeth = renderDebugArtificialTeeth;
  window.clearArtificialTeeth = clear;
  window.setArtificialTeethJawVisibility = setJawVisibility;
  window.getArtificialTeethJawVisibility = getJawVisibility;

  return {
    clear,
    fetchAndRender,
    getToothPlacementData,
    debugToothPlacementData,
    renderDebugArtificialTeeth,
    setJawVisibility,
    getJawVisibility,
  };
}
