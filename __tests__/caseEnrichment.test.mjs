// __tests__/caseEnrichment.test.mjs
//
// Guards the REAL wire contract of the case-list lazy enrichment
// (src/js/caseEnrichment.js — the request/fold layer that caseManagement.js's
// enrichQueue drives through resilientFetch). Replaces the deleted
// endpoints.test.mjs, which asserted hand-copied wrapper functions that had
// silently drifted from the shipping code (wrong concurrency cap, helpers that
// no longer existed).
//
// caseManagement.js itself (queue, observer, breaker, DOM row patching) is
// deliberately NOT imported — it boots the whole case-list page.
//
// Also covers the module's reference-image half, read by the case-list download
// bundle and the 2D page's Reference Images tab.

import { jest } from '@jest/globals';
import {
  ENRICH_CONCURRENCY,
  caseIntIdOf,
  buildEnrichRequests,
  applyEnrichmentResponses,
  fetchReferenceImageRows,
  referenceImageMime,
  referenceImageSrc,
  referenceImageTitle,
} from '../src/js/shared/caseEnrichment.js';

const API = 'https://live.api.smartrpdai.com/api/smartrpd';
const MACHINE_ID = '3a0df9c37b50873c63cebecd7bed73152a5ef616';
const UUID = 'user-uuid-123';

const okJson = (data) => ({ ok: true, json: () => Promise.resolve(data) });
const parsed = ([url, options]) => ({ url, ...options, body: JSON.parse(options.body) });

describe('enrichment constants', () => {
  test('concurrency cap stays at 3 (backend 403-throttles bursts — bump only with backend coordination)', () => {
    expect(ENRICH_CONCURRENCY).toBe(3);
  });
});

describe('caseIntIdOf()', () => {
  test('prefers case_int_id, falls back to id, tolerates junk', () => {
    expect(caseIntIdOf({ case_int_id: 11, id: 99 })).toBe(11);
    expect(caseIntIdOf({ id: 22 })).toBe(22);
    expect(caseIntIdOf({})).toBeUndefined();
    expect(caseIntIdOf(null)).toBeUndefined();
  });
});

describe('buildEnrichRequests()', () => {
  test('detail request: POST /additionalcasedetails/getall with the single-element auth body', () => {
    const [detail] = buildEnrichRequests(2275, UUID);
    expect(parsed(detail)).toEqual({
      url: `${API}/additionalcasedetails/getall`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: [{ machine_id: MACHINE_ID, uuid: UUID, caseIntID: 2275 }],
    });
  });

  test('roles request: POST /role/all/get with the two-element body shape', () => {
    const [, roles] = buildEnrichRequests(2275, UUID);
    expect(parsed(roles)).toEqual({
      url: `${API}/role/all/get`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: [
        { machine_id: MACHINE_ID, uuid: UUID, caseIntID: 2275 },
        { case_int_id: 2275 },
      ],
    });
  });
});

describe('applyEnrichmentResponses() — detail fold', () => {
  test('folds the last element of the [{…}] response into the case fields', async () => {
    const caseObj = { case_int_id: 11 };
    const ok = await applyEnrichmentResponses(
      caseObj,
      okJson([
        { case_int_id: 11, due_date: 'old', new_status: 'old' }, // superseded row
        { case_int_id: 11, due_date: '2026-06-30', new_status: 'In Progress', assigned_to: 'bob', comments: 'hi' },
      ]),
      null
    );
    expect(ok).toBe(true);
    expect(caseObj).toMatchObject({
      expected_date: '2026-06-30',
      new_status: 'In Progress',
      assigned_to: 'bob',
      comments: 'hi',
    });
  });

  test('ignores a last element without case_int_id; tolerates malformed / non-array bodies', async () => {
    const noId = { case_int_id: 11 };
    expect(await applyEnrichmentResponses(noId, okJson([{ due_date: 'd' }]), null)).toBe(true);
    expect(noId.expected_date).toBeUndefined();

    const malformed = { case_int_id: 11 };
    expect(
      await applyEnrichmentResponses(malformed, { ok: true, json: () => Promise.reject(new Error('bad json')) }, null)
    ).toBe(true);
    expect(malformed.expected_date).toBeUndefined();

    const nonArray = { case_int_id: 11 };
    expect(await applyEnrichmentResponses(nonArray, okJson({ not: 'an array' }), null)).toBe(true);
    expect(nonArray.expected_date).toBeUndefined();
  });

  test('a real !ok answer is terminal: returns true (no park/retry) and keeps base fields', async () => {
    const caseObj = { case_int_id: 11, new_status: 'base' };
    const ok = await applyEnrichmentResponses(caseObj, { ok: false, status: 403 }, null);
    expect(ok).toBe(true);
    expect(caseObj.new_status).toBe('base');
  });
});

describe('applyEnrichmentResponses() — roles fold', () => {
  test('keeps only coowner rows with a username', async () => {
    const caseObj = { case_int_id: 7 };
    await applyEnrichmentResponses(
      caseObj,
      null,
      okJson([
        { role: 'coowner', username: 'alice' },
        { role: 'owner', username: 'bob' }, // wrong role → dropped from co_owners
        { role: 'coowner' }, // no username → dropped
        { role: 'coowner', username: 'carol' },
      ])
    );
    expect(caseObj.co_owners).toEqual(['alice', 'carol']);
  });

  test('the owner role row overrides a placeholder assigned_to', async () => {
    const caseObj = { case_int_id: 7, assigned_to: 'nobody' };
    await applyEnrichmentResponses(caseObj, null, okJson([{ role: 'Owner', username: 'bob' }]));
    expect(caseObj.assigned_to).toBe('bob');
  });

  test('without an owner row, a raw-uuid assigned_to remaps to that row\'s username', async () => {
    const caseObj = { case_int_id: 7, assigned_to: 'uuid-42' };
    await applyEnrichmentResponses(
      caseObj,
      null,
      okJson([{ role: 'coowner', uuid: 'uuid-42', username: 'alice' }])
    );
    expect(caseObj.assigned_to).toBe('alice');
    expect(caseObj.co_owners).toEqual(['alice']);
  });
});

describe('applyEnrichmentResponses() — refusal contract', () => {
  test('both responses null (throttle/outage) → false so the caller parks and retries', async () => {
    const caseObj = { case_int_id: 7 };
    expect(await applyEnrichmentResponses(caseObj, null, null)).toBe(false);
    expect(caseObj.co_owners).toBeUndefined();
  });

  test('one refused + one ok → true, and the available response still folds', async () => {
    const caseObj = { case_int_id: 7 };
    const ok = await applyEnrichmentResponses(caseObj, null, okJson([{ role: 'coowner', username: 'alice' }]));
    expect(ok).toBe(true);
    expect(caseObj.co_owners).toEqual(['alice']);
  });

  test('logs each answered request through logApi with its endpoint label', async () => {
    const logApi = jest.fn();
    const detailRes = okJson([]);
    const rolesRes = okJson([]);
    await applyEnrichmentResponses({ case_int_id: 7 }, detailRes, rolesRes, logApi);
    expect(logApi).toHaveBeenCalledWith(detailRes, 'POST /additionalcasedetails/getall');
    expect(logApi).toHaveBeenCalledWith(rolesRes, 'POST /role/all/get');
  });
});

// --- reference images -----------------------------------------------------

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// Answers each endpoint from a map; anything unlisted 404s.
function stubFetch(routes) {
  const calls = [];
  global.fetch = jest.fn(async (url) => {
    calls.push(String(url));
    const hit = Object.entries(routes).find(([path]) => String(url).includes(path));
    return hit ? hit[1] : jsonResponse({}, 404);
  });
  return calls;
}

afterEach(() => {
  delete global.fetch;
});

describe("fetchReferenceImageRows", () => {
  test("returns the referenceImages rows and never asks for thumbnails", async () => {
    const calls = stubFetch({
      "/referenceImages/getall": jsonResponse([
        { image_name: "a.png", image_data: "iVBORw0KGgo=" },
        { image_name: "b.png", image_data: "iVBORw0KGgo=" },
      ]),
    });

    const rows = await fetchReferenceImageRows(3008, "uuid-1");

    expect(rows.map((r) => r.image_name)).toEqual(["a.png", "b.png"]);
    expect(calls.some((u) => u.includes("/thumbnails/get"))).toBe(false);
  });

  test("drops rows that carry no image payload", async () => {
    stubFetch({
      "/referenceImages/getall": jsonResponse([
        { image_name: "a.png", image_data: "iVBORw0KGgo=" },
        { image_name: "empty.png" },
      ]),
    });

    expect(await fetchReferenceImageRows(3008, "uuid-1")).toHaveLength(1);
  });

  test("falls back to thumbnail slots 3+ when the table has no rows", async () => {
    stubFetch({
      "/referenceImages/getall": jsonResponse([]),
      "/thumbnails/get": jsonResponse([
        { slot: 0, data: "2d-composite" },
        { slot: 1, data: "upper-render" },
        { slot: 2, data: "lower-render" },
        { slot: 3, data: "first-reference" },
        { slot: 4, data: "second-reference" },
      ]),
    });

    const rows = await fetchReferenceImageRows(3008, "uuid-1");

    expect(rows.map((r) => r.data)).toEqual(["first-reference", "second-reference"]);
  });

  test("a broken primary lookup still resolves when the fallback finds images", async () => {
    stubFetch({
      "/referenceImages/getall": jsonResponse({}, 500),
      "/thumbnails/get": jsonResponse([{ slot: 3, data: "first-reference" }]),
    });

    expect(await fetchReferenceImageRows(3008, "uuid-1")).toHaveLength(1);
  });

  test("a broken primary lookup throws when the fallback is empty too — 'no images' is not 'lookup broke'", async () => {
    stubFetch({
      "/referenceImages/getall": jsonResponse({}, 500),
      "/thumbnails/get": jsonResponse([]),
    });

    await expect(fetchReferenceImageRows(3008, "uuid-1")).rejects.toThrow("HTTP 500");
  });

  test("no images anywhere resolves empty rather than throwing", async () => {
    stubFetch({
      "/referenceImages/getall": jsonResponse([]),
      "/thumbnails/get": jsonResponse([]),
    });

    expect(await fetchReferenceImageRows(3008, "uuid-1")).toEqual([]);
  });
});

describe("decoding a row for display", () => {
  test("media type comes from the base64 signature — stored rows carry none", () => {
    expect(referenceImageMime("iVBORw0KGgoAAAA")).toBe("image/png");
    expect(referenceImageMime("/9j/4AAQSkZJRg")).toBe("image/jpeg");
    expect(referenceImageMime("R0lGODlhAQABAI")).toBe("image/gif");
    expect(referenceImageMime("Qk32AAAAAAAAAD")).toBe("image/bmp");
    expect(referenceImageMime("UklGRiQAAABXRU")).toBe("image/webp");
  });

  test("bare base64 becomes a data URL, an existing data URL passes through", () => {
    expect(referenceImageSrc({ image_data: "/9j/4AAQSkZJRg" })).toBe(
      "data:image/jpeg;base64,/9j/4AAQSkZJRg"
    );
    expect(referenceImageSrc({ data: "data:image/gif;base64,R0lGOD" })).toBe(
      "data:image/gif;base64,R0lGOD"
    );
  });

  test("payload whitespace is stripped — a wrapped base64 blob breaks <img> otherwise", () => {
    expect(referenceImageSrc({ image_data: "iVBORw0K\nGgoA AAA" })).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAA"
    );
  });

  test("a row with no payload yields no src", () => {
    expect(referenceImageSrc({ image_name: "a.png" })).toBe("");
  });

  test("nameless rows (every thumbnail-slot row) fall back to their position", () => {
    expect(referenceImageTitle({ image_name: "intraoral.png" }, 0)).toBe("intraoral.png");
    expect(referenceImageTitle({ slot: 3, data: "x" }, 2)).toBe("Reference 3");
  });
});
