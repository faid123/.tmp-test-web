/**
 * @jest-environment jsdom
 *
 * Exercises the REAL mergeInstructions(), exported from its only consumer,
 * src/js/2D/noticeboard.js. It dedupes local and server noticeboard items by a
 * stable key (title → id → preview) and lets server fields win on a key
 * collision while keeping local-only fields. These tests pin that key
 * precedence and the shallow-merge / server-wins behaviour.
 *
 * noticeboard.js reaches the DOM-heavy 2DAnnotation.js entry for `state`, so that
 * one module is mocked; the rest of the import tree (three.js via preview3D.js
 * included) loads for real, which is what the ~1s import costs.
 */
import { jest } from '@jest/globals';

jest.mock('../src/js/2D/2DAnnotation.js', () => ({
  state: { teeth: {} },
  setMessage: () => {},
  fetchCaseDetail: async () => ({}),
}));

import { mergeInstructions } from '../src/js/2D/noticeboard.js';

describe('mergeInstructions()', () => {
  test('merges a server item onto the local item sharing the same title key', () => {
    const local = [{ title: 'Instruction 1', baseImage: 'local-img', source: 'local' }];
    const server = [{ title: 'Instruction 1', preview: 'server-preview', source: 'server' }];

    const merged = mergeInstructions(local, server);

    expect(merged).toHaveLength(1);
    // Server fields win on conflict, local-only fields survive.
    expect(merged[0]).toEqual({
      title: 'Instruction 1',
      baseImage: 'local-img',
      preview: 'server-preview',
      source: 'server',
    });
  });

  test('keeps items with distinct keys separate', () => {
    const local = [{ title: 'A' }];
    const server = [{ title: 'B' }];
    const merged = mergeInstructions(local, server);
    expect(merged).toHaveLength(2);
    expect(merged.map((i) => i.title).sort()).toEqual(['A', 'B']);
  });

  test('falls back from title to id to preview when building the key', () => {
    const local = [
      { id: 'inst_1', note: 'by-id' },
      { preview: 'data:png', note: 'by-preview' },
    ];
    const server = [
      { id: 'inst_1', extra: 'server' }, // matches the id-keyed local item
      { preview: 'data:png', extra: 'server2' }, // matches the preview-keyed local item
    ];

    const merged = mergeInstructions(local, server);

    expect(merged).toHaveLength(2);
    expect(merged.find((i) => i.id === 'inst_1')).toEqual({
      id: 'inst_1',
      note: 'by-id',
      extra: 'server',
    });
    expect(merged.find((i) => i.preview === 'data:png')).toEqual({
      preview: 'data:png',
      note: 'by-preview',
      extra: 'server2',
    });
  });

  test('title takes precedence over id when both are present', () => {
    const local = [{ title: 'T', id: 'x', a: 1 }];
    const server = [{ title: 'T', id: 'y', b: 2 }]; // different id, same title → still merges
    const merged = mergeInstructions(local, server);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ title: 'T', id: 'y', a: 1, b: 2 });
  });

  test('tolerates null / undefined inputs', () => {
    expect(mergeInstructions(null, null)).toEqual([]);
    expect(mergeInstructions(undefined, [{ title: 'only-server' }])).toEqual([
      { title: 'only-server' },
    ]);
    expect(mergeInstructions([{ title: 'only-local' }], undefined)).toEqual([
      { title: 'only-local' },
    ]);
  });
});
