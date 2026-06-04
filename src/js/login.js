// Login + OTP flow.
// UI referenced from the "Sort case list" design (two-view: login -> OTP).
// OTP API logic referenced from the nyunt/dev branch.

// Inline copy of apiLog.js — login.js is loaded as a plain script (not a module)
// so it can't import. Same dedup contract: log success once per label.
const _apiLoggedLogin = new Set();
function logApi(res, label) {
  if (!res.ok) {
    console.warn(`[API] ✗ ${label} status=${res.status}`);
    return;
  }
  if (_apiLoggedLogin.has(label)) return;
  _apiLoggedLogin.add(label);
  console.log(`[API] ✓ ${label} status=${res.status}`);
}

const API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";
const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

let currentUUID = null;

// --- view switching -------------------------------------------------------

function showView(view) {
  const loginView = document.getElementById("login-view");
  const otpView = document.getElementById("otp-view");
  if (view === "otp") {
    loginView.classList.add("hidden");
    otpView.classList.remove("hidden");
    const first = document.querySelector("#otp-inputs .otp-box");
    if (first) first.focus();
  } else {
    otpView.classList.add("hidden");
    loginView.classList.remove("hidden");
  }
}

function setError(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message || "";
}

function getOtpValue() {
  return Array.from(document.querySelectorAll("#otp-inputs .otp-box"))
    .map((b) => b.value)
    .join("");
}

function clearOtpBoxes() {
  document.querySelectorAll("#otp-inputs .otp-box").forEach((b) => (b.value = ""));
}

// --- step 1: authenticate + send OTP --------------------------------------

async function sendOTP() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  setError("error-message", "");

  if (!username || !password) {
    setError("error-message", "Username and password cannot be empty!");
    return false;
  }

  try {
    const loginBody = [
      { machine_id: MACHINE_ID },
      { username: username, password: password }
    ];

    const response = await fetch(`${API_BASE}/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginBody)
    });
    logApi(response, "POST /user/login");
    const data = await response.json();

    if (response.ok && data.successful && data.uuid) {
      currentUUID = data.uuid;

      // Store base user info but do not redirect until OTP is verified.
      const userInfo = {
        uuid: currentUUID,
        username: username,
        email: data.email,
        isAdmin: data.isAdmin
      };
      localStorage.setItem("loggedInUser", JSON.stringify(userInfo));

      // TEMP: OTP feature disabled — skip code generation/verification and go
      // straight to the case list after a successful login. To re-enable OTP,
      // delete this redirect and uncomment the block below (and restore the
      // `if (ok) showView("otp")` line in the login-form submit handler).
      window.location.href = "./src/pages/case_list.html";
      return true;

      /* --- OTP flow (temporarily disabled) ---
      // Trigger OTP generation / email.
      const otpRes = await fetch(`${API_BASE}/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{ machine_id: MACHINE_ID, uuid: currentUUID }])
      });
      logApi(otpRes, "POST /otp");

      if (!otpRes.ok) {
        setError("error-message", "Login succeeded but OTP generation failed.");
        return false;
      }

      // Move to OTP view and show where the code was sent.
      const target = document.getElementById("otp-target");
      if (target) target.textContent = data.email || username || "your account";
      return true;
      --- end OTP flow --- */
    }

    setError("error-message", "Login failed. Please check your username and password.");
    return false;
  } catch (error) {
    console.error("Login error:", error);
    setError("error-message", "An error occurred. Please try again later.");
    return false;
  }
}

// --- step 2: verify OTP + redirect ----------------------------------------

async function verifyAndLogin() {
  const otp = getOtpValue().trim();

  setError("otp-error-message", "");

  if (otp.length < 6) {
    setError("otp-error-message", "Please enter the 6-digit code.");
    return;
  }

  if (!currentUUID) {
    const stored = localStorage.getItem("loggedInUser");
    if (stored) {
      try {
        currentUUID = JSON.parse(stored).uuid;
      } catch (e) {
        /* ignore */
      }
    }
  }

  if (!currentUUID) {
    setError("otp-error-message", "Missing UUID. Please send OTP again.");
    return;
  }

  try {
    const verifyBody = [
      { machine_id: MACHINE_ID, uuid: currentUUID },
      { uuid: currentUUID, otp: otp }
    ];

    const response = await fetch(`${API_BASE}/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(verifyBody)
    });
    logApi(response, "POST /otp/verify");
    const data = await response.json();

    if (response.ok && data.successful) {
      window.location.href = "./src/pages/case_list.html";
    } else {
      setError("otp-error-message", "Invalid or expired OTP.");
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    setError("otp-error-message", "OTP verification failed. Please try again.");
  }
}

// --- OTP box behavior (auto-advance / backspace / paste) ------------------

function wireOtpBoxes() {
  const boxes = Array.from(document.querySelectorAll("#otp-inputs .otp-box"));

  boxes.forEach((box, index) => {
    box.addEventListener("input", (e) => {
      // keep only the last typed digit
      const v = e.target.value.replace(/\D/g, "");
      e.target.value = v.slice(-1);
      if (e.target.value && index < boxes.length - 1) {
        boxes[index + 1].focus();
      }
    });

    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !box.value && index > 0) {
        boxes[index - 1].focus();
      }
    });

    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const digits = (e.clipboardData.getData("text") || "")
        .replace(/\D/g, "")
        .slice(0, boxes.length);
      digits.split("").forEach((d, i) => {
        if (boxes[i]) boxes[i].value = d;
      });
      const next = Math.min(digits.length, boxes.length - 1);
      boxes[next].focus();
    });
  });
}

// --- wiring ---------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  wireOtpBoxes();

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById("signin-btn");
      if (btn) btn.disabled = true;
      const ok = await sendOTP();
      if (btn) btn.disabled = false;
      // TEMP: OTP disabled — sendOTP() redirects on success, so don't switch to
      // the OTP view (avoids a flash of it). Re-enable with: if (ok) showView("otp");
      // if (ok) showView("otp");
    });
  }

  const otpForm = document.getElementById("otp-form");
  if (otpForm) {
    otpForm.addEventListener("submit", (e) => {
      e.preventDefault();
      verifyAndLogin();
    });
  }

  const backBtn = document.getElementById("back-to-login");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      clearOtpBoxes();
      setError("otp-error-message", "");
      showView("login");
    });
  }

  const resendBtn = document.getElementById("resend-otp");
  if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
      clearOtpBoxes();
      setError("otp-error-message", "");
      resendBtn.disabled = true;
      const ok = await sendOTP();
      resendBtn.disabled = false;
      if (ok) {
        setError("otp-error-message", "A new code has been sent.");
        const first = document.querySelector("#otp-inputs .otp-box");
        if (first) first.focus();
      } else {
        // sendOTP surfaced its error on the login view; mirror it on OTP view.
        setError("otp-error-message", document.getElementById("error-message").textContent);
      }
    });
  }
});
