// __tests__/passwordReset.test.mjs
//
// Guards src/js/shared/passwordReset.js — the rules both password entry points
// share (the login page's forgot view and the in-app Change Account Password
// dialog). A drift here would let one of them accept a password the other
// rejects, or show the wrong reason for a failed reset.
//
// The network wrapper is exercised against a stubbed global fetch so the
// request envelope and the "200 but successful:false" case are both pinned.

import { jest } from "@jest/globals";
import {
  MIN_PASSWORD_LENGTH,
  computePasswordStrength,
  validateNewPassword,
  describeRequestError,
  describeResetError,
  requestResetKey,
  resetPassword,
} from "../src/js/shared/passwordReset.js";

describe("computePasswordStrength()", () => {
  test("an empty password has no score and no label", () => {
    expect(computePasswordStrength("")).toEqual({ score: 0, label: "" });
  });

  test("anything under the minimum length is Weak however varied", () => {
    expect(computePasswordStrength("aB3$x").label).toBe("Weak");
  });

  test("length alone, with one character class, is still Weak", () => {
    expect(computePasswordStrength("aaaaaaaaaaaaaaa").label).toBe("Weak");
  });

  test("two character classes at length is Fair", () => {
    expect(computePasswordStrength("abcdefgh1").label).toBe("Fair");
  });

  test("three classes is Good until it is also long", () => {
    expect(computePasswordStrength("Abcdefg1").label).toBe("Good");
  });

  test("12+ characters with three classes is Strong", () => {
    expect(computePasswordStrength("Abcdefghijk1").label).toBe("Strong");
  });

  test("score and label always agree", () => {
    const labels = { 1: "Weak", 2: "Fair", 3: "Good", 4: "Strong" };
    for (const pw of ["a", "abcdefgh1", "Abcdefg1", "Abcdefghijk1!"]) {
      const { score, label } = computePasswordStrength(pw);
      expect(label).toBe(labels[score]);
    }
  });
});

describe("validateNewPassword()", () => {
  test("accepts a long enough, matching pair", () => {
    expect(validateNewPassword("abcdefgh", "abcdefgh")).toBeNull();
  });

  test("rejects an empty password", () => {
    expect(validateNewPassword("", "")).toMatch(/enter a new password/i);
  });

  test("rejects a password under the minimum length", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(short, short)).toMatch(new RegExp(`${MIN_PASSWORD_LENGTH} characters`));
  });

  test("rejects a mismatched confirmation", () => {
    expect(validateNewPassword("abcdefgh", "abcdefghi")).toMatch(/don't match/i);
  });

  test("length is checked before the match, so a short pair says so", () => {
    expect(validateNewPassword("abc", "xyz")).toMatch(/characters/i);
  });
});

describe("error messages", () => {
  test("an unknown email on stage 1 says so", () => {
    expect(describeRequestError(404)).toMatch(/no account/i);
  });

  test("any other stage 1 failure falls back to a retry message", () => {
    expect(describeRequestError(500)).toMatch(/try again later/i);
  });

  test("an expired key is distinguished from an invalid one", () => {
    // Both arrive as 403 — only `kind` separates them.
    expect(describeResetError(403, "timed_out")).toMatch(/expired/i);
    expect(describeResetError(403, "invalid_key")).toMatch(/isn't valid/i);
    expect(describeResetError(403, "key_not_found")).toMatch(/isn't valid/i);
  });

  test("a missing email is reported as such", () => {
    expect(describeResetError(404, "email_not_found")).toMatch(/no account/i);
  });

  test("an unrecognised kind falls back rather than leaking it", () => {
    expect(describeResetError(500, "something_new")).toMatch(/try again later/i);
    expect(describeResetError(500)).toMatch(/try again later/i);
  });
});

describe("endpoint calls", () => {
  const okResponse = (body) => ({
    ok: true,
    status: 200,
    json: async () => body,
    headers: { get: () => null },
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("requestResetKey posts the machine-id envelope the backend expects", async () => {
    global.fetch = jest.fn(async () => okResponse({ successful: true }));
    const result = await requestResetKey("tech@example.com");

    expect(result.ok).toBe(true);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/user\/reqpwreset$/);
    expect(init.method).toBe("POST");
    const [envelope, payload] = JSON.parse(init.body);
    expect(envelope).toHaveProperty("machine_id");
    expect(payload).toEqual({ email: "tech@example.com" });
  });

  test("resetPassword sends the key and the new password together", async () => {
    global.fetch = jest.fn(async () => okResponse({ successful: true }));
    await resetPassword({ email: "tech@example.com", passwordKey: "123456", newPassword: "abcdefgh" });

    const [, payload] = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(payload).toEqual({
      email: "tech@example.com",
      passwordKey: "123456",
      newPassword: "abcdefgh",
    });
  });

  test("a 200 carrying successful:false is not treated as success", async () => {
    // The backend answers 200 with successful:false, so HTTP status alone lies.
    global.fetch = jest.fn(async () => okResponse({ successful: false, kind: "invalid_key" }));
    const result = await resetPassword({ email: "a@b.c", passwordKey: "1", newPassword: "abcdefgh" });

    expect(result.ok).toBe(false);
    expect(describeResetError(result.status, result.data.kind)).toMatch(/isn't valid/i);
  });

  test("a non-2xx response reports its status for the caller to describe", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => null,
      headers: { get: () => null },
    }));
    const result = await requestResetKey("nobody@example.com");

    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(describeRequestError(result.status)).toMatch(/no account/i);
  });

  test("a network failure resolves as a failure rather than throwing", async () => {
    // The dialog awaits this call directly; a rejection would leave its submit
    // button disabled with no message shown.
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(requestResetKey("a@b.c")).resolves.toMatchObject({ ok: false, status: 0 });
  });
});
