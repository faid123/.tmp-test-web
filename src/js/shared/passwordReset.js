// Password reset, shared by login.js's "Forgot password" and changePassword.js —
// same two stages, differing only in where the email comes from.
//
//   1. POST /user/reqpwreset  { email } -> emails a key; 404 unknown email.
//   2. POST /user/resetpw     { email, passwordKey, newPassword }
//        -> 403 timed_out/invalid_key, 404 key/email not found.
//
// Both are authenticated by machine id only, which is why stage 2 needs the
// emailed key: possession of the mailbox is what proves the request is genuine.

import { logApi } from "./apiLog.js";
import { API_BASE, MACHINE_ID } from "./api.js";


// Minimum length we require before accepting a new password. The backend
// enforces nothing, so this guard lives entirely on the client.
export const MIN_PASSWORD_LENGTH = 8;

// Scores 1-4 (Weak/Fair/Good/Strong) from length + character variety. Under the
// minimum length is always Weak; >= 12 with 3+ classes is Strong.
export function computePasswordStrength(pw) {
  if (!pw) return { score: 0, label: "" };

  let variety = 0;
  if (/[a-z]/.test(pw)) variety++;
  if (/[A-Z]/.test(pw)) variety++;
  if (/\d/.test(pw)) variety++;
  if (/[^A-Za-z0-9]/.test(pw)) variety++;

  let score;
  if (pw.length < MIN_PASSWORD_LENGTH || variety <= 1) {
    score = 1;
  } else if (variety === 2) {
    score = 2;
  } else {
    score = 3;
  }
  if (pw.length >= 12 && variety >= 3) score = 4;

  const labels = { 1: "Weak", 2: "Fair", 3: "Good", 4: "Strong" };
  return { score, label: labels[score] };
}

// Rejects a password embedding its own username or email (2.3.2(h)), matched
// case-insensitively as a substring. Blank identifiers are ignored.
export function findIdentifierInPassword(password, identifiers = []) {
  const pw = String(password || "").toLowerCase();
  if (!pw) return null;
  for (const raw of [].concat(identifiers)) {
    const id = String(raw || "").trim().toLowerCase();
    if (id && pw.includes(id)) return String(raw).trim();
  }
  return null;
}

// Validates the pair before spending a round-trip. Returns null when acceptable,
// otherwise the message to show; `identifiers` feeds findIdentifierInPassword.
export function validateNewPassword(newPassword, confirmPassword, identifiers = []) {
  if (!newPassword) return "Please enter a new password.";
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return `Please use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (findIdentifierInPassword(newPassword, identifiers)) {
    return "Your password can't contain your username or email address. Please choose another password.";
  }
  if (newPassword !== confirmPassword) return "The passwords don't match.";
  return null;
}

// Turn a failed stage-1 response into something worth reading.
export function describeRequestError(status) {
  if (status === 404) return "No account was found for that email address.";
  return "Couldn't start the reset. Please try again later.";
}

// The backend returns 403 for both an expired and a wrong key, distinguishing
// them only by `kind`, so prefer that when present.
export function describeResetError(status, kind = "") {
  switch (kind) {
    case "timed_out":
      return "That key has expired. Request a new one and try again.";
    case "invalid_key":
    case "key_not_found":
      return "That key isn't valid. Please check it and try again.";
    case "email_not_found":
      return "No account was found for that email address.";
    default:
      return "Couldn't reset your password. Please try again later.";
  }
}

// Shared response shape: { ok, status, data }. `ok` means the backend both
// answered 2xx AND reported success — it returns 200 with successful:false.
async function post(path, payload, label) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ machine_id: MACHINE_ID }, payload]),
    });
  } catch (err) {
    console.error(`[passwordReset] ${label} failed:`, err);
    return { ok: false, status: 0, data: null };
  }
  logApi(res, label);
  const data = await res.json().catch(() => null);
  return { ok: res.ok && !!data?.successful, status: res.status, data };
}

// Stage 1: ask for a reset key to be emailed to this address.
export function requestResetKey(email) {
  return post("/user/reqpwreset", { email }, "POST /user/reqpwreset");
}

// Stage 2: redeem the emailed key and set the new password.
export function resetPassword({ email, passwordKey, newPassword }) {
  return post("/user/resetpw", { email, passwordKey, newPassword }, "POST /user/resetpw");
}
