import fs from "node:fs";
import path from "node:path";

const componentNames = [
  "retentionPins",
  "retainer",
  "tissueStop",
  "mesh",
  "reversalLine",
  "proximalPlate",
  "proximalPlates",
  "endingProximalPlate",
  "startingProximalPlate",
  "majorConnector",
  "GingivalPoints",
  "reciprocatingArm",
  "rests",
  "rest",
  "minorConnectorTooth",
];

const componentPattern = new RegExp(`^(${componentNames.join("|")})\\b`, "i");
const numberPattern = /[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const ignoredPointValue = -9e91;

function isSentinelCoordinate(value) {
  return !Number.isFinite(value) || Math.abs(value - ignoredPointValue) < 1e80;
}

function parseMetadata(line) {
  const metadata = {};
  const metadataPattern = /([A-Za-z]+)\s*=\s*([^\s]+)/g;
  for (const match of line.matchAll(metadataPattern)) {
    metadata[match[1]] = match[2];
  }
  return metadata;
}

function parseCoordinateLine(line) {
  if (!/^[\s+\-.0-9eE]+$/.test(line)) return null;

  const numbers = line.match(numberPattern)?.map(Number) || [];
  if (numbers.length < 3) return null;

  const coords = numbers.slice(-3);
  const point = { x: coords[0], y: coords[1], z: coords[2] };
  const prefix = numbers.slice(0, -3);
  return {
    prefix,
    point,
    isValid: !coords.some(isSentinelCoordinate),
  };
}

function normalizeJawType(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("upper")) return "upper_jaw";
  if (text.includes("lower")) return "lower_jaw";
  return value || null;
}

function getAppCategory(component) {
  const text = String(component || "");
  if (/retention\s*pins?|^retainer$/i.test(text)) return "Retainer";
  if (/gingival/i.test(text)) return "Gingival Points";
  if (/reciprocating\s*arm/i.test(text)) return "Lingual Clasp";
  if (/major\s*connector/i.test(text)) return "MajorConnector";
  if (/proximal\s*plate/i.test(text)) return "Proximal Plate";
  if (/tissue\s*stop|^rests?$|rest/i.test(text)) return "Rest";
  if (/minor\s*connector\s*tooth/i.test(text)) return "Minor Conn";
  if (/^mesh$/i.test(text)) return "Mesh";
  if (/reversal/i.test(text)) return "Reversal Line";
  return text || "polyline";
}

function createAuditEntry(component, line, lineNumber) {
  const metadata = parseMetadata(line);
  const declaredNodeCountMatch =
    line.match(/nodeCount\s*=\s*(\d+)/i) ||
    line.match(/^GingivalPoints\s+(\d+)/i);

  return {
    name: component,
    rawHeader: line,
    lineNumber,
    tooth: metadata.tooth ?? null,
    objectNo: metadata.objectNo !== undefined ? Number(metadata.objectNo) : null,
    apiLineNumber:
      metadata.lineNumber !== undefined ? Number(metadata.lineNumber) : null,
    lineCount:
      metadata.lineCount !== undefined ? Number(metadata.lineCount) : null,
    declaredNodeCount: declaredNodeCountMatch
      ? Number(declaredNodeCountMatch[1])
      : null,
    rawCoordinateRows: [],
    validPoints: [],
    invalidPoints: [],
  };
}

function parsePolylineText(text) {
  const lines = text.split(/\r?\n/);
  const components = [];
  const orphanCoordinateRows = [];
  let current = null;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const componentMatch = line.match(componentPattern);
    if (componentMatch) {
      current = createAuditEntry(componentMatch[1], line, index + 1);
      components.push(current);
      return;
    }

    const coordinate = parseCoordinateLine(line);
    if (!coordinate) return;

    const row = {
      lineNumber: index + 1,
      raw: line,
      prefix: coordinate.prefix,
      point: coordinate.point,
      isValid: coordinate.isValid,
    };

    if (!current) {
      orphanCoordinateRows.push(row);
      return;
    }

    current.rawCoordinateRows.push(row);
    if (coordinate.isValid) {
      current.validPoints.push(coordinate.point);
    } else {
      current.invalidPoints.push(coordinate.point);
    }
  });

  return { components, orphanCoordinateRows };
}

function toPointsOutput(entry, parsed) {
  const segments = parsed.components
    .filter((component) => component.validPoints.length >= 2)
    .map((component) => ({
      name: component.name,
      appCategory: getAppCategory(component.name),
      tooth: component.tooth,
      objectNo: component.objectNo,
      lineNumber: component.apiLineNumber,
      declaredNodeCount: component.declaredNodeCount,
      rawCoordinateRowCount: component.rawCoordinateRows.length,
      pointCount: component.validPoints.length,
      points: component.validPoints,
    }));

  return {
    case_id: entry.case_id ?? null,
    jaw_type: normalizeJawType(entry.type),
    filename: entry.filename ?? null,
    segments,
  };
}

function toAuditOutput(entry, parsed) {
  const components = parsed.components.map((component) => ({
    name: component.name,
    appCategory: getAppCategory(component.name),
    rawHeader: component.rawHeader,
    lineNumber: component.lineNumber,
    tooth: component.tooth,
    objectNo: component.objectNo,
    apiLineNumber: component.apiLineNumber,
    lineCount: component.lineCount,
    declaredNodeCount: component.declaredNodeCount,
    rawCoordinateRowCount: component.rawCoordinateRows.length,
    validPointCount: component.validPoints.length,
    invalidPointCount: component.invalidPoints.length,
    status:
      component.validPoints.length > 0
        ? "valid_points"
        : component.rawCoordinateRows.length > 0
          ? "placeholder_or_invalid_only"
          : "empty_component",
    rawCoordinateRows: component.rawCoordinateRows,
  }));

  return {
    case_id: entry.case_id ?? null,
    jaw_type: normalizeJawType(entry.type),
    filename: entry.filename ?? null,
    componentCount: components.length,
    renderableComponentCount: components.filter(
      (component) => component.validPointCount >= 2
    ).length,
    validPointCount: components.reduce(
      (total, component) => total + component.validPointCount,
      0
    ),
    invalidPointCount: components.reduce(
      (total, component) => total + component.invalidPointCount,
      0
    ),
    orphanCoordinateRows: parsed.orphanCoordinateRows,
    components,
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function processRawFile(rawFile) {
  const rawPath = path.resolve(rawFile);
  const rawResponse = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  const entries = Array.isArray(rawResponse) ? rawResponse : [rawResponse];

  entries.forEach((entry, index) => {
    if (!entry?.data) return;

    const text = Buffer.from(String(entry.data).trim(), "base64").toString("utf8");
    const parsed = parsePolylineText(text);
    const caseId = entry.case_id ?? `entry-${index + 1}`;
    const baseName = path.join(path.dirname(rawPath), `polylines-${caseId}`);

    writeJson(`${baseName}-points.json`, toPointsOutput(entry, parsed));
    writeJson(`${baseName}-audit.json`, toAuditOutput(entry, parsed));

    console.log(
      `${path.basename(rawPath)} -> polylines-${caseId}-points.json, polylines-${caseId}-audit.json`
    );
  });
}

const rawFiles = process.argv.slice(2);
if (!rawFiles.length) {
  console.error("Usage: node postman/polyline-audit.mjs <raw-json> [...]");
  process.exitCode = 1;
} else {
  rawFiles.forEach(processRawFile);
}
