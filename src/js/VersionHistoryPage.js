import { lol } from "../crypt.js";
import { toast } from "./toast.js";
import { logApi } from "./apiLog.js";

const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

function getLoggedInUser() {
  try {
    const s = localStorage.getItem("loggedInUser");
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function initialsFrom(name = "") {
  const p = name.trim().split(/\s+/);
  if (!p[0]) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

function actionToKey(s = "") {
  s = s.toLowerCase();
  if (s.includes("create"))  return "created";
  if (s.includes("edit"))    return "edited";
  if (s.includes("share"))   return "shared";
  if (s.includes("approve")) return "approved";
  if (s.includes("print"))   return "printing";
  return "other";
}

function formatMs(ms) {
  if (!ms) return "N/A";
  const t = ms.toString().length === 13 ? Number(ms) : Number(ms) * 1000;
  return new Date(t).toLocaleString();
}

const ICON_STYLE = 'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const TYPE_ICON = {
  created:  `<svg ${ICON_STYLE}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  edited:   `<svg ${ICON_STYLE}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
  shared:   `<svg ${ICON_STYLE}><polyline points="16 6 20 10 16 14"/><path d="M4 12v-2a4 4 0 0 1 4-4h8"/><path d="M20 10v2a4 4 0 0 1-4 4H8"/></svg>`,
  approved: `<svg ${ICON_STYLE}><polyline points="20 6 9 17 4 12"/></svg>`,
  printing: `<svg ${ICON_STYLE}><polyline points="6 9 6 2 18 2 18 9"/><rect x="6" y="14" width="12" height="8"/><path d="M20 9h-16a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h2"/></svg>`,
  other:    `<svg ${ICON_STYLE}><circle cx="12" cy="12" r="3"/></svg>`
};

async function fetchUserIndexForCase(caseIntID, uuid) {
  try {
    const res = await fetch("https://live.api.smartrpdai.com/api/smartrpd/role/all/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: MACHINE_ID, uuid, caseIntID },
        { case_int_id: caseIntID }
      ])
    });
    logApi(res, "POST /role/all/get");
    if (!res.ok) return new Map();
    const arr = await res.json();

    const idx = new Map();
    arr.forEach(u => {
      const name = u.username || (u.email ? u.email.split("@")[0] : "") || "Unknown";
      const actor = { name, initials: initialsFrom(name) };
      const keys = [
        u.user_id, u.id, u.uuid,
        name ? name.toLowerCase() : null,
        u.email ? u.email.split("@")[0].toLowerCase() : null
      ].filter(k => k !== null && k !== undefined && k !== "");
      keys.forEach(k => idx.set(String(k).toLowerCase(), actor));
    });
    return idx;
  } catch {
    return new Map();
  }
}

async function fetchCaseHistory(caseIntID, uuid) {
  const res = await fetch("https://live.api.smartrpdai.com/api/smartrpd/casehistory/getall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ machine_id: MACHINE_ID, uuid, caseIntID }])
  });
  logApi(res, "POST /casehistory/getall");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function resolveActor(userIndex, rawUserId) {
  if (rawUserId === null || rawUserId === undefined || rawUserId === "") {
    return { name: "Unknown", initials: "?" };
  }
  const key = String(rawUserId).toLowerCase();
  if (userIndex.has(key)) return userIndex.get(key);
  if (key.includes("@")) {
    const prefix = key.split("@")[0];
    if (userIndex.has(prefix)) return userIndex.get(prefix);
  }
  return { name: String(rawUserId), initials: initialsFrom(String(rawUserId)) };
}

function renderList(items, userIndex) {
  const listEl = document.getElementById("versionList");
  if (!listEl) return;

  items.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));

  if (!items.length) {
    listEl.innerHTML = `<li class="vh-item">
      <div class="vh-row">
        <div class="vh-op">•</div>
        <div class="vh-col">
          <div class="vh-line1"><span class="vh-op-label">No history</span></div>
          <div class="vh-line2">
            <span class="vh-user"><span class="vh-user-name">—</span></span>
            <time class="vh-timestamp">—</time>
          </div>
        </div>
      </div>
    </li>`;
    return;
  }

  listEl.innerHTML = items.map(it => {
    const key   = actionToKey(it.action || "");
    const icon  = TYPE_ICON[key] || TYPE_ICON.other;
    const actor = resolveActor(userIndex, it.user_id);
    const timeTx = formatMs(it.datetime);

    return `
      <li class="vh-item" data-id="${it.id}" data-op="${key}"
          data-user-id="${it.user_id ?? ""}" data-ts="${it.datetime ?? ""}">
        <div class="vh-row">
          <div class="vh-op" aria-hidden="true">${icon}</div>
          <div class="vh-col">
            <div class="vh-line1">
              <span class="vh-op-label">${it.action || "—"}</span>
            </div>
            <div class="vh-line2">
              <span class="vh-user">
                <span class="vh-avatar" title="${actor.name}">${actor.initials}</span>
                <span class="vh-user-name">${actor.name}</span>
              </span>
              <time class="vh-timestamp" datetime="${it.datetime || ""}">${timeTx}</time>
            </div>
          </div>
        </div>
      </li>`;
  }).join("");
}

function showState(label, sub) {
  const listEl = document.getElementById("versionList");
  if (!listEl) return;
  listEl.innerHTML = `<li class="vh-item">
    <div class="vh-row">
      <div class="vh-op">…</div>
      <div class="vh-col">
        <div class="vh-line1"><span class="vh-op-label">${label}</span></div>
        <div class="vh-line2">
          <span class="vh-user"><span class="vh-user-name">${sub}</span></span>
          <time class="vh-timestamp">—</time>
        </div>
      </div>
    </div>
  </li>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const encryptedId = params.get("id");
  const caseId = encryptedId ? lol(encryptedId) : null;
  const user   = getLoggedInUser();

  document.getElementById("backBtn")?.addEventListener("click", () => history.back());

  if (!caseId || !user?.uuid) {
    toast.warning("No case selected. Please go back and select a case.");
    showState("No case selected", "Return to case list and try again");
    return;
  }

  const caseLabel = document.getElementById("caseLabel");
  if (caseLabel) caseLabel.textContent = `Case #${caseId}`;

  showState("Loading…", "Please wait");

  try {
    const [hist, userIndex] = await Promise.all([
      fetchCaseHistory(caseId, user.uuid),
      fetchUserIndexForCase(caseId, user.uuid)
    ]);
    renderList(hist, userIndex);
  } catch (e) {
    console.error("Version history error:", e);
    showState("Failed to load history", "Try again later");
  }
});
