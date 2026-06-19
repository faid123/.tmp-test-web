// Case Dashboard — the "View Dashboard" view opened from the case list detail
// pane. Recreates the SmartRPD desktop dashboard for the selected case: a left
// column of process steps (per jaw), a centre "View Captures" area (2D / 3D
// upper / 3D lower thumbnails), and a right "Case Access" panel (roles).
//
// The overlay is built once on first open and reused; openCaseDashboard()
// repopulates it from the selected case's detail, thumbnails and roles.

import { toast } from "./toast.js";
import { logApi } from "./apiLog.js";

const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
const API = "https://live.api.smartrpdai.com/api/smartrpd";
const ICON_BASE = "../../assets/Dashboard_Icon";

function getLoggedInUser() {
  const user = localStorage.getItem("loggedInUser");
  return user ? JSON.parse(user) : null;
}

// Pipeline status progression. A jaw's `upper_status` / `lower_status` string
// (from the backend `case_status` table — read-only here, written by the
// desktop app; defaults to 0 when no row exists) names the furthest stage the
// jaw has reached, so a stage is "done" when the jaw's status ranks at or above
// that stage. Higher rank = further along.
//
// Exact strings are matched first. The only confirmed value is `jaw_prepared`
// (rank 1, from a real payload); add more exact mappings here as they're
// confirmed. Anything not matched exactly falls back to keyword inference below,
// which keys off the stage's pipeline name (jaw_stls/six_points/segmentation/
// polylines/surface) so it tolerates whatever exact wording the desktop writes.
const STATUS_RANK = {
  jaw_prepared: 1, // stage 1 — 2D Jaw Preparation (confirmed)
};

// [rank, keywords] checked high→low; the first stage whose keyword appears in
// the status string wins. Order matters so a later-stage word takes precedence.
const STATUS_KEYWORD_RANKS = [
  [5, ["surface"]],
  [4, ["polyline"]],
  [3, ["segment"]],
  [2, ["six", "point", "archridge"]],
  [1, ["prepar", "stl", "undercut"]],
];

export function statusRank(status) {
  if (status == null) return 0;
  const s = String(status).trim().toLowerCase();
  if (!s || s === "0") return 0; // backend default — nothing done
  if (s in STATUS_RANK) return STATUS_RANK[s];
  for (const [rank, keywords] of STATUS_KEYWORD_RANKS) {
    if (keywords.some((k) => s.includes(k))) return rank;
  }
  return 0;
}

// The five dashboard stages, in order. `rank` is the STATUS_RANK level at/above
// which the jaw's part of the stage counts as done. `verb` is how a completed
// stage reads ("... is complete" / "... is placed" / ...). `desc` is an optional
// sub-line shown under the title.
const STAGES = [
  {
    icon: "2D_Jaw_Preparation.png",
    title: "2D Jaw Preparation",
    desc: "Jaw STL loading, Undercut and background processes, 2D Design",
    label: (jaw) => `${jaw} Jaw 2D Preparation`,
    verb: "complete",
    rank: 1,
  },
  {
    icon: "6-Points.png",
    title: "6 points Archridge",
    desc: "",
    label: (jaw) => `${jaw} Jaw 6 points`,
    verb: "placed",
    rank: 2,
  },
  {
    icon: "Teeth_segmentation.png",
    title: "Teeth Segmentation and other processes",
    desc: "",
    label: (jaw) => `${jaw} Jaw Segmentation`,
    verb: "processed",
    rank: 3,
  },
  {
    icon: "3D_Design_Polyline.png",
    title: "3D Design / Polylines",
    desc: "",
    label: (jaw) => `${jaw} Jaw Polylines`,
    verb: "generated",
    rank: 4,
  },
  {
    icon: "3D_Generate.png",
    title: "3D Surface Generation",
    desc: "",
    label: (jaw) => `${jaw} Jaw final 3D surface generation`,
    verb: "generated",
    rank: 5,
  },
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

// Format a timestamp as "YYYY-MM-DD HH:MM:SS" (matching the desktop dashboard),
// or "N/A" for missing/epoch values.
function formatDateTime(ts) {
  if (ts == null || ts === "" || ts === 0 || ts === "0") return "N/A";
  const n = Number(ts);
  let ms;
  if (Number.isFinite(n)) {
    if (n <= 0) return "N/A";
    ms = String(n).length >= 13 ? n : n * 1000;
  } else {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "N/A";
    ms = d.getTime();
  }
  if (ms < 946684800000) return "N/A";
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Slot of a /thumbnails/get row: 0 = composite 2D, 1 = upper jaw, 2 = lower jaw.
function thumbnailSlot(row) {
  const v = row?.slot ?? row?.slot_index ?? row?.slot_id;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Pure: compute the per-stage / per-jaw completion model for two jaw statuses.
// Each stage is "done" for a jaw when that jaw's status ranks at or above the
// stage. Exported (DOM-free) so the rank → step-text mapping can be unit-tested.
// Returns [{ title, lines: [{ jaw, done, text }] }] in display order.
export function computeSteps(upperStatus, lowerStatus) {
  const upperRank = statusRank(upperStatus);
  const lowerRank = statusRank(lowerStatus);
  const lineFor = (stage, jaw, jawRank) => {
    const done = jawRank >= stage.rank;
    const label = stage.label(jaw);
    return { jaw, done, text: done ? `${label} is ${stage.verb}` : `Yet to do ${label}` };
  };
  return STAGES.map((stage) => ({
    title: stage.title,
    lines: [lineFor(stage, "Upper", upperRank), lineFor(stage, "Lower", lowerRank)],
  }));
}

// Pure: count stages where every jaw line is done (a stage is "complete" only
// when both jaws have reached it). Exported for unit testing. Takes the
// computeSteps() output.
export function countCompletedStages(steps) {
  return (steps || []).filter((s) => s.lines.every((l) => l.done)).length;
}

// Pure: map /thumbnails/get rows to their capture slot (0 = 2D, 1 = 3D upper,
// 2 = 3D lower). Rows without a slot tag (older cases) fall back to positional
// order. Exported (DOM-free) for unit testing. Returns Map<slot, base64data>.
export function resolveCaptureSlots(rows) {
  const bySlot = new Map();
  (rows || []).forEach((r) => {
    if (!r || !r.data) return;
    const slot = thumbnailSlot(r);
    if (slot != null && !bySlot.has(slot)) bySlot.set(slot, r.data);
  });
  if (bySlot.size === 0) {
    (rows || []).filter((r) => r?.data).forEach((r, i) => bySlot.set(i, r.data));
  }
  return bySlot;
}

let overlayEl = null;

function buildOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "caseDashboardOverlay";
  overlay.className = "dash-overlay hidden";
  overlay.innerHTML = `
    <header class="dash-topbar">
      <div class="dash-brand">
        <span class="dash-brand-label">DASHBOARD</span>
        <span class="dash-brand-sep"></span>
        <span class="dash-brand-case" id="dashCaseName">—</span>
      </div>
      <div class="dash-topmeta">
        <span>Created by: <b id="dashCreatedBy">—</b> · <span id="dashCreatedAt">—</span></span>
        <span>Last Edited: <b id="dashLastEdited">—</b></span>
      </div>
      <div class="dash-topright">
        <span class="dash-done-pill"><i class="fa-regular fa-circle-check"></i><span id="dashDoneText">0/5 done</span></span>
        <button type="button" class="dash-close" id="dashCloseBtn" aria-label="Close dashboard">&times;</button>
      </div>
    </header>
    <div class="dash-body">
      <section class="dash-col dash-col-steps">
        <div class="dash-col-head">
          <span class="dash-col-title"><i class="fa-solid fa-wave-square"></i> PROCESSING STEPS</span>
          <span class="dash-chip" id="dashStepsChip">0/5</span>
        </div>
        <div class="dash-progress"><div class="dash-progress-fill" id="dashProgressFill"></div></div>
        <div class="dash-steps" id="dashSteps"></div>
      </section>

      <section class="dash-col dash-col-captures">
        <div class="dash-col-head">
          <span class="dash-col-title"><i class="fa-regular fa-eye"></i> View Captures</span>
          <span class="dash-col-sub" id="dashCaptureSub">—</span>
        </div>
        <div class="dash-preview" id="dashPreview">
          <div class="dash-preview-empty" id="dashPreviewEmpty">
            <i class="fa-solid fa-up-right-and-down-left-from-center"></i>
            <p>Select a capture to preview</p>
            <span>2D · 3D Upper · 3D Lower</span>
          </div>
          <img class="dash-preview-img hidden" id="dashPreviewImg" alt="Selected capture" />
        </div>
        <div class="dash-captures" id="dashCaptures"></div>
      </section>

      <section class="dash-col dash-col-access">
        <div class="dash-col-head">
          <span class="dash-col-title"><i class="fa-solid fa-user-group"></i> Case Access</span>
        </div>
        <table class="dash-access-table">
          <thead><tr><th>User Name</th><th>Role</th></tr></thead>
          <tbody id="dashAccessBody"></tbody>
        </table>
        <div class="dash-col-head dash-col-head-3d">
          <span class="dash-col-title"><i class="fa-solid fa-cube"></i> 3D Preview</span>
        </div>
        <div class="dash-3d-card">
          <div class="dash-3d-placeholder">
            <i class="fa-solid fa-cube"></i>
            <span>3D model viewer<br>will appear here</span>
          </div>
        </div>
        <div class="dash-foot">Case: <b id="dashFootCase">—</b></div>
      </section>
    </div>
    <button type="button" class="dash-help" id="dashHelpBtn" aria-label="Help">?</button>`;
  document.body.appendChild(overlay);

  const close = () => closeDashboard();
  overlay.querySelector("#dashCloseBtn").addEventListener("click", close);
  overlay.querySelector("#dashHelpBtn").addEventListener("click", () => {
    toast.info("Each step reflects per-jaw progress. Click a capture below to preview it.");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) close();
  });
  return overlay;
}

function closeDashboard() {
  overlayEl?.classList.add("hidden");
}

// Update the header done-pill, the steps chip, and the progress bar from a
// completed/total count.
function updateProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const chip = document.getElementById("dashStepsChip");
  if (chip) chip.textContent = `${done}/${total}`;
  const doneText = document.getElementById("dashDoneText");
  if (doneText) doneText.textContent = `${done}/${total} done`;
  const fill = document.getElementById("dashProgressFill");
  if (fill) fill.style.width = `${pct}%`;
}

function renderSteps(upperStatus, lowerStatus) {
  const steps = computeSteps(upperStatus, lowerStatus);
  updateProgress(countCompletedStages(steps), steps.length);

  const host = document.getElementById("dashSteps");
  if (!host) return;
  host.innerHTML = STAGES.map((stage, i) => {
    const stepDone = steps[i].lines.every((l) => l.done);
    const lines = steps[i].lines
      .map((ln) => {
        const icon = ln.done
          ? '<i class="fa-solid fa-circle-check"></i>'
          : '<i class="fa-solid fa-triangle-exclamation"></i>';
        return `<div class="dash-step-line ${ln.done ? "is-done" : "is-pending"}">${icon}<span>${escapeHtml(ln.text)}</span></div>`;
      })
      .join("");
    const badge = stepDone
      ? '<span class="dash-step-badge is-done"><i class="fa-solid fa-check"></i></span>'
      : '<span class="dash-step-badge is-pending">&hellip;</span>';
    const desc = stage.desc
      ? `<p class="dash-step-desc">${escapeHtml(stage.desc)}</p>`
      : "";
    return `
      <div class="dash-step">
        <div class="dash-step-icon-tile"><img src="${ICON_BASE}/${stage.icon}" alt="" /></div>
        <div class="dash-step-body">
          <div class="dash-step-head">
            <span class="dash-step-title">${escapeHtml(stage.title)}</span>
            ${badge}
          </div>
          ${desc}
          ${lines}
        </div>
      </div>`;
  }).join("");
}

// Reset the big preview area to its "select a capture" empty state and clear any
// active capture tile.
function resetPreview() {
  const img = document.getElementById("dashPreviewImg");
  const empty = document.getElementById("dashPreviewEmpty");
  if (img) {
    img.classList.add("hidden");
    img.removeAttribute("src");
  }
  if (empty) empty.classList.remove("hidden");
  document
    .querySelectorAll("#dashCaptures .dash-capture")
    .forEach((c) => c.classList.remove("is-active"));
}

// Show a capture's image enlarged in the central preview area.
function showPreview(data, tileEl) {
  const img = document.getElementById("dashPreviewImg");
  const empty = document.getElementById("dashPreviewEmpty");
  if (!img) return;
  img.src = "data:image/png;base64," + data;
  img.classList.remove("hidden");
  empty?.classList.add("hidden");
  document
    .querySelectorAll("#dashCaptures .dash-capture")
    .forEach((c) => c.classList.remove("is-active"));
  tileEl?.classList.add("is-active");
}

function renderCaptures(rows) {
  resetPreview();
  const host = document.getElementById("dashCaptures");
  if (!host) return;
  const bySlot = resolveCaptureSlots(rows);

  const tiles = [
    { slot: 0, label: "2D" },
    { slot: 1, label: "3D Upper" },
    { slot: 2, label: "3D Lower" },
  ];
  host.innerHTML = tiles
    .map(({ slot, label }) => {
      const data = bySlot.get(slot);
      const frame = data
        ? `<img src="data:image/png;base64,${data}" alt="${escapeHtml(label)} capture" />`
        : `<div class="dash-capture-empty"><span>No preview</span></div>`;
      return `
        <button type="button" class="dash-capture${data ? "" : " is-empty"}" data-slot="${slot}"${data ? "" : " disabled"}>
          <div class="dash-capture-frame">${frame}</div>
          <div class="dash-capture-label">${escapeHtml(label)}</div>
        </button>`;
    })
    .join("");

  host.querySelectorAll(".dash-capture").forEach((btn) => {
    const data = bySlot.get(Number(btn.dataset.slot));
    if (data) btn.addEventListener("click", () => showPreview(data, btn));
  });
}

function renderAccess(roles) {
  const body = document.getElementById("dashAccessBody");
  if (!body) return;
  const rows = Array.isArray(roles) ? roles.filter((r) => r && r.username) : [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="2" class="dash-access-empty">No users found.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((r) => {
      const role = r.role || "—";
      const isOwner = String(role).toLowerCase() === "owner";
      return `
      <tr>
        <td>${escapeHtml(r.username)}</td>
        <td><span class="dash-access-role${isOwner ? " is-owner" : ""}">${escapeHtml(role)}</span></td>
      </tr>`;
    })
    .join("");
}

async function postJson(url, payload, label) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  logApi(res, label);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Open the dashboard for a case. `caseStub` (the row object from the list) is
// used for the case name and as a fallback while the detail request is in
// flight; pass null to rely entirely on the network.
export async function openCaseDashboard(caseId, caseStub = null) {
  const user = getLoggedInUser();
  if (!caseId || !user?.uuid) {
    toast.warning("Please select a case first.");
    return;
  }

  overlayEl = overlayEl || buildOverlay();
  overlayEl.classList.remove("hidden");

  // Paint what we already know immediately so the overlay isn't blank.
  const nameEl = document.getElementById("dashCaseName");
  if (nameEl) nameEl.textContent = caseStub?.case_id || `Case ${caseId}`;
  renderSteps(caseStub?.upper_status, caseStub?.lower_status);
  renderCaptures([]);
  renderAccess([]);

  const auth = { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: caseId };
  const caseIdStr = caseStub?.case_id ?? caseId;

  const [detail, thumbs, roles] = await Promise.all([
    postJson(`${API}/case/get/${caseId}`, [auth], "POST /case/get/:id").catch(
      (err) => {
        console.warn("[dashboard] case detail failed", err);
        return caseStub || {};
      }
    ),
    postJson(`${API}/thumbnails/get`, [auth, { case_id: caseIdStr }], "POST /thumbnails/get").catch(
      (err) => {
        console.warn("[dashboard] thumbnails failed", err);
        return [];
      }
    ),
    postJson(`${API}/role/all/get`, [auth, { case_int_id: caseId }], "POST /role/all/get").catch(
      (err) => {
        console.warn("[dashboard] roles failed", err);
        return [];
      }
    ),
  ]);

  // Still hidden? The user closed the overlay while requests were in flight.
  if (overlayEl.classList.contains("hidden")) return;

  const name = detail.case_id || caseStub?.case_id || `Case ${caseId}`;
  const caseIntId = detail.id ?? caseId;
  if (nameEl) nameEl.textContent = name;
  const createdBy = document.getElementById("dashCreatedBy");
  if (createdBy) createdBy.textContent = detail.assigned_to || detail.username || "—";
  const createdAt = document.getElementById("dashCreatedAt");
  if (createdAt) createdAt.textContent = formatDateTime(detail.creation_date);
  const lastEdited = document.getElementById("dashLastEdited");
  if (lastEdited) lastEdited.textContent = formatDateTime(detail.last_updated);
  const captureSub = document.getElementById("dashCaptureSub");
  if (captureSub) captureSub.textContent = `UID ${caseIntId} · ${name}`;
  const footCase = document.getElementById("dashFootCase");
  if (footCase) footCase.textContent = name;

  renderSteps(detail.upper_status, detail.lower_status);
  renderCaptures(Array.isArray(thumbs) ? thumbs : []);
  renderAccess(Array.isArray(roles) ? roles : []);
}

// Self-register the detail pane's "View Dashboard" button.
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("viewDashboardBtn");
  btn?.addEventListener("click", () => {
    openCaseDashboard(window.selectedCaseId);
  });
});
