// __tests__/endpoints.test.mjs
//
// Mocked-fetch endpoint-contract tests for the SmartRPD calls touched on this
// branch. `global.fetch` is stubbed — nothing hits the network — and we assert
// each request's URL / method / headers / body, the per-case concurrency cap,
// how responses are reduced, and that failures are swallowed.
//
// The functions below are faithful copies of the (non-exported) helpers in
// src/js/caseManagement.js and src/js/chat.js; deps (logged-in user, logApi)
// are injected so the request contract can be exercised in isolation.

import { jest } from '@jest/globals';

const API = 'https://live.api.smartrpdai.com/api/smartrpd';
const MACHINE_ID = '3a0df9c37b50873c63cebecd7bed73152a5ef616';
const CASE_DETAIL_FETCH_CONCURRENCY = 5;

// --- copies of the source helpers -----------------------------------------

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await mapper(items[i], i);
    }
  };
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i += 1) workers.push(runWorker());
  await Promise.all(workers);
  return results;
}

async function fetchAdditionalCaseDetails(caseList, { getLoggedInUser, logApi = () => {} }) {
  const logged = getLoggedInUser();
  if (!logged || !caseList?.length) return {};
  const url = `${API}/additionalcasedetails/getall`;
  const results = await mapWithConcurrency(caseList, CASE_DETAIL_FETCH_CONCURRENCY, (c) => {
    const body = [
      { machine_id: MACHINE_ID, uuid: logged.uuid, caseIntID: c.case_int_id ?? c.id },
    ];
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => { logApi(r, 'POST /additionalcasedetails/getall'); return r.ok ? r.json() : []; })
      .then((arr) => arr.at(-1))
      .catch(() => undefined);
  });
  const map = {};
  results.forEach((item) => {
    if (!item || !item.case_int_id) return;
    map[String(item.case_int_id)] = {
      expected_date: item.due_date,
      new_status: item.new_status,
      assigned_to: item.assigned_to,
      comments: item.comments,
    };
  });
  return map;
}

async function fetchCoOwners(caseList, { getLoggedInUser, logApi = () => {} }) {
  const logged = getLoggedInUser();
  if (!logged || !caseList?.length) return {};
  const url = `${API}/role/all/get`;
  const results = await mapWithConcurrency(caseList, CASE_DETAIL_FETCH_CONCURRENCY, (c) => {
    const caseIntID = c.case_int_id ?? c.id;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { machine_id: MACHINE_ID, uuid: logged.uuid, caseIntID },
        { case_int_id: caseIntID },
      ]),
    })
      .then((r) => { logApi(r, 'POST /role/all/get'); return r.ok ? r.json() : []; })
      .then((arr) => ({ id: caseIntID, rows: Array.isArray(arr) ? arr : [] }))
      .catch(() => ({ id: caseIntID, rows: [] }));
  });
  const map = {};
  results.forEach(({ id, rows }) => {
    if (!id) return;
    const names = rows.filter((r) => r && r.role === 'coowner' && r.username).map((r) => r.username);
    if (names.length) map[String(id)] = names;
  });
  return map;
}

// chat.js — request contract for the two notes endpoints.
async function fetchNotes(caseId) {
  if (!caseId) return;
  await fetch(`${API}/notes/get/${caseId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

async function createNote(caseId, author, content, imageBase64 = null) {
  if (!caseId) return;
  await fetch(`${API}/notes/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      case_int_id: caseId,
      author_username: author,
      content: content || null,
      image_base64: imageBase64 || null,
    }),
  });
}

// --- helpers ----------------------------------------------------------------

const okJson = (data) => ({ ok: true, json: () => Promise.resolve(data) });
// Parse the [url, options] of the Nth fetch call into a comparable shape.
const callAt = (n) => {
  const [url, opts] = global.fetch.mock.calls[n];
  return { url, ...opts, body: JSON.parse(opts.body) };
};

const user = { uuid: 'user-uuid-123' };
const getLoggedInUser = () => user;

afterEach(() => { delete global.fetch; });

// ---------------------------------------------------------------------------

describe('POST /additionalcasedetails/getall (fetchAdditionalCaseDetails)', () => {
  test('sends one correctly-shaped request per case', async () => {
    global.fetch = jest.fn(() => Promise.resolve(okJson([])));
    const cases = [{ case_int_id: 11 }, { id: 22 }]; // covers case_int_id and id fallback

    await fetchAdditionalCaseDetails(cases, { getLoggedInUser });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const c0 = callAt(0);
    expect(c0.url).toBe(`${API}/additionalcasedetails/getall`);
    expect(c0.method).toBe('POST');
    expect(c0.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(c0.body).toEqual([{ machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: 11 }]);
    // second case has no case_int_id → falls back to id
    expect(callAt(1).body[0].caseIntID).toBe(22);
  });

  test('reduces the [{…}] response into a cleaned, case-keyed map', async () => {
    global.fetch = jest.fn(() => Promise.resolve(okJson([
      { case_int_id: 11, due_date: '2026-06-30', new_status: 'In Progress', assigned_to: 'bob', comments: 'hi' },
    ])));

    const map = await fetchAdditionalCaseDetails([{ case_int_id: 11 }], { getLoggedInUser });

    expect(map).toEqual({
      11: { expected_date: '2026-06-30', new_status: 'In Progress', assigned_to: 'bob', comments: 'hi' },
    });
  });

  test('never exceeds the concurrency cap with a large case list', async () => {
    let active = 0;
    let peak = 0;
    global.fetch = jest.fn(async () => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 3));
      active -= 1;
      return okJson([]);
    });

    const cases = Array.from({ length: 20 }, (_, i) => ({ case_int_id: i }));
    await fetchAdditionalCaseDetails(cases, { getLoggedInUser });

    expect(global.fetch).toHaveBeenCalledTimes(20);
    expect(peak).toBe(CASE_DETAIL_FETCH_CONCURRENCY);
  });

  test('short-circuits (no fetch) when not logged in or list is empty', async () => {
    global.fetch = jest.fn();
    expect(await fetchAdditionalCaseDetails([{ id: 1 }], { getLoggedInUser: () => null })).toEqual({});
    expect(await fetchAdditionalCaseDetails([], { getLoggedInUser })).toEqual({});
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('swallows a failed request and still returns the others', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(okJson([{ case_int_id: 11, due_date: 'd', new_status: 's', assigned_to: 'a', comments: 'c' }]))
      .mockRejectedValueOnce(new Error('network'));

    const map = await fetchAdditionalCaseDetails([{ case_int_id: 11 }, { case_int_id: 22 }], { getLoggedInUser });

    expect(Object.keys(map)).toEqual(['11']); // case 22 dropped, no throw
  });
});

describe('POST /role/all/get (fetchCoOwners)', () => {
  test('sends the two-element body shape per case', async () => {
    global.fetch = jest.fn(() => Promise.resolve(okJson([])));
    await fetchCoOwners([{ case_int_id: 7 }], { getLoggedInUser });

    const c0 = callAt(0);
    expect(c0.url).toBe(`${API}/role/all/get`);
    expect(c0.method).toBe('POST');
    expect(c0.body).toEqual([
      { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: 7 },
      { case_int_id: 7 },
    ]);
  });

  test('keeps only coowner rows with a username', async () => {
    global.fetch = jest.fn(() => Promise.resolve(okJson([
      { role: 'coowner', username: 'alice' },
      { role: 'owner', username: 'bob' },     // wrong role → dropped
      { role: 'coowner' },                     // no username → dropped
      { role: 'coowner', username: 'carol' },
    ])));

    const map = await fetchCoOwners([{ case_int_id: 7 }], { getLoggedInUser });
    expect(map).toEqual({ 7: ['alice', 'carol'] });
  });

  test('omits cases that have no co-owners', async () => {
    global.fetch = jest.fn(() => Promise.resolve(okJson([{ role: 'owner', username: 'bob' }])));
    const map = await fetchCoOwners([{ case_int_id: 7 }], { getLoggedInUser });
    expect(map).toEqual({});
  });

  test('treats a failed request as no co-owners', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('boom')));
    const map = await fetchCoOwners([{ case_int_id: 7 }], { getLoggedInUser });
    expect(map).toEqual({});
  });
});

describe('chat notes endpoints', () => {
  test('POST /notes/get/:id carries the case id in the URL and an empty body', async () => {
    global.fetch = jest.fn(() => Promise.resolve(okJson([])));
    await fetchNotes(2275);

    const c0 = callAt(0);
    expect(c0.url).toBe(`${API}/notes/get/2275`);
    expect(c0.method).toBe('POST');
    expect(c0.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(c0.body).toEqual({});
  });

  test('POST /notes/create normalizes empty content/image to null', async () => {
    global.fetch = jest.fn(() => Promise.resolve(okJson({})));
    await createNote(2275, 'nyunt', '', null);

    expect(callAt(0).body).toEqual({
      case_int_id: 2275,
      author_username: 'nyunt',
      content: null,
      image_base64: null,
    });
  });

  test('POST /notes/create sends text and image when present', async () => {
    global.fetch = jest.fn(() => Promise.resolve(okJson({})));
    await createNote(2275, 'nyunt', 'hello', 'BASE64DATA');

    expect(callAt(0).body).toEqual({
      case_int_id: 2275,
      author_username: 'nyunt',
      content: 'hello',
      image_base64: 'BASE64DATA',
    });
  });

  test('neither notes call fires without a case id', async () => {
    global.fetch = jest.fn();
    await fetchNotes(undefined);
    await createNote(undefined, 'nyunt', 'hi');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
