// The "View Dashboard" view: per-jaw process steps, View Captures, Case Access
// and a gallery. Built once, repopulated by openCaseDashboard() thereafter.

import { toast } from "../shared/toast.js";
import { logApi, statusLabel } from "../shared/apiLog.js";
import { API_BASE, MACHINE_ID, getLoggedInUser } from "../shared/api.js";
import { toDateTimeText as formatDateTime } from "../shared/timestamps.js";
import {
  extractFilenamesFromBinaryFormatter as filenamesFromBinaryFormatter,
  extractPngsFromBinaryFormatter as pngsFromBinaryFormatter,
} from "../2D/dotnetBinaryFormatter.js";

// Resolved against the app root (everything before "/src/") so icons load from
// both src/pages/ and the deeper src/pages/admin/, where a fixed path would not.
function appAsset(relFromRoot) {
  const href = typeof window !== "undefined" && window.location ? window.location.href : "";
  const i = href.indexOf("/src/");
  return i !== -1 ? href.slice(0, i + 1) + relFromRoot : "../../" + relFromRoot;
}
const ICON_BASE = appAsset("assets/Dashboard_Icon");

// A jaw's status names the furthest stage it reached, so a stage is done when
// the jaw ranks at or above it. Written by the desktop app; read-only here.
//
// `jaw_prepared` (rank 1) is the ONLY confirmed exact value — add others only
// once seen in a real payload. The rest falls through to keyword inference.
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

// The five stages in order. `rank` is the STATUS_RANK at/above which a jaw counts
// as done, `verb` how a completed stage reads, `desc` an optional sub-line.
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

// Slot of a /thumbnails/get row: 0 = 2D upper, 100 = 2D lower, 1 = 3D upper,
// 2 = 3D lower (reference images take 3, 4, 5, …).
function thumbnailSlot(row) {
  const v = row?.slot ?? row?.slot_index ?? row?.slot_id;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Pure: the per-stage/per-jaw completion model, as
// [{ title, lines: [{ jaw, done, text }] }] in display order.
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

// Pure: stages where EVERY jaw line is done, over computeSteps() output.
export function countCompletedStages(steps) {
  return (steps || []).filter((s) => s.lines.every((l) => l.done)).length;
}

// Pure: /thumbnails/get rows to Map<slot, base64> (0 = 2D upper, 100 = 2D lower,
// 1 = 3D upper, 2 = 3D lower). Untagged legacy rows fall back to positional order.
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

// Mirrored rather than imported: caseManagement.js imports this module, so an
// import back would be a cycle. Titles still come from the shared apiLog.js.
export function caseStatusLabel(apiStatus) {
  return statusLabel(apiStatus);
}

export function caseStatusKind(apiStatus) {
  const v = apiStatus ? String(apiStatus).toLowerCase().replace(/ /g, "_") : "na";
  if (v === "na") return "na"; // unset — neutral grey pill, like the case list
  if (v === "draft") return "draft";
  if (v === "completed" || v === "delivered") return "completed";
  if (v.endsWith("_pending") || v === "pending") return "pending";
  return "progress"; // in_production / out_for_delivery / *_drafted / *_approved
}

// Sets every [data-field] target, so one call paints both the desktop topbar meta
// and the mobile "Case Details" panel.
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
            <span>2D Upper · 2D Lower · 3D Upper · 3D Lower</span>
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
          <span class="dash-col-title"><i class="fa-regular fa-images"></i> 2D &amp; 3D Captures</span>
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

  // Mobile-only, starting collapsed. The whole header bar is the tap target —
  // the chevron is only an affordance.
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

// Phones/tablets hide the inline preview panel, so captures pop full-screen.
// matchMedia is browser-only, so guard it or importing this under jsdom throws.
const MOBILE_MQ =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 1080px)")
    : { matches: false };

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

// `src` is a full <img> src, so thumbnail and viewcapture tiles share this. On
// mobile the inline preview is hidden and it opens as a full-screen lightbox.
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

  // Slot addresses (see annotationLocks.js / caseManagement.js THUMBNAIL_DISPLAY_RANK):
  // 0 = 2D upper, 100 = 2D lower, 1 = 3D upper, 2 = 3D lower.
  const tiles = [
    { slot: 0, label: "2D Upper" },
    { slot: 100, label: "2D Lower" },
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

// Instruction slides are `2D_*`, viewcaptures `3D_*` or unprefixed. Both share
// the one view_capture table, so the prefix is what separates them.
function isInstructionFilename(name) {
  return /^\s*2d[_\-\.\s]/i.test(String(name || ""));
}

// Turn a stored filename into a short human label + kind tag. Strips the
// `2D_`/`3D_` prefix and image extension; falls back to a generic label.
function labelForCapture(name, kind, index) {
  const clean = String(name || "")
    .replace(/^\s*[23]d[_\-\.\s]+/i, "")
    .replace(/\.(png|jpe?g|gif|bmp)$/i, "")
    .trim();
  if (clean) return clean;
  return `${kind === "2D" ? "Instruction" : "Viewcapture"} ${index + 1}`;
}

// Pure: capture images from a /noticeboard/view/get row, keeping BOTH the 2D and
// 3D buckets and either encoding (legacy JSON array, .NET BinaryFormatter blob).
export function parseViewcaptureImages(row) {
  if (!row) return [];

  // Preferred: web's JSON-array encoding of data (and filenames) columns.
  let images = null;
  let names = null;
  if (typeof row.data === "string") {
    try {
      const parsed = JSON.parse(row.data);
      if (Array.isArray(parsed)) images = parsed;
    } catch { /* not JSON — fall through to BinaryFormatter */ }
  } else if (Array.isArray(row.data)) {
    images = row.data;
  }
  if (typeof row.filenames === "string") {
    try {
      const parsed = JSON.parse(row.filenames);
      if (Array.isArray(parsed)) names = parsed;
    } catch { /* fall through */ }
  } else if (Array.isArray(row.filenames)) {
    names = row.filenames;
  }

  // Fallback: BinaryFormatter blob (desktop, and web since 2026-07-06).
  if (!images) images = pngsFromBinaryFormatter(row.data);
  if (!names) names = filenamesFromBinaryFormatter(row.filenames);

  return images
    .map((v, i) => ({ src: v, name: names[i], index: i }))
    .filter((it) => typeof it.src === "string" && it.src.trim())
    .map((it) => {
      const kind = isInstructionFilename(it.name) ? "2D" : "3D";
      return {
        src: it.src.startsWith("data:") ? it.src : "data:image/png;base64," + it.src,
        kind,
        label: labelForCapture(it.name, kind, it.index),
      };
    });
}

// getViewCapture returns a single row (or an array wrapping one). Normalize.
function firstRow(apiResult) {
  if (!apiResult) return null;
  return Array.isArray(apiResult) ? apiResult[0] || null : apiResult;
}

// Viewcapture photos as tiles that enlarge into the shared preview. A different
// source from the thumbnail tiles above, which come from /thumbnails/get.
function renderViewcaptures(apiResult) {
  const host = document.getElementById("dashViewcaptures");
  if (!host) return;
  const items = parseViewcaptureImages(firstRow(apiResult));
  const sub = document.getElementById("dashViewcaptureSub");
  if (sub) {
    const n2d = items.filter((it) => it.kind === "2D").length;
    const n3d = items.length - n2d;
    sub.textContent = items.length ? `${n2d} 2D · ${n3d} 3D` : "—";
  }

  if (!items.length) {
    host.innerHTML = `<div class="dash-viewcaptures-empty">No captures yet.</div>`;
    return;
  }
  host.innerHTML = items
    .map((it, i) => `
      <button type="button" class="dash-capture" data-vc="${i}">
        <div class="dash-capture-frame">
          <span class="dash-capture-badge dash-capture-badge-${it.kind === "2D" ? "2d" : "3d"}">${it.kind}</span>
          <img src="${it.src}" alt="${escapeHtml(it.kind + " " + it.label)}" />
        </div>
        <div class="dash-capture-label">${escapeHtml(it.label)}</div>
      </button>`)
    .join("");
  host.querySelectorAll(".dash-capture").forEach((btn) => {
    const it = items[Number(btn.dataset.vc)];
    btn.addEventListener("click", () => showPreview(it.src, btn));
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

// `caseStub` (the list's row object) supplies the name and stands in while the
// detail request is in flight; pass null to rely entirely on the network.
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

  const [detail, thumbs, viewcaptures, roles] = await Promise.all([
    postJson(`${API_BASE}/case/get/${caseId}`, [auth], "POST /case/get/:id").catch(
      (err) => {
        console.warn("[dashboard] case detail failed", err);
        return caseStub || {};
      }
    ),
    // Numeric case_int_id, never the name string: the admin-path thumbnail lookup
    // parses the payload id as caseIntID, so a name 404s for admin accounts.
    postJson(`${API_BASE}/thumbnails/get`, [auth, { case_int_id: caseId }], "POST /thumbnails/get").catch(
      (err) => {
        console.warn("[dashboard] thumbnails failed", err);
        return [];
      }
    ),
    postJson(`${API_BASE}/noticeboard/view/get`, [auth, { case_id: caseId }], "POST /noticeboard/view/get").catch(
      (err) => {
        // 404 = no viewcaptures saved yet; treat as empty, not an error.
        console.warn("[dashboard] viewcaptures failed", err);
        return null;
      }
    ),
    postJson(`${API_BASE}/role/all/get`, [auth, { case_int_id: caseId }], "POST /role/all/get").catch(
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
  // The cached list row wins: /case/get/:id's new_status/expected_date are
  // unreliable, and the case list overwrites them from the row too.
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
    // The row stashed on selection carries the real new_status/expected_date,
    // which /case/get/:id omits — without it the status always reads N/A.
    openCaseDashboard(window.selectedCaseId, window.selectedCaseStub || null);
  });
});
