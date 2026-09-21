/** @jest-environment jsdom */

import { jest } from "@jest/globals";
import { fetchCaseHistory } from "../src/js/pages/versionHistory.js";
import { API_BASE, MACHINE_ID } from "../src/js/shared/api.js";

afterEach(() => {
  delete global.fetch;
  jest.restoreAllMocks();
});

test("loads history with the same two-object request shape as Unity", async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => [{ id: 1, action: "Case created" }],
  }));

  await expect(fetchCaseHistory(3149, "user-uuid-123")).resolves.toHaveLength(1);

  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe(`${API_BASE}/casehistory/getall`);
  expect(JSON.parse(options.body)).toEqual([
    { machine_id: MACHINE_ID, uuid: "user-uuid-123", caseIntID: 3149 },
    { case_int_id: 3149 },
  ]);
});

test("includes the backend error detail when history loading fails", async () => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 500,
    json: async () => ({ sqlMessage: "Table 'clientdb.case_history' doesn't exist" }),
  }));

  await expect(fetchCaseHistory(3149, "user-uuid-123")).rejects.toThrow(
    "HTTP 500: Table 'clientdb.case_history' doesn't exist"
  );
});

