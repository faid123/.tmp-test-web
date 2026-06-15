#!/usr/bin/env node
/**
 * Diff two jaw-struct (L2) files to see how a lingual BAR differs from a lingual
 * PLATE — specifically in the 16x16 Minor Connector grid that the desktop renders
 * the major connector geometry from.
 *
 * Usage:
 *   node jawstruct_grid_diff.mjs <bar_file> <plate_file>
 *
 * Each file may be: raw desktop L2 text, a base64 blob, or a /jawstruct/l2/getall
 * JSON array (lower_jaw record is picked automatically).
 */
import { readFileSync } from "node:fs";

function toText(raw) {
  const s = raw.trim();
  // JSON getall array -> pick the lower_jaw record's base64 data.
  if (s.startsWith("[") || s.startsWith("{")) {
    const json = JSON.parse(s);
    const arr = Array.isArray(json) ? json : [json];
    const rec = arr.find((r) => r?.type === "lower_jaw") || arr.find((r) => r?.data) || arr[0];
    if (rec?.data) return Buffer.from(rec.data, "base64").toString("latin1");
  }
  // Raw L2 text already?
  if (/Major Connector Type:/.test(s)) return raw;
  // Otherwise assume base64.
  return Buffer.from(s, "base64").toString("latin1");
}

function gridMap(lines) {
  const m = new Map();
  for (const l of lines) {
    const mm = /^(Minor Connector \d+ Path Index \d+): (.+)$/.exec(l);
    if (mm) m.set(mm[1], mm[2]);
  }
  return m;
}

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error("Usage: node jawstruct_grid_diff.mjs <bar_file> <plate_file>");
  process.exit(1);
}
const barLines = toText(readFileSync(a, "utf8")).split(/\r?\n/);
const plateLines = toText(readFileSync(b, "utf8")).split(/\r?\n/);

const mcLine = (ls) => ls.find((l) => l.startsWith("Major Connector Type:"));
console.log(`bar  (${a}): ${mcLine(barLines)}`);
console.log(`plate(${b}): ${mcLine(plateLines)}`);

const barGrid = gridMap(barLines);
const plateGrid = gridMap(plateLines);
const keys = new Set([...barGrid.keys(), ...plateGrid.keys()]);
const gridDiffs = [];
for (const k of keys) {
  const bv = barGrid.get(k), pv = plateGrid.get(k);
  if (bv !== pv) gridDiffs.push(`  ${k}: bar=${bv}  plate=${pv}`);
}
console.log(`\nMinor Connector grid: ${gridDiffs.length} differing cell(s)` + (gridDiffs.length ? ":" : " (grids identical)"));
console.log(gridDiffs.join("\n"));

// Non-grid, non-timestamp line diffs (per-tooth / ball connectors / etc).
const strip = (ls) => ls.filter((l) => !/^Minor Connector |^Start of Jaw Struct /.test(l));
const bs = strip(barLines), ps = strip(plateLines);
const other = [];
for (let i = 0; i < Math.max(bs.length, ps.length); i += 1) {
  if (bs[i] !== ps[i]) other.push(`  bar=${JSON.stringify(bs[i])}  plate=${JSON.stringify(ps[i])}`);
}
console.log(`\nOther differing lines (excl. grid + timestamp): ${other.length}`);
console.log(other.slice(0, 60).join("\n"));
