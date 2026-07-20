/**
 * @jest-environment jsdom
 *
 * Codec tests for src/js/2D/clinicalInfo.js — now exercising the REAL exported
 * functions (not a hand-copy). The module reads/writes the SAME blob format as
 * the SmartRPD desktop app: a .NET BinaryFormatter "single System.String"
 * envelope wrapping a JSON array of per-tooth rows (desktop field names +
 * integer enums). These tests pin:
 *   - the envelope is emitted byte-for-byte the way .NET expects (so desktop can
 *     deserialize it),
 *   - decode walks the envelope rather than scanning for '[' (a 7-bit length byte
 *     can itself equal '[' = 0x5B and corrupt a bracket-scan),
 *   - the desktop<->UI integer-enum mappings and ToothPresence round-trip losslessly.
 *
 * jsdom (jest-environment-jsdom) provides global atob/btoa, matching the browser.
 * clinicalInfo.js imports the DOM-heavy 2DAnnotation.js entry only for `state`;
 * we mock it to empty teeth so statusFor() returns "presence" (== present).
 */
import { jest } from '@jest/globals';

// babel-jest hoists jest.mock above the imports below; cut the DOM-heavy entry
// point so statusFor() reads an empty { teeth: {} } (== "presence" == present).
jest.mock('../src/js/2D/2DAnnotation.js', () => ({ state: { teeth: {} }, setMessage: () => {} }));

import {
  emptyToothNote,
  decodeClinicalInfoData,
  encodeClinicalInfoData,
  bracketSlice,
  apiRowsToClinicalNotes,
  clinicalNotesToApiRows,
} from '../src/js/2D/clinicalInfo.js';

// ---------------------------------------------------------------------------
// Independent oracles (NOT imported from source): the exact bytes / arch order
// the desktop format requires, plus a .NET envelope writer written by hand so
// the decode tests don't lean on the encoder under test.
// ---------------------------------------------------------------------------
const NET_BF_HEADER = [0, 1, 0, 0, 0, 255, 255, 255, 255, 1, 0, 0, 0, 0, 0, 0, 0];
const NET_BF_STRING_RECORD = [0x06, 1, 0, 0, 0]; // BinaryObjectString, objectId = 1
const NET_BF_END = 0x0b; // MessageEnd

const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

function encode7BitLength(byteLength) {
  let out = '';
  let n = byteLength;
  do {
    let b = n & 0x7f;
    n >>>= 7;
    if (n) b |= 0x80;
    out += String.fromCharCode(b);
  } while (n);
  return out;
}

// Wrap a JSON string in a genuine .NET BinaryFormatter single-String envelope.
// Written independently of encodeClinicalInfoData so decode tests don't lean on
// the encoder (simulates "the desktop app produced this blob").
function wrapDotNet(jsonString) {
  const header = String.fromCharCode(...NET_BF_HEADER);
  const record = String.fromCharCode(...NET_BF_STRING_RECORD);
  const lenPrefix = encode7BitLength(jsonString.length);
  return btoa(`${header}${record}${lenPrefix}${jsonString}${String.fromCharCode(NET_BF_END)}`);
}

const binOf = (b64) => atob(b64);

describe('clinical-info .NET envelope codec', () => {
  test('encode emits a valid .NET BinaryFormatter single-String envelope', () => {
    const bin = binOf(encodeClinicalInfoData([{ ToothIndex: 16 }]));
    const bytes = Array.from(bin, (c) => c.charCodeAt(0));

    expect(bytes.slice(0, 17)).toEqual(NET_BF_HEADER); // SerializationHeaderRecord
    expect(bytes[17]).toBe(0x06); // BinaryObjectString
    expect(bytes.slice(18, 22)).toEqual([1, 0, 0, 0]); // objectId
    expect(bytes[bytes.length - 1]).toBe(0x0b); // MessageEnd
  });

  test('the 7-bit length prefix matches the byte length of the embedded JSON', () => {
    const bin = binOf(encodeClinicalInfoData([{ ToothIndex: 16 }]));
    // Re-read the declared length the way .NET would, then confirm exactly that
    // many bytes of JSON sit between the prefix and the trailing MessageEnd.
    let p = 22;
    let len = 0;
    let shift = 0;
    let b;
    do {
      b = bin.charCodeAt(p++);
      len |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    expect(bin.length).toBe(p + len + 1); // prefix end + payload + 1 (MessageEnd)
    expect(() => JSON.parse(bin.substr(p, len))).not.toThrow();
  });

  test('encode is deterministic', () => {
    const rows = clinicalNotesToApiRows({ 16: { ...emptyToothNote(), crown: true } });
    expect(encodeClinicalInfoData(rows)).toBe(encodeClinicalInfoData(rows));
  });

  test('decode reads a desktop-authored blob (not produced by our encoder)', () => {
    const json = JSON.stringify([
      { ToothIndex: 16, ToothPresence: 1, ToothNote_Crown: true },
      { ToothIndex: 14, ToothPresence: 0, ToothNote_Mobility: 3 },
    ]);
    const rows = decodeClinicalInfoData(wrapDotNet(json));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ToothIndex: 16, ToothNote_Crown: true });
    expect(rows[1]).toMatchObject({ ToothIndex: 14, ToothPresence: 0 });
  });

  test('decode walks the envelope even when a length byte equals "[" (0x5B)', () => {
    // Length 11648 encodes to 7-bit bytes [0x80, 0x5B]; that 0x5B is a literal '['
    // sitting BEFORE the JSON array, which the old bracket-scan would mis-detect.
    const payload = `["${'A'.repeat(11648 - 4)}"]`; // exactly 11648 bytes
    expect(payload.length).toBe(11648);
    const prefix = encode7BitLength(payload.length);
    expect(Array.from(prefix, (c) => c.charCodeAt(0))).toEqual([0x80, 0x5b]);

    const decoded = decodeClinicalInfoData(wrapDotNet(payload));
    expect(decoded).toEqual([JSON.parse(payload)[0]]); // one long string element
    // And the brittle fallback really would have failed on this input:
    expect(() => JSON.parse(bracketSlice(binOf(wrapDotNet(payload))))).toThrow();
  });

  test('decode tolerates junk / non-array payloads', () => {
    expect(decodeClinicalInfoData(null)).toEqual([]);
    expect(decodeClinicalInfoData('!!!not base64!!!')).toEqual([]);
    expect(decodeClinicalInfoData(btoa('garbage with no json'))).toEqual([]);
    expect(decodeClinicalInfoData(wrapDotNet('{"not":"an array"}'))).toEqual([]);
  });
});

describe('desktop <-> UI field mapping', () => {
  test('decodes desktop int-enums and bools into UI values', () => {
    const json = JSON.stringify([
      {
        ToothIndex: 16,
        ToothPresence: 0, // 0 = present
        ToothNote_Mobility: 2,
        ToothRestoration: 2, // INLAY
        ToothNote_Tilt: 0, // M
        ToothNote_RootCanal: true,
        ToothNote_Crown: true,
        ToothNote_Implant: false,
        ToothNote_RootStump: false,
        ToothNote_Cracked: false,
        ToothNote_Extraction: false,
        ToothNote_Abutment: true,
      },
    ]);
    const notes = apiRowsToClinicalNotes(decodeClinicalInfoData(wrapDotNet(json)));
    expect(notes[16]).toEqual({
      present: true,
      mobility: '2',
      rct: true,
      restoration: 'INLAY',
      crown: true,
      implant: false,
      rootStump: false,
      cracked: false,
      tilted: 'M',
      extraction: false,
      abutment: true,
    });
  });

  test('"none" sentinels (mobility 0, restoration 4, tilt 6) decode to null; presence 1 = missing', () => {
    const json = JSON.stringify([
      { ToothIndex: 11, ToothPresence: 1, ToothNote_Mobility: 0, ToothRestoration: 4, ToothNote_Tilt: 6 },
    ]);
    const notes = apiRowsToClinicalNotes(decodeClinicalInfoData(wrapDotNet(json)));
    expect(notes[11]).toMatchObject({ present: false, mobility: null, restoration: null, tilted: null });
  });

  test('write emits all 32 teeth in desktop arch order with desktop field names', () => {
    const rows = clinicalNotesToApiRows({});
    expect(rows).toHaveLength(32);
    expect(rows.map((r) => r.ToothIndex)).toEqual([...UPPER_TEETH, ...LOWER_TEETH]);
    expect(Object.keys(rows[0])).toEqual([
      'ToothIndex',
      'ToothPresence',
      'ToothNote_Mobility',
      'ToothNote_RootCanal',
      'ToothRestoration',
      'ToothNote_Crown',
      'ToothNote_Implant',
      'ToothNote_RootStump',
      'ToothNote_Cracked',
      'ToothNote_Tilt',
      'ToothNote_Extraction',
      'ToothNote_Abutment',
    ]);
  });

  test('UI "none" values write back to the desktop sentinels, not 0', () => {
    const [row] = clinicalNotesToApiRows({ 16: emptyToothNote() });
    expect(row.ToothNote_Mobility).toBe(0);
    expect(row.ToothRestoration).toBe(4);
    expect(row.ToothNote_Tilt).toBe(6);
  });

  test('absent notes default to present (0); explicit present:false writes ToothPresence 1', () => {
    const rows = clinicalNotesToApiRows({ 14: { ...emptyToothNote(), present: false } });
    expect(rows.find((r) => r.ToothIndex === 16).ToothPresence).toBe(0); // no note → present
    expect(rows.find((r) => r.ToothIndex === 14).ToothPresence).toBe(1); // explicit missing
  });
});

describe('full round-trip', () => {
  test('notes -> rows -> encode -> decode -> notes is lossless across every marker', () => {
    const notes = {
      16: { ...emptyToothNote(), mobility: '2', crown: true }, // mobility + crown
      14: { ...emptyToothNote(), present: false, mobility: '3' }, // missing + mobility 3
      13: { ...emptyToothNote(), present: false, rct: true },
      12: { ...emptyToothNote(), present: false, restoration: 'INLAY' },
      11: { ...emptyToothNote(), present: false, implant: true },
      27: { ...emptyToothNote(), present: false, cracked: true },
      28: { ...emptyToothNote(), present: false, extraction: true },
      42: { ...emptyToothNote(), present: false, abutment: true },
      24: { ...emptyToothNote(), tilted: 'SE', restoration: 'ONLAY' }, // last enum index
    };

    const rows = clinicalNotesToApiRows(notes);
    const restored = apiRowsToClinicalNotes(decodeClinicalInfoData(encodeClinicalInfoData(rows)));

    // Every tooth we set must survive byte-for-byte through the wire format.
    for (const id of Object.keys(notes)) {
      // present defaults to true on the way back; normalize the ones we left implicit.
      const expected = { present: notes[id].present !== false, ...notes[id] };
      expect(restored[id]).toEqual(expected);
    }
  });

  test('decode∘encode is idempotent on a full default 32-tooth chart', () => {
    const rows = clinicalNotesToApiRows({});
    const once = decodeClinicalInfoData(encodeClinicalInfoData(rows));
    const twice = decodeClinicalInfoData(encodeClinicalInfoData(once));
    expect(once).toEqual(rows);
    expect(twice).toEqual(once);
  });
});
