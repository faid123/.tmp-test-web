// Password reset — the two backend calls and the rules around them.
//
// One implementation shared by both entry points: the "Forgot password" view on
// the login page (login.js) and the "Change Account Password" item in the app
// sidebar (changePassword.js). Both run the same two stages, differing only in
// where the email comes from — typed by a signed-out user, or read from the
// session of a signed-in one.
//
//   1. POST /user/reqpwreset  { email }
//        -> emails a numeric key; 404 when the email is unknown.
//   2. POST /user/resetpw     { email, passwordKey, newPassword }
//        -> sets the password; 403 timed_out/invalid_key, 404 key/email
//           not found.
//
// Both take the shared [{ machine_id }, { ...payload }] envelope and are
// authenticated by machine id only — which is why stage 2 needs the emailed
// key: possession of the mailbox is what proves the request is genuine. There
// is no endpoint that verifies a current password, so a signed-in change goes
// through the same key.

import { logApi } from "./apiLog.js";
import { API_BASE, MACHINE_ID } from "./api.js";


// Minimum length we require before accepting a new password. The backend
// enforces nothing, so this guard lives entirely on the client.
export const MIN_PASSWORD_LENGTH = 8;

// Score a password 1-4 (Weak/Fair/Good/Strong) from length + character
// variety. A password under the minimum length is always Weak regardless of
// variety; length >= 12 with 3+ character classes counts as Strong.
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

// Reject a new password that embeds the account's own identity — its username
// or email (requirement 2.3.2(h): a password must not be, or contain, the
// account/user ID). The match is case-insensitive and substring-based, so a
// username of "faid" is caught anywhere inside "myFaid2024!". Blank identifiers
// are ignored, letting each caller pass whatever it knows: a signed-out reset
// only has the email, while a signed-in change and the admin form also have the
// username. Accepts a single string or an array. Returns the matched identifier
// (trimmed, original case) or null when the password contains none of them.
export function findIdentifierInPassword(password, identifiers = []) {
  const pw = String(password || "").toLowerCase();
  if (!pw) return null;
  for (const raw of [].concat(identifiers)) {
    const id = String(raw || "").trim().toLowerCase();
    if (id && pw.includes(id)) return String(raw).trim();
  }
  return null;
}

// Validate the new-password pair before spending a network round-trip on it.
// `identifiers` is the username/email the password must not contain (a string
// or array; see findIdentifierInPassword). Returns null when the pair is
// acceptable, otherwise the message to show.
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

// Turn a failed stage-2 response into something worth reading. The backend
// returns 403 for both an expired and a wrong key, distinguishing them only by
// `kind`, so prefer that when it's present.
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
