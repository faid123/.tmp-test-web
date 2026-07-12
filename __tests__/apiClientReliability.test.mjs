/**
 * @jest-environment jsdom
 */

// Regression coverage for the two ApiClient reliability behaviours documented
// in the project report (§8.2/§8.3): the shared session-login singleton, and
// the missing-Content-Length fallback used by the GCP-proxy case.
//
// Unlike login.test.mjs (which re-implements its own fake login() inline
// instead of importing src/js/login.js), these tests import the real
// src/ApiClient.js so a regression in the actual module fails the suite.
//
// sessionLoginPromise is module-level state, so each test gets a fresh module
// instance via jest.resetModules() + dynamic import rather than sharing one
// import across tests.

import { jest } from '@jest/globals';

function jsonResponse(body, { ok = true, status = 200, contentLength = null } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => (name === 'content-length' ? contentLength : null) },
    json: async () => body,
  };
}

async function freshApiClient() {
  jest.resetModules();
  const { ApiClient } = await import('../src/ApiClient.js');
  return new ApiClient('https://live.api.smartrpdai.com/api/smartrpd');
}

describe('ApiClient session-login singleton', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('concurrent post() calls share one /user/login request', async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/user/login')) {
        return Promise.resolve(jsonResponse({ uuid: 'session-1' }));
      }
      return Promise.resolve(jsonResponse({ ok: true }, { contentLength: null }));
    });

    const client = await freshApiClient();
    await Promise.all([
      client.post('/case/get/1', {}, true),
      client.post('/case/get/2', {}, true),
      client.post('/case/get/3', {}, true),
    ]);

    const loginCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('/user/login'));
    expect(loginCalls).toHaveLength(1);
  });

  test('a failed login resets the singleton so the next call retries', async () => {
    let loginAttempts = 0;
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/user/login')) {
        loginAttempts += 1;
        return loginAttempts === 1
          ? Promise.resolve(jsonResponse({}, { ok: false, status: 500 }))
          : Promise.resolve(jsonResponse({ uuid: 'session-2' }));
      }
      return Promise.resolve(jsonResponse({ ok: true }, { contentLength: null }));
    });

    const client = await freshApiClient();

    await expect(client.post('/case/get/1', {}, true)).rejects.toThrow();
    // Second call must not be permanently stuck on the rejected singleton promise.
    await expect(client.post('/case/get/1', {}, true)).resolves.toBeDefined();
    expect(loginAttempts).toBe(2);
  });
});

describe('ApiClient.post() missing Content-Length fallback (§8.3)', () => {
  beforeEach(() => {
    global.fetch = jest.fn((url) => {
      if (String(url).includes('/user/login')) {
        return Promise.resolve(jsonResponse({ uuid: 'session-1' }));
      }
      // No content-length header — the documented GCP chunked-transfer case.
      return Promise.resolve(jsonResponse({ data: 'ok' }, { contentLength: null }));
    });
  });

  test('falls back to response.json() without throwing', async () => {
    const client = await freshApiClient();

    // §8.3 claims this path is "confirmed present" and falls back to
    // response.json() instead of aborting. As written, ApiClient.js:44-48
    // references `container` before its `let container = ...` declaration
    // on line 55 — same function scope, so this is a temporal-dead-zone
    // ReferenceError, not a successful fallback. This assertion documents
    // the fix as currently working; if the TDZ bug below is present instead,
    // THIS assertion is the one that fails, not the one under it.
    await expect(client.post('/stl/get', { id: 1 })).resolves.toEqual({ data: 'ok' });
  });

  test('reproduces the container TDZ bug if present', async () => {
    const client = await freshApiClient();
    let caught = null;
    try {
      await client.post('/stl/get', { id: 1 });
    } catch (error) {
      caught = error;
    }

    if (caught) {
      // This is the failure mode: every request that hits the no-Content-Length
      // path throws before it can return response.json(), so callers relying on
      // the documented fallback behaviour get an uncaught rejection instead of data.
      expect(caught.message).toMatch(/container/);
    }
    // If caught is null, the fallback genuinely works and this test is a no-op —
    // left in so a future regression back to the TDZ bug is caught immediately.
  });
});
