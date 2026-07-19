// __tests__/artificialTeethDecode.test.mjs
//
// Guards the binary decode layer of src/viewer3d/artificialTeeth.js: the
// hand-rolled MessagePack decoder, the nested serialized-buffer expansion, and
// the tolerant point/quaternion/LE-float readers that turn the desktop app's
// /toothPlacementData/get payloads into placement transforms. A silent decode
// bug here doesn't throw — it places teeth in the wrong spot — so every byte
// sequence below is hand-written from the MessagePack spec (independent
// oracle), never produced by the code under test.
//
// Runs in the default node environment: artificialTeeth.js only needs
// TextDecoder/atob (Node globals) and `three` (CJS build) at import time.

import {
  toUint8Array,
  decodeMessagePack,
  expandSerializedBuffers,
  normalizeJawKey,
  toPointObject,
  toQuaternionObject,
  toDataView,
  readFloat64LE,
  readFloat32LE,
  readVector3Float64LE,
} from '../src/viewer3d/artificialTeeth.js';

const b = (...bytes) => new Uint8Array(bytes);

describe('toUint8Array()', () => {
  test('passes Uint8Array through and wraps ArrayBuffer / integer arrays', () => {
    const raw = b(1, 2, 3);
    expect(toUint8Array(raw)).toBe(raw);
    expect(Array.from(toUint8Array(raw.buffer))).toEqual([1, 2, 3]);
    expect(Array.from(toUint8Array([65, 66, 67]))).toEqual([65, 66, 67]);
  });

  test('decodes base64 strings, including data-URI payloads after the comma', () => {
    expect(Array.from(toUint8Array('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(toUint8Array('data:application/octet-stream;base64,AQID'))).toEqual([1, 2, 3]);
  });

  test('falls back to UTF-8 bytes for non-base64 text and null for junk', () => {
    expect(Array.from(toUint8Array('a b!'))).toEqual([0x61, 0x20, 0x62, 0x21]);
    expect(toUint8Array(null)).toBeNull();
    expect(toUint8Array(42)).toBeNull();
  });
});

describe('decodeMessagePack() — scalar types', () => {
  test('positive and negative fixint', () => {
    expect(decodeMessagePack(b(0x2a))).toBe(42);
    expect(decodeMessagePack(b(0xff))).toBe(-1);
    expect(decodeMessagePack(b(0xe0))).toBe(-32);
  });

  test('nil / true / false', () => {
    expect(decodeMessagePack(b(0xc0))).toBeNull();
    expect(decodeMessagePack(b(0xc3))).toBe(true);
    expect(decodeMessagePack(b(0xc2))).toBe(false);
  });

  test('uint8/16/32 and int8/16/32', () => {
    expect(decodeMessagePack(b(0xcc, 0xf0))).toBe(240);
    expect(decodeMessagePack(b(0xcd, 0x01, 0x00))).toBe(256);
    expect(decodeMessagePack(b(0xce, 0x00, 0x01, 0x00, 0x00))).toBe(65536);
    expect(decodeMessagePack(b(0xd0, 0x80))).toBe(-128);
    expect(decodeMessagePack(b(0xd1, 0xff, 0x00))).toBe(-256);
    expect(decodeMessagePack(b(0xd2, 0xff, 0xff, 0xff, 0x00))).toBe(-256);
  });

  test('uint32 above 2^31 stays positive (no sign-bit bleed)', () => {
    expect(decodeMessagePack(b(0xce, 0xff, 0xff, 0xff, 0xff))).toBe(4294967295);
  });

  test('64-bit ints: safe integers come back as numbers, oversized as strings', () => {
    // uint64 1 and int64 -2
    expect(decodeMessagePack(b(0xcf, 0, 0, 0, 0, 0, 0, 0, 1))).toBe(1);
    expect(
      decodeMessagePack(b(0xd3, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe))
    ).toBe(-2);
    // uint64 2^63 exceeds Number.MAX_SAFE_INTEGER -> decimal string
    expect(decodeMessagePack(b(0xcf, 0x80, 0, 0, 0, 0, 0, 0, 0))).toBe('9223372036854775808');
  });

  test('float32 and float64 are read big-endian per the spec', () => {
    // IEEE-754 BE: 1.5f = 3F C0 00 00; 1.5d = 3F F8 00 00 00 00 00 00
    expect(decodeMessagePack(b(0xca, 0x3f, 0xc0, 0x00, 0x00))).toBe(1.5);
    expect(decodeMessagePack(b(0xcb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0))).toBe(1.5);
    // -2.5f = C0 20 00 00
    expect(decodeMessagePack(b(0xca, 0xc0, 0x20, 0x00, 0x00))).toBe(-2.5);
  });

  test('fixstr and str8', () => {
    expect(decodeMessagePack(b(0xa2, 0x68, 0x69))).toBe('hi');
    expect(decodeMessagePack(b(0xd9, 0x03, 0x61, 0x62, 0x63))).toBe('abc');
  });
});

describe('decodeMessagePack() — containers and structure', () => {
  test('fixarray / fixmap with mixed values', () => {
    // [1, "a", null]
    expect(decodeMessagePack(b(0x93, 0x01, 0xa1, 0x61, 0xc0))).toEqual([1, 'a', null]);
    // {"a": 1, "b": [2, 3]}
    expect(
      decodeMessagePack(b(0x82, 0xa1, 0x61, 0x01, 0xa1, 0x62, 0x92, 0x02, 0x03))
    ).toEqual({ a: 1, b: [2, 3] });
  });

  test('array16 and map16 headers', () => {
    // array16 of 3 ints; map16 of one pair
    expect(decodeMessagePack(b(0xdc, 0x00, 0x03, 0x01, 0x02, 0x03))).toEqual([1, 2, 3]);
    expect(decodeMessagePack(b(0xde, 0x00, 0x01, 0xa1, 0x6b, 0x07))).toEqual({ k: 7 });
  });

  test('bin8 payloads decode to plain number arrays', () => {
    expect(decodeMessagePack(b(0xc4, 0x03, 0x0a, 0x0b, 0x0c))).toEqual([10, 11, 12]);
  });

  test('ext types are preserved as tagged blobs, not dropped', () => {
    // fixext4, type 1, bytes 01 02 03 04
    expect(decodeMessagePack(b(0xd6, 0x01, 0x01, 0x02, 0x03, 0x04))).toEqual({
      __messagePackExt: true,
      data: [1, 2, 3, 4],
    });
  });

  test('rejects truncated payloads, trailing bytes, and the reserved 0xc1 prefix', () => {
    expect(() => decodeMessagePack(b(0xa5, 0x68, 0x69))).toThrow(/ended unexpectedly/);
    expect(() => decodeMessagePack(b(0x01, 0x02))).toThrow(/trailing bytes/);
    expect(() => decodeMessagePack(b(0xc1))).toThrow(/Unsupported MessagePack prefix/);
    expect(decodeMessagePack(b())).toBeNull();
  });

  test('accepts a base64 string as input (API fields arrive base64-encoded)', () => {
    // base64 of [0x92, 0x01, 0x02] = [1, 2]
    expect(decodeMessagePack(Buffer.from([0x92, 0x01, 0x02]).toString('base64'))).toEqual([1, 2]);
  });
});

describe('expandSerializedBuffers()', () => {
  // msgpack {"x": 1, "y": 2} as a plain byte array (how nested buffers arrive
  // in JSON). Must be >4 bytes: isByteArray() ignores shorter arrays.
  const nestedMap = [0x82, 0xa1, 0x78, 0x01, 0xa1, 0x79, 0x02];

  test('decodes a byte-array field in place AND into a sibling <key>_decoded field', () => {
    const out = expandSerializedBuffers({ transform_data: nestedMap, label: 'tooth11' });
    expect(out.transform_data_decoded).toEqual({ x: 1, y: 2 });
    // the recursive pass also replaces the field value itself with the decode
    expect(out.transform_data).toEqual({ x: 1, y: 2 });
    expect(out.label).toBe('tooth11');
  });

  test('replaces an array that is itself a MessagePack buffer', () => {
    expect(expandSerializedBuffers([0x82, 0xa1, 0x78, 0x2a, 0xa1, 0x79, 0x02])).toEqual({ x: 42, y: 2 });
  });

  test('a nested buffer of 4 bytes or fewer is below the isByteArray threshold and stays raw', () => {
    // {"x": 1} is exactly 4 bytes — valid msgpack, but deliberately not expanded.
    const out = expandSerializedBuffers({ transform_data: [0x81, 0xa1, 0x78, 0x01] });
    expect(out.transform_data_decoded).toBeUndefined();
  });

  test('leaves ordinary values and non-decodable fields untouched', () => {
    const input = { name: 'case', points: [1, 2, 3], data: [9, 9] };
    const out = expandSerializedBuffers(input);
    expect(out.name).toBe('case');
    expect(out.points).toEqual([1, 2, 3]);
    expect(out.data_decoded).toBeUndefined(); // [9,9] is not valid msgpack of an object
  });
});

describe('normalizeJawKey()', () => {
  test('maps desktop jaw spellings and the numeric enum to upper/lower', () => {
    expect(normalizeJawKey('upper_jaw')).toBe('upper');
    expect(normalizeJawKey('MAXILLARY')).toBe('upper');
    expect(normalizeJawKey('2')).toBe('upper');
    expect(normalizeJawKey('lower_jaw')).toBe('lower');
    expect(normalizeJawKey('Mandibular')).toBe('lower');
    expect(normalizeJawKey(1)).toBe('lower');
    expect(normalizeJawKey('unknown')).toBeNull();
    expect(normalizeJawKey('')).toBeNull();
  });
});

describe('toPointObject() / toQuaternionObject()', () => {
  test('accepts arrays, x/y/z objects, desktop X/Y/Z and pos_x casings, JSON strings', () => {
    expect(toPointObject([1, 2, 3])).toEqual({ x: 1, y: 2, z: 3 });
    expect(toPointObject({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
    expect(toPointObject({ X: 1, Y: 2, Z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
    expect(toPointObject({ pos_x: 1, pos_y: 2, pos_z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
    expect(toPointObject('{"x":1,"y":2,"z":3}')).toEqual({ x: 1, y: 2, z: 3 });
  });

  test('refuses byte arrays (raw buffers must not masquerade as coordinates)', () => {
    expect(toPointObject([10, 20, 30, 40, 50, 60])).toBeNull();
    expect(toQuaternionObject([10, 20, 30, 40, 50, 60])).toBeNull();
  });

  test('refuses incomplete or non-numeric input', () => {
    expect(toPointObject({ x: 1, y: 2 })).toBeNull();
    expect(toPointObject('not json')).toBeNull();
    expect(toQuaternionObject({ x: 1, y: 2, z: 3 })).toBeNull(); // missing w
    expect(toQuaternionObject(null)).toBeNull();
  });

  test('quaternions accept [x,y,z,w] arrays and X/Y/Z/W objects', () => {
    expect(toQuaternionObject([0, 0, 0, 1])).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(toQuaternionObject({ X: 0, Y: 0, Z: 0, W: 1 })).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });
});

describe('little-endian binary readers', () => {
  const f64le = (...vals) => {
    const buf = new ArrayBuffer(vals.length * 8);
    const view = new DataView(buf);
    vals.forEach((v, i) => view.setFloat64(i * 8, v, true));
    return new Uint8Array(buf);
  };

  test('readFloat64LE / readFloat32LE read little-endian and NaN out of bounds', () => {
    const view = toDataView(f64le(1.5));
    expect(readFloat64LE(view, 0)).toBe(1.5);
    expect(readFloat64LE(view, 1)).toBeNaN(); // straddles the end
    expect(readFloat32LE(toDataView(b(0x00, 0x00, 0xc0, 0x3f)), 0)).toBe(1.5); // LE 1.5f
    expect(readFloat32LE(toDataView(b(0x00)), 0)).toBeNaN();
  });

  test('readVector3Float64LE reads 24 bytes into a point', () => {
    expect(readVector3Float64LE(toDataView(f64le(1.5, -2.5, 3.25)), 0)).toEqual({
      x: 1.5,
      y: -2.5,
      z: 3.25,
    });
  });

  test('rejects implausible magnitudes (>=10000) and truncated buffers', () => {
    expect(readVector3Float64LE(toDataView(f64le(1e5, 0, 0)), 0)).toBeNull();
    expect(readVector3Float64LE(toDataView(f64le(1.5, 2.5)), 0)).toBeNull(); // only 16 bytes
  });
});
