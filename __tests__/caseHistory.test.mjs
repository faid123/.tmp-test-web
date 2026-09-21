/** @jest-environment jsdom */

import { jest } from "@jest/globals";
import { createCaseHistory } from "../src/js/shared/caseHistory.js";
import { API_BASE, MACHINE_ID } from "../src/js/shared/api.js";

const HISTORY_URL = `${API_BASE}/casehistory`;

const response = (status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
});

beforeEach(() => {
  localStorage.setItem(
    "loggedInUser",
    JSON.stringify({ uuid: "user-uuid-123", username: "alice" })
  );
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete global.fetch;
  localStorage.clear();
  jest.restoreAllMocks();
});

test("records the Unity-compatible case history shape in Unix seconds", async () => {
  jest.spyOn(Date, "now").mockReturnValue(1_800_000_123_456);
  global.fetch = jest.fn(async () => response());

  await expect(createCaseHistory(3149, "2D design approved")).resolves.toBe(true);

  expect(global.fetch).toHaveBeenCalledWith(
    HISTORY_URL,
    expect.objectContaining({ method: "POST" })
  );
  const [, options] = global.fetch.mock.calls[0];
  expect(JSON.parse(options.body)).toEqual([
    { machine_id: MACHINE_ID, uuid: "user-uuid-123", caseIntID: 3149 },
    {
      case_int_id: 3149,
      user_id: "user-uuid-123",
      action: "2D design approved",
      datetime: 1_800_000_123,
    },
  ]);
});

test("history failures remain non-fatal", async () => {
  global.fetch = jest.fn(async () => response(500));
  await expect(createCaseHistory(3149, "in progress")).resolves.toBe(false);

  global.fetch = jest.fn(async () => {
    throw new Error("offline");
  });
  await expect(createCaseHistory(3149, "in progress")).resolves.toBe(false);
});

test("does not post incomplete history records", async () => {
  global.fetch = jest.fn(async () => response());

  await expect(createCaseHistory(null, "Case created")).resolves.toBe(false);
  await expect(createCaseHistory(3149, " ")).resolves.toBe(false);
  expect(global.fetch).not.toHaveBeenCalled();
});

