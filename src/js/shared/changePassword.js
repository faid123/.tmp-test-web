// "Change Account Password" — the in-app half of the password reset flow,
// opened from the sidebar on any page that carries #appSidebar.
//
// Same two stages as the login page's forgot-password view, backed by the same
// endpoints in shared/passwordReset.js. The difference is the email: here it
// comes from the signed-in session rather than being typed, so the user only
// confirms, collects the emailed key and picks a new password.
//
// Note there is no "current password" field — the backend has no endpoint that
// verifies one. The key emailed to the account holder is what authorises the
// change, exactly as it does for a signed-out reset.

import {
  computePasswordStrength,
  validateNewPassword,
  describeRequestError,
  describeResetError,
  requestResetKey,
  resetPassword,
} from "./passwordReset.js";
import { toast } from "./toast.js";

let root = null;
let stage = "request"; // "request" | "reset"
let email = "";

// Path back to the repo root from whatever page we're on — same depth check as
// appSidebar.js, so the stylesheet resolves from src/pages/ and admin/ alike.
function appRoot() {
  const path = window.location.pathname;
  if (/\/src\/pages\/admin\//.test(path)) return "../../../";
  if (/\/src\/pages\//.test(path)) return "../../";
  return "./";
}

function ensureStylesheet() {
  const href = new URL(`${appRoot()}css/changePassword.css`, window.location.href).href;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

// The address the key gets sent to. Everything downstream needs it, so a
// session without one can't run the flow at all.
function sessionEmail() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser") || "null")?.email || "";
  } catch {
    return "";
  }
}

// The signed-in username. The new password must not contain it (2.3.2(h)); an
// empty value simply skips that check in validateNewPassword.
function sessionUsername() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser") || "null")?.username || "";
  } catch {
    return "";
  }
}

function setMessage(text, kind = "error") {
  const el = root.querySelector("#cpMessage");
  el.textContent = text || "";
  el.classList.toggle("is-success", kind === "success");
  el.hidden = !text;
}

function setBusy(busy) {
  root.querySelector("#cpSubmit").disabled = busy;
  root.classList.toggle("is-busy", busy);
}

function setStage(next) {
  stage = next;
  const isReset = next === "reset";
  root.querySelector("#cpStageRequest").hidden = isReset;
  root.querySelector("#cpStageReset").hidden = !isReset;
  root.querySelector("#cpSubmit").textContent = isReset ? "Change password" : "Email me a key";
  root.querySelector("#cpSubtitle").textContent = isReset
    ? `Enter the key sent to ${email} and choose a new password.`
    : `We'll email a confirmation key to ${email}.`;
  setTimeout(() => root.querySelector(isReset ? "#cpKey" : "#cpSubmit")?.focus(), 60);
}

// Mirror the new-password field onto the strength meter, matching the login
// page's meter (same scoring, same data-score hook for the colour).
function updateStrength() {
  const pw = root.querySelector("#cpNewPassword").value;
  const meter = root.querySelector("#cpStrength");
  const label = root.querySelector("#cpStrengthLabel");
  if (!pw) {
    meter.hidden = true;
    meter.removeAttribute("data-score");
    label.textContent = "";
    return;
  }
  const { score, label: text } = computePasswordStrength(pw);
  meter.hidden = false;
  meter.setAttribute("data-score", String(score));
  label.textContent = `${text} password`;
}

async function handleSubmit(event) {
  event.preventDefault();
  setMessage("");

  if (stage === "request") {
    setBusy(true);
    const { ok, status } = await requestResetKey(email);
    setBusy(false);
    if (!ok) {
      setMessage(describeRequestError(status));
      return;
    }
    setStage("reset");
    setMessage(`A confirmation key has been sent to ${email}.`, "success");
    return;
  }

  const passwordKey = root.querySelector("#cpKey").value.trim();
  const newPassword = root.querySelector("#cpNewPassword").value;
  const confirmPassword = root.querySelector("#cpConfirmPassword").value;

  if (!passwordKey) {
    setMessage("Please enter the key from your email.");
    return;
  }
  const invalid = validateNewPassword(newPassword, confirmPassword, [sessionUsername(), email]);
  if (invalid) {
    setMessage(invalid);
    return;
  }

  setBusy(true);
  const { ok, status, data } = await resetPassword({ email, passwordKey, newPassword });
  setBusy(false);

  if (ok) {
    close();
    toast.success("Your password has been changed. Use it the next time you sign in.");
    return;
  }
  setMessage(describeResetError(status, data?.kind || ""));
}

function build() {
  ensureStylesheet();

  root = document.createElement("div");
  root.id = "change-password";
  root.className = "cp-root is-hidden";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="cp-backdrop" data-cp-close></div>
    <div class="cp-dialog" role="dialog" aria-modal="true" aria-labelledby="cpTitle">
      <header class="cp-header">
        <h2 class="cp-title" id="cpTitle">Change Account Password</h2>
        <button type="button" class="cp-close" data-cp-close aria-label="Close">&times;</button>
      </header>
      <p class="cp-subtitle" id="cpSubtitle"></p>
      <form class="cp-form" id="cpForm" autocomplete="off">
        <div id="cpStageRequest">
          <p class="cp-note">
            For your security the change is confirmed by email — no one can change
            your password without access to your inbox.
          </p>
        </div>
        <div id="cpStageReset" hidden>
          <label class="cp-label" for="cpKey">Key from your email</label>
          <input class="cp-field" id="cpKey" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="Enter the key" />

          <label class="cp-label" for="cpNewPassword">New password</label>
          <input class="cp-field" id="cpNewPassword" type="password" autocomplete="new-password" placeholder="At least 8 characters" />
          <div class="cp-strength" id="cpStrength" hidden>
            <div class="cp-strength-bar"><span></span><span></span><span></span><span></span></div>
            <p class="cp-strength-label" id="cpStrengthLabel"></p>
          </div>

          <label class="cp-label" for="cpConfirmPassword">Confirm new password</label>
          <input class="cp-field" id="cpConfirmPassword" type="password" autocomplete="new-password" placeholder="Re-enter the password" />
        </div>
        <p class="cp-message" id="cpMessage" role="status" hidden></p>
        <div class="cp-actions">
          <button type="button" class="cp-btn cp-btn-secondary" data-cp-close>Cancel</button>
          <button type="submit" class="cp-btn cp-btn-primary" id="cpSubmit">Email me a key</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(root);

  root.querySelectorAll("[data-cp-close]").forEach((el) => el.addEventListener("click", close));
  root.querySelector("#cpForm").addEventListener("submit", handleSubmit);
  root.querySelector("#cpNewPassword").addEventListener("input", updateStrength);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && root.classList.contains("is-open")) close();
  });
}

export function openChangePassword() {
  email = sessionEmail();
  if (!email) {
    toast.error("Your account has no email address on file — ask an administrator to change your password.");
    return;
  }

  if (!root) build();

  // Always reopen at stage 1 with empty fields: a key from a previous visit has
  // likely expired, and a half-typed password must never linger in the DOM.
  ["#cpKey", "#cpNewPassword", "#cpConfirmPassword"].forEach((sel) => {
    root.querySelector(sel).value = "";
  });
  updateStrength();
  setMessage("");
  setStage("request");

  root.classList.remove("is-hidden");
  requestAnimationFrame(() => root.classList.add("is-open"));
  root.setAttribute("aria-hidden", "false");
}

export function close() {
  if (!root) return;
  root.classList.remove("is-open");
  root.setAttribute("aria-hidden", "true");
  setTimeout(() => root.classList.add("is-hidden"), 180);
}
