// Case Dashboard — the "View Dashboard" view opened from the case list detail
// pane. Recreates the SmartRPD desktop dashboard for the selected case: a left
// column of process steps (per jaw), a centre "View Captures" area (2D / 3D
// upper / 3D lower thumbnails from /thumbnails/get), and a right column with a
// "Case Access" panel (roles) above a "Viewcaptures" gallery (the noticeboard
// 3D viewcapture photos from /noticeboard/view/get).
//
// The overlay is built once on first open and reused; openCaseDashboard()
// repopulates it from the selected case's detail, thumbnails, viewcaptures and
// roles.

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

// Case status (`new_status`) → display label + pill kind. Mirrors the case
// list's mapping (apiStatusToValue/statusDisplayText/statusPillClass) compactly
// so the dashboard doesn't have to import from caseManagement.js (which imports
// this module — a cycle). Pure; exported for unit testing.
export function caseStatusLabel(apiStatus) {
  const v = apiStatus ? String(apiStatus).toLowerCase().replace(/ /g, "_") : "na";
  if (v === "na") return "N/A"; // unset — exactly what the case list shows
  if (v === "draft") return "draft";
  if (v.endsWith("_pending")) {
    if (v.startsWith("2d_")) return "pending (2D)";
    if (v.startsWith("3d_")) return "pending (3D)";
    return "pending";
  }
  if (v.endsWith("_drafted") || v.endsWith("_approved")) {
    if (v.startsWith("2d_")) return "in-progress (2D)";
    if (v.startsWith("3d_")) return "in-progress (3D)";
    return "in-progress";
  }
  if (v === "in_production") return "in-progress";
  if (v === "out_for_delivery") return "out for delivery";
  if (v === "delivered") return "delivered";
  if (v === "completed") return "completed";
  return v.replace(/_/g, " ");
}

export function caseStatusKind(apiStatus) {
  const v = apiStatus ? String(apiStatus).toLowerCase().replace(/ /g, "_") : "na";
  if (v === "na") return "na"; // unset — neutral grey pill, like the case list
  if (v === "draft") return "draft";
  if (v === "completed" || v === "delivered") return "completed";
  if (v.endsWith("_pending") || v === "pending") return "pending";
  return "progress"; // in_production / out_for_delivery / *_drafted / *_approved
}

// Set every meta target carrying a matching [data-field] inside the overlay, so
// one call paints both the desktop topbar meta and the mobile "Case Details"
// panel (which mirror the same data under different layouts).
function setField(field, value) {
  document
    .querySelectorAll(`#caseDashboardOverlay [data-field="${field}"]`)
    .forEach((el) => { el.textContent = value; });
}

function renderStatusPill(apiStatus) {
  const cls = `dash-status-pill dash-status-${caseStatusKind(apiStatus)}`;
  const label = caseStatusLabel(apiStatus);
  document.querySelectorAll("#caseDashboardOverlay [data-status-pill]").forEach((pill) => {
    pill.className = cls;
    pill.textContent = label;
  });
}

function renderRequestDate(ts) {
  setField("request", formatDateTime(ts));
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
        <span>Created by: <b data-field="createdBy">—</b> · <span data-field="created">—</span></span>
        <span>Request Date: <b data-field="request">—</b></span>
        <span>Last Edited: <b data-field="lastEdit">—</b></span>
      </div>
      <div class="dash-topright">
        <span class="dash-status-pill dash-status-na" data-status-pill>—</span>
        <button type="button" class="dash-close" id="dashCloseBtn" aria-label="Close dashboard">&times;</button>
      </div>
    </header>
    <div class="dash-body">
      <section class="dash-details" id="dashDetails">
        <div class="dash-col-head">
          <span class="dash-col-title"><i class="fa-solid fa-circle-info"></i> CASE DETAILS</span>
        </div>
        <dl class="dash-details-list">
          <div class="dash-details-row"><dt>Case ID</dt><dd data-field="caseId">—</dd></div>
          <div class="dash-details-row"><dt>Created</dt><dd data-field="created">—</dd></div>
          <div class="dash-details-row"><dt>Date Request</dt><dd data-field="request">—</dd></div>
          <div class="dash-details-row"><dt>Last Edit</dt><dd data-field="lastEdit">—</dd></div>
          <div class="dash-details-row"><dt>Status</dt><dd><span class="dash-status-pill dash-status-na" data-status-pill>—</span></dd></div>
        </dl>
      </section>
      <section class="dash-col dash-col-steps">
        <div class="dash-col-head">
          <span class="dash-col-title"><i class="fa-solid fa-wave-square"></i> PROCESSING STEPS</span>
          <span class="dash-chip" id="dashStepsChip">0/5</span>
          <button type="button" class="dash-steps-toggle" id="dashStepsToggle" aria-expanded="false" aria-label="Toggle processing steps"><i class="fa fa-chevron-down" aria-hidden="true"></i></button>
        </div>
        <div class="dash-progress"><div class="dash-progress-fill" id="dashProgressFill"></div></div>
        <div class="dash-steps is-collapsed" id="dashSteps"></div>
      </section>

      <section class="dash-col dash-col-captures">
        <div class="dash-col-head">
          <span class="dash-col-title"><i class="fa-regular fa-eye"></i> Preview Panel</span>
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
        <div class="dash-col-head dash-mobile-head">
          <span class="dash-col-title"><i class="fa-regular fa-images"></i> Thumbnails</span>
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
        <div class="dash-col-head dash-col-head-vc">
          <span class="dash-col-title"><i class="fa-regular fa-images"></i> View Captures</span>
          <span class="dash-col-sub" id="dashViewcaptureSub">—</span>
          <button type="button" class="dash-vc-toggle" id="dashViewcaptureToggle" aria-expanded="false" aria-label="Toggle view captures"><i class="fa fa-chevron-down" aria-hidden="true"></i></button>
        </div>
        <div class="dash-viewcaptures is-collapsed" id="dashViewcaptures"></div>
      </section>
    </div>
    <div class="dash-lightbox hidden" id="dashLightbox" aria-hidden="true">
      <button type="button" class="dash-lightbox-close" id="dashLightboxClose" aria-label="Close preview">&times;</button>
      <img class="dash-lightbox-img" id="dashLightboxImg" alt="Capture preview" />
    </div>`;
  document.body.appendChild(overlay);

  const close = () => closeDashboard();
  overlay.querySelector("#dashCloseBtn").addEventListener("click", close);

  // Full-screen capture preview (used on phones/tablets where the inline preview
  // panel is hidden): close on the X or a backdrop tap.
  overlay.querySelector("#dashLightboxClose")?.addEventListener("click", closeLightbox);
  overlay.querySelector("#dashLightbox")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLightbox();
  });

  // Collapsible sections (mobile only; lists start collapsed). The whole header
  // bar is the tap target; the chevron button is just a visual affordance that
  // rotates to point up when the list is open.
  const wireCollapsible = (headerEl, panelEl, toggleBtn) => {
    if (!headerEl || !panelEl) return;
    const sync = () => {
      const open = !panelEl.classList.contains("is-collapsed");
      toggleBtn?.classList.toggle("is-open", open);
      toggleBtn?.setAttribute("aria-expanded", String(open));
    };
    headerEl.addEventListener("click", () => {
      panelEl.classList.toggle("is-collapsed");
      sync();
    });
    sync();
  };

  // Processing Steps — the header chip and progress bar stay as a compact summary.
  wireCollapsible(
    overlay.querySelector(".dash-col-steps > .dash-col-head"),
    overlay.querySelector("#dashSteps"),
    overlay.querySelector("#dashStepsToggle")
  );

  // View Captures gallery.
  wireCollapsible(
    overlay.querySelector(".dash-col-head-vc"),
    overlay.querySelector("#dashViewcaptures"),
    overlay.querySelector("#dashViewcaptureToggle")
  );

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const lb = document.getElementById("dashLightbox");
    if (lb && !lb.classList.contains("hidden")) {
      closeLightbox();
      return;
    }
    if (!overlay.classList.contains("hidden")) close();
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

// Clear the active highlight on every capture/viewcapture tile in the overlay.
function clearActiveCaptures() {
  document
    .querySelectorAll(".dash-capture.is-active")
    .forEach((c) => c.classList.remove("is-active"));
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
  clearActiveCaptures();
}

// Phones/tablets share the desktop's stacked single-column layout, where the
// inline preview panel is hidden — captures pop full-screen instead.
const MOBILE_MQ = window.matchMedia("(max-width: 1080px)");

function openLightbox(src) {
  const lb = document.getElementById("dashLightbox");
  const img = document.getElementById("dashLightboxImg");
  if (!lb || !img || !src) return;
  img.src = src;
  lb.classList.remove("hidden");
  lb.setAttribute("aria-hidden", "false");
}

function closeLightbox() {
  const lb = document.getElementById("dashLightbox");
  const img = document.getElementById("dashLightboxImg");
  if (!lb) return;
  lb.classList.add("hidden");
  lb.setAttribute("aria-hidden", "true");
  if (img) img.removeAttribute("src");
}

// Show a capture's image enlarged. `src` is a full <img> src (data: URL) so both
// thumbnail tiles and viewcapture tiles can reuse this. On mobile/tablet the
// inline preview is hidden, so the capture opens in a full-screen lightbox.
function showPreview(src, tileEl) {
  if (!src) return;
  clearActiveCaptures();
  tileEl?.classList.add("is-active");
  if (MOBILE_MQ.matches) {
    openLightbox(src);
    return;
  }
  const img = document.getElementById("dashPreviewImg");
  const empty = document.getElementById("dashPreviewEmpty");
  if (!img) return;
  img.src = src;
  img.classList.remove("hidden");
  empty?.classList.add("hidden");
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
    if (data) btn.addEventListener("click", () => showPreview("data:image/png;base64," + data, btn));
  });
}

// Pure: pull image src strings out of a /noticeboard/view/get row. The web
// writes `data` as a JSON array of preview strings (data: URLs, or raw base64);
// desktop BinaryFormatter blobs aren't decoded here and yield an empty list.
// Exported (DOM-free) for unit testing.
export function parseViewcaptureImages(row) {
  if (!row) return [];
  let arr = row.data;
  if (typeof arr === "string") {
    try { arr = JSON.parse(arr); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => (v.startsWith("data:") ? v : "data:image/png;base64," + v));
}

// getViewCapture returns a single row (or an array wrapping one). Normalize.
function firstRow(apiResult) {
  if (!apiResult) return null;
  return Array.isArray(apiResult) ? apiResult[0] || null : apiResult;
}

// Render the viewcapture photos (from /noticeboard/view/get) as clickable tiles
// that enlarge into the shared central preview. Separate source from the three
// thumbnail tiles above, which come from /thumbnails/get.
function renderViewcaptures(apiResult) {
  const host = document.getElementById("dashViewcaptures");
  if (!host) return;
  const images = parseViewcaptureImages(firstRow(apiResult));
  const sub = document.getElementById("dashViewcaptureSub");
  if (sub) sub.textContent = images.length ? `${images.length} photo${images.length === 1 ? "" : "s"}` : "—";

  if (!images.length) {
    host.innerHTML = `<div class="dash-viewcaptures-empty">No viewcaptures yet.</div>`;
    return;
  }
  host.innerHTML = images
    .map((src, i) => `
      <button type="button" class="dash-capture" data-vc="${i}">
        <div class="dash-capture-frame"><img src="${src}" alt="Viewcapture ${i + 1}" /></div>
        <div class="dash-capture-label">Viewcapture ${i + 1}</div>
      </button>`)
    .join("");
  host.querySelectorAll(".dash-capture").forEach((btn) => {
    const src = images[Number(btn.dataset.vc)];
    btn.addEventListener("click", () => showPreview(src, btn));
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
      // "coowner" reads better hyphenated in the UI.
      const roleLabel =
        String(role).toLowerCase() === "coowner" ? "co-owner" : role;
      return `
      <tr>
        <td>${escapeHtml(r.username)}</td>
        <td><span class="dash-access-role${isOwner ? " is-owner" : ""}">${escapeHtml(roleLabel)}</span></td>
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
  const stubName = caseStub?.case_id || `Case ${caseId}`;
  if (nameEl) nameEl.textContent = stubName;
  setField("caseId", `UID_${caseId} : ${stubName}`); // UID + case_id label, like the case list
  renderStatusPill(caseStub?.new_status);
  renderRequestDate(caseStub?.expected_date ?? caseStub?.due_date);
  renderSteps(caseStub?.upper_status, caseStub?.lower_status);
  renderCaptures([]);
  renderViewcaptures(null);
  renderAccess([]);

  const auth = { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: caseId };
  const caseIdStr = caseStub?.case_id ?? caseId;

  const [detail, thumbs, viewcaptures, roles] = await Promise.all([
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
    postJson(`${API}/noticeboard/view/get`, [auth, { case_id: caseId }], "POST /noticeboard/view/get").catch(
      (err) => {
        // 404 = no viewcaptures saved yet; treat as empty, not an error.
        console.warn("[dashboard] viewcaptures failed", err);
        return null;
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
  setField("caseId", `UID_${caseIntId} : ${name}`); // UID + case_id label, like the case list
  setField("createdBy", caseStub?.assigned_to || detail.assigned_to || detail.username || "—");
  setField("created", formatDateTime(detail.creation_date));
  setField("lastEdit", formatDateTime(detail.last_updated));
  // Prefer the cached list row: /case/get/:id returns an unreliable new_status /
  // expected_date (the case list overwrites them from the list row too), so the
  // stub is authoritative and keeps the dashboard in sync with the case list.
  renderStatusPill(caseStub?.new_status ?? detail.new_status);
  renderRequestDate(
    caseStub?.expected_date ?? caseStub?.due_date ?? detail.expected_date ?? detail.due_date
  );
  const captureSub = document.getElementById("dashCaptureSub");
  if (captureSub) {
    captureSub.innerHTML = `UID <b>${escapeHtml(String(caseIntId))}</b> · ${escapeHtml(name)}`;
  }

  renderSteps(detail.upper_status, detail.lower_status);
  renderCaptures(Array.isArray(thumbs) ? thumbs : []);
  renderViewcaptures(viewcaptures);
  renderAccess(Array.isArray(roles) ? roles : []);
}

// Self-register the detail pane's "View Dashboard" button.
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("viewDashboardBtn");
  btn?.addEventListener("click", () => {
    // Pass the cached list row (stashed by the case list on selection) so the
    // dashboard has the real new_status / expected_date — /case/get/:id omits
    // them, so without this the status would always fall back to N/A.
    openCaseDashboard(window.selectedCaseId, window.selectedCaseStub || null);
  });
});
