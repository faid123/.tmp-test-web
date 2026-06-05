// __tests__/clinicalInfoCodec.test.mjs
//
// Mirrors the clinical-info codec in src/js/2D/clinicalInfo.js. That module was
// rewritten so the web reads/writes the SAME blob format as the SmartRPD desktop
// app: a .NET BinaryFormatter "single System.String" envelope wrapping a JSON
// array of per-tooth rows (desktop field names + integer enums). These tests pin:
//   - the envelope is emitted byte-for-byte the way .NET expects (so desktop can
//     deserialize it),
//   - decode walks the envelope rather than scanning for '[' (a 7-bit length byte
//     can itself equal '[' = 0x5B and corrupt a bracket-scan),
//   - the desktop<->UI integer-enum mappings and ToothPresence round-trip losslessly.
//
// jsdom (jest-environment-jsdom) provides global atob/btoa, matching the browser.

// ---------------------------------------------------------------------------
// Faithful copy of the source implementation.
// ---------------------------------------------------------------------------
const NET_BF_HEADER = [0, 1, 0, 0, 0, 255, 255, 255, 255, 1, 0, 0, 0, 0, 0, 0, 0];
const NET_BF_STRING_RECORD = [0x06, 1, 0, 0, 0]; // BinaryObjectString, objectId = 1
const NET_BF_END = 0x0b; // MessageEnd

const RESTORATION_ENUM = ['AR', 'TCR', 'INLAY', 'ONLAY']; // none = 4
const TILT_ENUM = ['M', 'D', 'B', 'L', 'A', 'SE']; // none = 6

const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const ALL_TEETH = [...UPPER_TEETH, ...LOWER_TEETH];

function emptyToothNote() {
  return {
    mobility: null,
    rct: false,
    restoration: null,
    crown: false,
    implant: false,
    rootStump: false,
    cracked: false,
    tilted: null,
    extraction: false,
    abutment: false,
  };
}

function safeAtob(b64) {
  if (typeof b64 !== 'string') return null;
  try {
    const cleaned = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

function extractDotNetString(bin) {
  if (bin.length < 23 || bin.charCodeAt(17) !== 0x06) return null;
  let p = 22; // 17 (header) + 1 (record type) + 4 (objectId)
  let len = 0;
  let shift = 0;
  let b;
  do {
    if (p >= bin.length) return null;
    b = bin.charCodeAt(p++);
    len |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  return bin.substr(p, len);
}

function bracketSlice(bin) {
  const start = bin.indexOf('[');
  const end = bin.lastIndexOf(']');
  return start === -1 || end === -1 || end < start ? null : bin.slice(start, end + 1);
}

function decodeClinicalInfoData(dataB64) {
  const decoded = safeAtob(dataB64);
  if (!decoded) return [];
  const json = extractDotNetString(decoded) ?? bracketSlice(decoded);
  if (json == null) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

function encodeClinicalInfoData(rows) {
  const json = JSON.stringify(Array.isArray(rows) ? rows : [], null, 2);
  const header = String.fromCharCode(...NET_BF_HEADER);
  const record = String.fromCharCode(...NET_BF_STRING_RECORD);
  const lenPrefix = encode7BitLength(json.length);
  const tail = String.fromCharCode(NET_BF_END);
  return btoa(`${header}${record}${lenPrefix}${json}${tail}`);
}

function desktopMobilityToUi(value) {
  return value === 1 || value === 2 || value === 3 ? String(value) : null;
}
function desktopRestorationToUi(value) {
  return RESTORATION_ENUM[value] ?? null;
}
function desktopTiltToUi(value) {
  return TILT_ENUM[value] ?? null;
}
function uiMobilityToDesktop(value) {
  return value === '1' || value === '2' || value === '3' ? Number(value) : 0;
}
function uiRestorationToDesktop(value) {
  const i = RESTORATION_ENUM.indexOf(value);
  return i === -1 ? RESTORATION_ENUM.length : i;
}
function uiTiltToDesktop(value) {
  const i = TILT_ENUM.indexOf(value);
  return i === -1 ? TILT_ENUM.length : i;
}

function apiRowsToClinicalNotes(rows) {
  const notes = {};
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const toothId = Number(row?.ToothIndex);
    if (!ALL_TEETH.includes(toothId)) return;
    notes[toothId] = {
      present: row?.ToothPresence !== 1, // desktop: 0 = present, 1 = missing
      mobility: desktopMobilityToUi(row?.ToothNote_Mobility),
      rct: !!row?.ToothNote_RootCanal,
      restoration: desktopRestorationToUi(row?.ToothRestoration),
      crown: !!row?.ToothNote_Crown,
      implant: !!row?.ToothNote_Implant,
      rootStump: !!row?.ToothNote_RootStump,
      cracked: !!row?.ToothNote_Cracked,
      tilted: desktopTiltToUi(row?.ToothNote_Tilt),
      extraction: !!row?.ToothNote_Extraction,
      abutment: !!row?.ToothNote_Abutment,
    };
  });
  return notes;
}

// The source derives presence from statusFor(state.teeth) when a note lacks an
// explicit `present`. The annotation state isn't under test here, so this copy
// uses the same fallback path with "no annotation == present".
function statusFor() {
  return 'presence';
}

function clinicalNotesToApiRows(notes) {
  const ordered = [...UPPER_TEETH, ...LOWER_TEETH];
  return ordered.map((toothId) => {
    const note = notes?.[toothId] || emptyToothNote();
    const present = note.present !== undefined ? note.present : statusFor(toothId) !== 'missing';
    return {
      ToothIndex: toothId,
      ToothPresence: present ? 0 : 1, // desktop: 0 = present, 1 = missing
      ToothNote_Mobility: uiMobilityToDesktop(note.mobility),
      ToothNote_RootCanal: !!note.rct,
      ToothRestoration: uiRestorationToDesktop(note.restoration),
      ToothNote_Crown: !!note.crown,
      ToothNote_Implant: !!note.implant,
      ToothNote_RootStump: !!note.rootStump,
      ToothNote_Cracked: !!note.cracked,
      ToothNote_Tilt: uiTiltToDesktop(note.tilted),
      ToothNote_Extraction: !!note.extraction,
      ToothNote_Abutment: !!note.abutment,
    };
  });
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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
