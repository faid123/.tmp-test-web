import { lol } from "../shared/crypt.js";
import { toast, confirmModal, openThemedCalendar, attachThemedCalendar } from "../shared/toast.js";
import { logApi, statusLabel } from "../shared/apiLog.js";
import { reportHtmlToDocxBytes } from "../shared/accessibility.js";
import { setupAppSidebar } from "../shared/appSidebar.js";
import { buildReportHtml } from "../2D/noticeboard.js";
import { saveCaseDueDate, toDateInputValue, updateCaseDueDate } from "../2D/caseNote.js";
import {
  ENRICH_CONCURRENCY,
  caseIntIdOf,
  buildEnrichRequests,
  applyEnrichmentResponses,
} from "../shared/caseEnrichment.js";

function getLoggedInUser() {
  const user = localStorage.getItem("loggedInUser");
  return user ? JSON.parse(user) : null;
}

// Per-user cache of the last case list so the table can paint instantly on load
// instead of waiting on /case/user/findall/get — which can lag when the API host
// is briefly busy (right after the 2D page's request burst, or while the chat's
// heavy notes query is still being served by the backend). The network result
// replaces it as soon as it lands. Keyed by uuid so one account never sees
// another's list on the instant paint.
function caseListCacheKey() {
  const u = getLoggedInUser();
  return u?.uuid ? `caseList_cache_${u.uuid}` : null;
}
function saveCachedCases(list) {
  const key = caseListCacheKey();
  if (!key || !Array.isArray(list)) return;
  try {
    // Strip "__"-prefixed bookkeeping (e.g. the lazy-enrichment __enrich state)
    // so a cached "done" marker can't suppress re-fetching in a later session.
    const json = JSON.stringify(list, (k, v) => (k.startsWith("__") ? undefined : v));
    localStorage.setItem(key, json);
  } catch {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}
function loadCachedCases() {
  const key = caseListCacheKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let currentSortColumn = "recent";
let currentSortOrder = "desc";
let currentCases = [];
let existingUsers = [];

// Stat-card filters (replace the old "Filter by Status" dropdown). Each card
// represents a *stage* — a group of raw statuses — so one click filters the
// whole list to that stage. Keys are the canonical underscore values produced
// by apiStatusToValue(). "na" (no status yet) is deliberately left out of every
// stage, so N/A cases are excluded from the stage counts.
const STATUS_GROUPS = {
  // Draft → 3D design approved.
  preparation: new Set([
    "draft",
    "2d_design_pending",
    "2d_design_drafted",
    "2d_design_approved",
    "3d_design_pending",
    "3d_design_drafted",
    "3d_design_approved",
  ]),
  // In production → delivered.
  delivery: new Set(["in_production", "out_for_delivery", "delivered"]),
  // Completed.
  completed: new Set(["completed"]),
};

// Which stat card is active ("all" = no stage filter). Toggled by clicking a
// card; a second click on the active card clears back to "all".
let activeStatusFilter = "all";

// The stage a case belongs to, or null if it matches none (shouldn't happen
// given the groups above cover every status).
function caseStatusGroup(caseItem) {
  const v = apiStatusToValue(caseItem?.new_status);
  for (const [group, set] of Object.entries(STATUS_GROUPS)) {
    if (set.has(v)) return group;
  }
  return null;
}

let currentThumbnails = [];
let currentImageIndex = 0;
window.selectedCaseId = null;
// 获取用户的病例列表
async function fetchCases() {
  const loggedInUser = getLoggedInUser();
  if (!loggedInUser) {
    console.error("User not logged in.");
    return null;
  }

  const requestBody = JSON.stringify([
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: loggedInUser.uuid,
    },
    { uuid: loggedInUser.uuid },
  ]);

  try {
    const response = await fetch(
      "https://live.api.smartrpdai.com/api/smartrpd/case/user/findall/get",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      }
    );
    logApi(response, 'POST /case/user/findall/get');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? dedupeCases(data) : data;
  } catch (err) {
    console.error("❌ Failed to fetch cases:", err);
    // TypeError: Failed to fetch is what the browser throws when CORS blocks
    // the response or the network call itself fails — surface it to the user
    // instead of leaving the case list silently empty.
    const isNetwork = err instanceof TypeError;
    if (typeof toast !== "undefined") {
      toast.error(
        isNetwork
          ? "Couldn't reach the server. Please wait a moment and try again."
          : `Failed to load cases (${err.message || err}).`
      );
    }
    return null;
  }
}

// Server can return the same case multiple times when the logged-in user has
// more than one role on it (owner + co-owner, etc.). Collapse to one entry.
function dedupeCases(list) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const key = c?.id ?? c?.case_int_id ?? c?.case_id;
    if (key == null) { out.push(c); continue; }
    const k = String(key);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

// 通用：删除指定 case
async function deleteCaseById(caseId, { skipConfirm = false } = {}) {
  const user = getLoggedInUser();
  if (!caseId || !user?.uuid) {
    toast.warning("Unable to delete: missing case id or login.");
    return false;
  }

  if (!skipConfirm) {
    const confirmed = await confirmModal({
      title: "Delete case?",
      message: "This will permanently remove the case and its files. This action cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!confirmed) return false;
  }

  const numericCaseId =
    typeof caseId === "number" ? caseId : Number(caseId);
  const caseIdForApi = Number.isFinite(numericCaseId) ? numericCaseId : caseId;

  const requestBody = JSON.stringify([
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: user.uuid,
      caseIntID: caseIdForApi,
    },
    { case_int_id: caseIdForApi },
  ]);

  console.log("[case/delete] →", { caseId: caseIdForApi, body: requestBody });

  try {
    const response = await fetch(
      `https://live.api.smartrpdai.com/api/smartrpd/case/delete/${caseIdForApi}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      }
    );
    logApi(response, 'POST /case/delete/:id');
    const rawText = await response.text();
    console.log("[case/delete] ←", response.status, rawText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${rawText.slice(0, 200)}`);
    }

    currentCases = currentCases.filter(
      (c) =>
        c.id !== caseId &&
        c.case_int_id !== caseId &&
        c.case_id !== caseId &&
        c.id !== caseIdForApi &&
        c.case_int_id !== caseIdForApi
    );
    populateTable(currentCases);

    if (
      window.selectedCaseId === caseId ||
      window.selectedCaseId === caseIdForApi
    ) {
      window.selectedCaseId = null;
      ["selected-case", "created-by", "date-created", "last-edited"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = "—";
      });
      const pill = document.getElementById("statusPill");
      if (pill) {
        pill.className = "cm-pill cm-pill-na";
        pill.textContent = "N/A";
      }
      const avatar = document.getElementById("assigneeAvatar");
      if (avatar) avatar.textContent = "·";
      renderSharedWith([]);
      renderCaseInstructions(null, "");
      currentThumbnails = [];
      currentImageIndex = 0;
      updateThumbnail();
    }

    return true;
  } catch (err) {
    console.error("❌ Delete failed:", err);
    toast.error(`Failed to delete case. ${err.message || err}`);
    return false;
  }
}

// Pop-up progress bar for operations whose duration we can't measure precisely
// (the duplicate runs server-side behind a single POST). Animates a percentage
// that creeps toward 90% while the work is in flight, then snaps to 100% on
// completion. Reuses the .cc-loading-* card/bar styles from createCase.css via a
// fixed-viewport overlay built on the fly (no markup needed in case_list.html).
function createProgressOverlay(label = "Working…") {
  const overlay = document.createElement("div");
  overlay.className = "cc-loading-overlay cc-loading-overlay--fixed";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div class="cc-loading-card">
      <div class="cc-loading-header">
        <span class="cc-loading-label"></span>
        <span class="cc-loading-percent">0%</span>
      </div>
      <div class="cc-loading-bar" aria-hidden="true">
        <div class="cc-loading-bar-fill"></div>
      </div>
    </div>`;
  const labelEl = overlay.querySelector(".cc-loading-label");
  const percentEl = overlay.querySelector(".cc-loading-percent");
  const fillEl = overlay.querySelector(".cc-loading-bar-fill");
  labelEl.textContent = label;
  document.body.appendChild(overlay);

  let pct = 0;
  const render = () => {
    const r = Math.round(pct);
    fillEl.style.width = `${r}%`;
    percentEl.textContent = `${r}%`;
  };
  render();

  // Ease toward 90% (asymptotic, so it never claims to be finished early) to
  // keep the bar feeling alive during the single duplicate request.
  const timer = setInterval(() => {
    if (pct < 90) {
      pct += (90 - pct) * 0.12;
      render();
    }
  }, 220);

  return {
    setLabel(text) {
      labelEl.textContent = text;
    },
    // Snap to 100%, hold briefly so the user sees completion, then remove.
    async finish() {
      clearInterval(timer);
      pct = 100;
      render();
      await new Promise((resolve) => setTimeout(resolve, 350));
      overlay.remove();
    },
    // Tear down immediately (e.g. on error).
    destroy() {
      clearInterval(timer);
      overlay.remove();
    },
  };
}

// Duplicate a case by id. Mirrors the C# RestAPI.DuplicateCase flow: POST
// [authData, {case_id: caseIntID}] to /case/duplicate/{id}; the server creates
// a new case and returns an InsertID payload. We reload the list so the new
// case shows up with fresh thumbnails/details.
async function duplicateCaseById(caseId, { skipConfirm = false } = {}) {
  const user = getLoggedInUser();
  if (!caseId || !user?.uuid) {
    toast.warning("Unable to duplicate: missing case id or login.");
    return false;
  }

  if (!skipConfirm) {
    const confirmed = await confirmModal({
      title: "Duplicate case?",
      message: "A new case will be created with the same files and details.",
      confirmText: "Duplicate",
      cancelText: "Cancel",
      variant: "info",
    });
    if (!confirmed) return false;
  }

  const numericCaseId =
    typeof caseId === "number" ? caseId : Number(caseId);
  const caseIdForApi = Number.isFinite(numericCaseId) ? numericCaseId : caseId;

  const requestBody = JSON.stringify([
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: user.uuid,
      caseIntID: caseIdForApi,
    },
    { case_id: String(caseIdForApi) },
  ]);

  const progress = createProgressOverlay("Duplicating case…");

  try {
    const response = await fetch(
      "https://live.api.smartrpdai.com/api/smartrpd/case/duplicate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      }
    );
    logApi(response, 'POST /case/duplicate');
    const rawText = await response.text();
    console.log("[case/duplicate] ←", response.status, rawText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${rawText.slice(0, 200)}`);
    }

    let newId;
    try {
      const data = JSON.parse(rawText);
      newId = data?.id ?? data?.case_int_id ?? data?.insert_id;
    } catch {
      // server returned a non-JSON success body — that's fine, we'll just reload
    }

    toast.success(
      newId != null
        ? `Case duplicated (new id: ${newId}).`
        : "Case duplicated successfully."
    );

    // Snap the bar to 100% and hold briefly so the user sees it complete, then
    // mirror SessionManager.RefreshCaseList — reload so the new case appears
    // with its full server-side detail/thumbnail set, same as refreshListBtn.
    progress.setLabel("Finalizing…");
    await progress.finish();
    window.location.reload();
    return true;
  } catch (err) {
    progress.destroy();
    console.error("❌ Duplicate failed:", err);
    toast.error(`Failed to duplicate case. ${err.message || err}`);
    return false;
  }
}

function pinnedStorageKey() {
  const user = getLoggedInUser();
  return `pinnedCases:${user?.uuid || "anon"}`;
}

function getPinnedSet() {
  try {
    const arr = JSON.parse(localStorage.getItem(pinnedStorageKey()) || "[]");
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

function setPinnedSet(set) {
  localStorage.setItem(pinnedStorageKey(), JSON.stringify([...set]));
}

function togglePinned(caseId) {
  const set = getPinnedSet();
  const id = String(caseId);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  setPinnedSet(set);
  return set.has(id);
}


function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// The backend often stores jaw meshes as OFF; many CAD/slicer tools only open
// STL, so the download bundle ships an STL copy too. `bytes` starts with "OFF".
function isOffBytes(bytes) {
  return bytes && bytes[0] === 0x4f && bytes[1] === 0x46 && bytes[2] === 0x46;
}

// Convert an OFF mesh (text) to a binary STL byte array. Standalone (no THREE)
// so the case list stays light. Polygons are fan-triangulated; degenerate faces
// referencing missing vertices are dropped so the header count stays accurate.
function offTextToBinaryStl(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length);
  if (!lines.length || lines[0].toUpperCase() !== "OFF") return null;
  const header = lines[1].split(/\s+/).map(Number);
  const numVertices = header[0];
  const numFaces = header[1];
  if (!Number.isFinite(numVertices) || !Number.isFinite(numFaces)) return null;

  const verts = new Array(numVertices);
  for (let i = 0; i < numVertices; i++) {
    const p = lines[2 + i].split(/\s+/).map(Number);
    verts[i] = [p[0], p[1], p[2]];
  }

  const tris = [];
  const faceStart = 2 + numVertices;
  for (let i = 0; i < numFaces; i++) {
    const p = lines[faceStart + i].split(/\s+/).map(Number);
    const n = p[0];
    for (let k = 2; k < n; k++) tris.push([p[1], p[k], p[k + 1]]); // fan
  }
  const valid = tris.filter(([a, b, c]) => verts[a] && verts[b] && verts[c]);

  const buffer = new ArrayBuffer(84 + valid.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, valid.length, true); // 80-byte header left zeroed
  let off = 84;
  for (const [ia, ib, ic] of valid) {
    const a = verts[ia];
    const b = verts[ib];
    const c = verts[ic];
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.hypot(nx, ny, nz) || 1;
    view.setFloat32(off, nx / len, true); off += 4;
    view.setFloat32(off, ny / len, true); off += 4;
    view.setFloat32(off, nz / len, true); off += 4;
    for (const v of [a, b, c]) {
      view.setFloat32(off, v[0], true); off += 4;
      view.setFloat32(off, v[1], true); off += 4;
      view.setFloat32(off, v[2], true); off += 4;
    }
    view.setUint16(off, 0, true); off += 2; // attribute byte count
  }
  return new Uint8Array(buffer);
}

function triggerBlobDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const DL_API = "https://live.api.smartrpdai.com/api/smartrpd";
const DL_MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

function safeDownloadBase(name, fallback = "case") {
  return String(name || fallback).replace(/[^a-z0-9_\-]+/gi, "_").replace(/^_+|_+$/g, "") || fallback;
}

// Fetch the case's STL files, preferring processed STLs and falling back to raw.
async function fetchCaseStls(caseIntId, uuid) {
  const payload = [
    { machine_id: DL_MACHINE_ID, uuid, caseIntID: caseIntId },
    { case_int_id: caseIntId },
  ];
  for (const endpoint of [`${DL_API}/stl/get`, `${DL_API}/stl/raw/get`]) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      logApi(res, `POST ${endpoint.replace(DL_API, "")}`);
      if (!res.ok) continue;
      const data = await res.json();
      const files = (Array.isArray(data) ? data : [data]).filter((i) => i && i.data);
      if (files.length) return files;
    } catch (err) {
      console.warn("[case/download] STL endpoint failed", endpoint, err);
    }
  }
  return [];
}

// The reference images attached to the case (create-case upload). Rows come back
// as { image_name, image_data }, image_data being a data URL or bare base64.
async function fetchCaseReferenceImages(caseIntId, uuid) {
  const res = await fetch(`${DL_API}/referenceImages/getall`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { machine_id: DL_MACHINE_ID, uuid, caseIntID: caseIntId },
      { case_id: caseIntId },
    ]),
  });
  logApi(res, "POST /referenceImages/getall");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : [data]).filter((row) => row?.image_data || row?.data);
}

// Fallback source: every reference image uploaded through the web is also
// mirrored into a thumbnail slot, where slots 0-2 are the 2D composite and the
// upper/lower jaw renders and 3+ are the references. Used only when the
// referenceImages table has no rows for the case (e.g. desktop-created cases).
async function fetchReferenceThumbnails(caseIntId, uuid) {
  try {
    const res = await fetch(`${DL_API}/thumbnails/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: DL_MACHINE_ID, uuid, caseIntID: caseIntId },
        { case_int_id: caseIntId },
      ]),
    });
    logApi(res, "POST /thumbnails/get");
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.filter((r) => r?.data && (thumbnailSlot(r) ?? -1) >= 3);
  } catch (err) {
    console.warn("[case/download] reference thumbnail fetch failed", err);
    return [];
  }
}

function sniffImageExt(bytes) {
  if (!bytes || bytes.length < 4) return "";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
  return "";
}

// Decode a stored image (data URL or bare base64) into bytes plus the extension
// its bytes actually call for — the stored name is often extension-less.
function decodeImagePayload(value) {
  const raw = String(value || "").trim();
  const isDataUrl = raw.startsWith("data:");
  const base64 = (isDataUrl ? raw.slice(raw.indexOf(",") + 1) : raw).replace(/\s+/g, "");
  const bytes = base64ToBytes(base64);
  let ext = isDataUrl ? (/^data:([^;,]+)/.exec(raw)?.[1] || "").split("/")[1] || "" : "";
  if (!ext) ext = sniffImageExt(bytes);
  if (ext === "jpeg") ext = "jpg";
  return { bytes, ext: ext || "png" };
}

function referenceImageName(row, index, ext, base) {
  const raw = String(row?.image_name || row?.filename || row?.name || "").trim();
  const cleaned = raw.replace(/[\\/:*?"<>|]+/g, "_");
  if (cleaned) return /\.[a-z0-9]{2,5}$/i.test(cleaned) ? cleaned : `${cleaned}.${ext}`;
  return `${base}_reference_${index + 1}.${ext}`;
}

// Two uploads can share a filename; the zip needs them distinct.
function uniqueDownloadName(name, used) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  let candidate = `${stem}_${n}${ext}`;
  while (used.has(candidate)) candidate = `${stem}_${++n}${ext}`;
  used.add(candidate);
  return candidate;
}

// The case's reference images as ready-to-write { name, bytes } files: the
// referenceImages table first, the mirrored thumbnail slots as fallback. Rethrows
// a failed primary fetch only when the fallback found nothing either, so callers
// can tell "no images" apart from "the lookup broke". Shared by the menu action
// and the bundle download so both ship the same files under the same names.
async function collectReferenceImageFiles(caseIntId, uuid, base) {
  let rows = [];
  let primaryErr = null;
  try {
    rows = await fetchCaseReferenceImages(caseIntId, uuid);
  } catch (err) {
    primaryErr = err;
  }
  if (!rows.length) rows = await fetchReferenceThumbnails(caseIntId, uuid);
  if (!rows.length && primaryErr) throw primaryErr;

  const used = new Set();
  const files = [];
  rows.forEach((row, index) => {
    try {
      const { bytes, ext } = decodeImagePayload(row.image_data ?? row.data);
      if (!bytes.length) return;
      files.push({ bytes, name: uniqueDownloadName(referenceImageName(row, index, ext, base), used) });
    } catch (err) {
      console.warn("[case/download] skipped unreadable reference image", index, err);
    }
  });
  return files;
}

async function downloadCaseReferenceImages(caseIntId, caseLabel) {
  const user = getLoggedInUser();
  if (!user?.uuid || caseIntId == null) {
    toast.warning("Unable to download: missing case info or login.");
    return;
  }

  const base = safeDownloadBase(caseLabel, `case_${caseIntId}`);
  toast.info("Preparing reference images...");

  try {
    const files = await collectReferenceImageFiles(caseIntId, user.uuid, base);
    if (!files.length) {
      toast.info("No reference images found for this case.");
      return;
    }

    if (files.length === 1) {
      triggerBlobDownload(files[0].bytes, files[0].name);
      toast.success("Reference image download ready.");
      return;
    }

    if (typeof window.JSZip === "function") {
      const zip = new window.JSZip();
      files.forEach((file) => zip.file(file.name, file.bytes));
      const blob = await zip.generateAsync({ type: "uint8array" });
      triggerBlobDownload(blob, `${base}_reference_images.zip`);
    } else {
      // No zip library — save them one by one, spaced out so the browser does
      // not treat the burst as a popup and drop all but the first.
      for (const file of files) {
        triggerBlobDownload(file.bytes, file.name);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    toast.success(`${files.length} reference images downloaded.`);
  } catch (err) {
    console.error("Failed to download reference images:", err);
    toast.error(`Failed to download reference images. ${err.message || err}`);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Re-encode an image data URL (or raw base64 PNG) to JPEG bytes for the zip.
async function dataUrlToJpegBytes(data) {
  const src = String(data).startsWith("data:") ? data : `data:image/png;base64,${data}`;
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return base64ToBytes(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
}

// The case's 2D design image (thumbnail slot 0 = composite 2D) as JPEG bytes.
async function fetchCase2dJpegBytes(caseIntId, uuid) {
  try {
    const res = await fetch(`${DL_API}/thumbnails/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: DL_MACHINE_ID, uuid, caseIntID: caseIntId },
        // Numeric id, not the case-name string — the admin-path lookup parses
        // this as caseIntID (string names 404 for admin accounts).
        { case_int_id: caseIntId },
      ]),
    });
    logApi(res, "POST /thumbnails/get");
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const slot0 = rows.find((r) => Number(r?.slot) === 0) || rows[0];
    if (!slot0?.data) return null;
    return await dataUrlToJpegBytes(slot0.data);
  } catch (err) {
    console.warn("[case/download] 2D thumbnail fetch failed", err);
    return null;
  }
}

// Action-column "Download files": bundle the case's STL files, its 2D design
// JPEG, the reference images and the design report (.docx) into one zip. Each
// part is best-effort — whatever's available goes in; only an empty result aborts.
async function downloadCaseFiles(caseIntId, caseLabel, apiStatus) {
  const user = getLoggedInUser();
  if (!user?.uuid || caseIntId == null) {
    toast.warning("Unable to download: missing case info or login.");
    return;
  }
  if (typeof window.JSZip !== "function") {
    toast.error("Zip library failed to load. Please refresh and try again.");
    return;
  }

  toast.info("Preparing download…");
  const base = String(caseLabel || `case_${caseIntId}`).replace(/[^a-z0-9_\-]+/gi, "_");
  const zip = new window.JSZip();
  let added = 0;

  // 1) STL files.
  try {
    const files = await fetchCaseStls(caseIntId, user.uuid);
    const usedNames = new Set();
    files.forEach((file, idx) => {
      const type = String(file.type || file.jaw_type || "").toLowerCase();
      const suffix = type || `file_${idx + 1}`;
      let name = file.filename || `${base}_${suffix}.stl`;
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf(".");
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        name = `${stem}_${idx + 1}${ext}`;
      }
      usedNames.add(name);
      try {
        const bytes = base64ToBytes(file.data);
        zip.file(name, bytes);
        added += 1;
        // The mesh is often OFF; also emit an STL copy so STL-only tools work.
        if (isOffBytes(bytes)) {
          const stl = offTextToBinaryStl(new TextDecoder().decode(bytes));
          if (stl) {
            let stlName = /\.off$/i.test(name)
              ? name.replace(/\.off$/i, ".stl")
              : `${name.replace(/\.[^.]+$/, "")}.stl`;
            if (usedNames.has(stlName)) {
              stlName = `${stlName.replace(/\.stl$/i, "")}_${idx + 1}.stl`;
            }
            usedNames.add(stlName);
            zip.file(stlName, stl);
            added += 1;
          }
        }
      } catch (err) {
        console.error("❌ Failed to add STL to zip:", name, err);
      }
    });
  } catch (err) {
    console.warn("[case/download] STL bundling failed", err);
  }

  // 2) 2D design JPEG (thumbnail slot 0).
  try {
    const jpeg = await fetchCase2dJpegBytes(caseIntId, user.uuid);
    if (jpeg) {
      zip.file(`${base}_2D.jpg`, jpeg);
      added += 1;
    }
  } catch (err) {
    console.warn("[case/download] 2D JPEG failed", err);
  }

  // 3) Reference images, kept in their own folder so they don't collide with
  //     the STL/report names at the zip root.
  try {
    const refFiles = await collectReferenceImageFiles(caseIntId, user.uuid, base);
    refFiles.forEach((file) => {
      zip.file(`reference_images/${file.name}`, file.bytes);
      added += 1;
    });
  } catch (err) {
    console.warn("[case/download] reference images failed", err);
  }

  // 4) Design report as a Word .docx.
  try {
    const html = await buildReportHtml(caseIntId, { caseLabel, apiStatus });
    const docx = await reportHtmlToDocxBytes(html);
    zip.file(`${base}_report.docx`, docx);
    added += 1;
  } catch (err) {
    console.warn("[case/download] report .docx failed", err);
  }

  if (!added) {
    toast.info("No files available to download for this case.");
    return;
  }

  try {
    const blob = await zip.generateAsync({ type: "uint8array" });
    triggerBlobDownload(blob, `${base}.zip`);
    toast.success("Download ready.");
  } catch (err) {
    console.error("❌ Failed to generate zip:", err);
    toast.error(`Failed to generate zip: ${err.message || err}`);
  }
}

// Map an API status string to a CSS modifier so card/detail pills get the
// right color (yellow/blue/green/grey). Keep the keys broad — anything we
// don't recognise falls back to a neutral "na" pill.
function statusPillClass(apiStatus) {
  const v = apiStatusToValue(apiStatus);
  if (!v || v === "na") return "cm-pill-na";
  if (v === "completed") return "cm-pill-completed";
  // 2D/3D design approved (+ 3D drafted) read as orange to match the
  // Preparation card.
  if (
    v === "draft" ||
   (v.endsWith("_pending") || v === "pending") ||
   (v.endsWith("_drafted") || v === "drafted") ||
   (v.endsWith("_approved") || v === "approved") 
  ) return "cm-pill-prep";
  if (
    v === "in_production" ||
    v === "out_for_delivery" ||
    v === "delivered" 
  ) return "cm-pill-progress";
}

// Exact status titles live in apiLog.js (shared with the dashboard and the
// generated report) so the pill reads identically everywhere.
function statusDisplayText(apiStatus) {
  return statusLabel(apiStatus);
}

// Inner markup for a case-list status pill. The pill doubles as its own edit
// control, so it carries a pencil beside the label. Built here rather than
// inline because patchRowInPlace also repaints these — assigning textContent
// there would silently drop the icon.
function statusPillInner(apiStatus) {
  return (
    `<span class="cm-pill-label">${escapeAttr(statusDisplayText(apiStatus))}</span>` +
    `<i class="fa-regular fa-pen-to-square cm-pill-pencil" aria-hidden="true"></i>`
  );
}

// Paint the read-only STATUS pill (text + color) in the detail pane. The native
// <select> is kept only as the (invisible) editing control, so the visible pill
// is what reflects the current status.
function applyStatusPillToSelect(apiStatus) {
  const pill = document.getElementById("statusPillText");
  if (!pill) return;
  pill.className = `cm-pill ${statusPillClass(apiStatus)}`;
  pill.textContent = statusDisplayText(apiStatus);
}

function initialsFor(name) {
  const s = String(name || "").trim();
  if (!s) return "·";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

function escapeAttr(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

// Render the co-owner list into the detail pane's SHARED WITH field. Each
// co-owner shows as a small name pill (no avatar); empty arrays render an
// em-dash so the field never sits blank.
function renderSharedWith(coOwners) {
  const container = document.getElementById("shared-with-list");
  if (!container) return;
  const names = Array.isArray(coOwners) ? coOwners.filter(Boolean) : [];
  if (!names.length) {
    container.innerHTML = '<span class="cm-shared-empty">—</span>';
    return;
  }
  const joined = names.map((name) => escapeAttr(name)).join(", ");
  container.innerHTML = `<span class="cm-shared-name" title="${joined}">${joined}</span>`;
}

// Render the case list as a sortable table. The owner cell shows a "+N"
// badge (titled with the full list) when a case has co-owners.
function populateTable(cases) {
  // Legacy per-status dropdown (still present on the admin page).
  const sel = document.getElementById("filter-status");
  if (sel && sel.value !== "all") {
    cases = cases.filter((c) => apiStatusToValue(c.new_status) === sel.value);
  }

  // Stat-card stage filter (user case list). "all" = show everything.
  if (activeStatusFilter !== "all" && STATUS_GROUPS[activeStatusFilter]) {
    const group = STATUS_GROUPS[activeStatusFilter];
    cases = cases.filter((c) => group.has(apiStatusToValue(c.new_status)));
  }

  const pinnedSet = getPinnedSet();
  const dir = currentSortOrder === "asc" ? 1 : -1;
  cases = [...(cases || [])].sort((a, b) => {
    const aId = String(a.id ?? a.case_int_id ?? "");
    const bId = String(b.id ?? b.case_int_id ?? "");
    // Pinned cases always group above unpinned, regardless of the active sort.
    const pinDiff = Number(pinnedSet.has(bId)) - Number(pinnedSet.has(aId));
    if (pinDiff !== 0) return pinDiff;
    // Within each pin group, order by the user's chosen column. "recent"
    // (the default) keeps the most recently edited case on top — so the case
    // you just opened/edited bubbles up automatically, shared across devices.
    const av = sortValue(a, currentSortColumn);
    const bv = sortValue(b, currentSortColumn);
    const cmp =
      typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
    return cmp * dir;
  });

  const body = document.getElementById("caseTableBody");
  const countBadge = document.getElementById("caseCountBadge");
  if (countBadge) countBadge.textContent = String(cases?.length || 0);
  // Reflect the current match count in the search bar (visible only while a
  // name/date/status search is active).
  updateSearchResultCount(cases?.length || 0);
  if (!body) return;
  // Rows are about to be torn down — drop their pending visibility watches;
  // the loop below re-registers whichever new rows still need enrichment.
  if (rowObserver) rowObserver.disconnect();
  body.innerHTML = "";

  if (!cases || cases.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="cm-list-empty" colspan="7">No cases found.</td>`;
    body.appendChild(tr);
    return;
  }

  cases.forEach((caseItem) => {
    const resolvedCaseId = caseItem.id ?? caseItem.case_int_id;
    const assignedTo = caseItem.assigned_to || caseItem.username || "N/A";
    const dueDate =
      caseItem.expected_date ||
      caseItem.due_date ||
      computeDefaultDueDate(caseItem.creation_date);
    const caseIntId = caseItem.id ?? caseItem.case_int_id;
    const caseName = caseItem.case_id ? truncateWords(caseItem.case_id, 10) : null;
    const caseDisplayName = caseName
      ? caseIntId != null
        ? `UID_${caseIntId} : ${caseName}`
        : caseName
      : "N/A";

    const pinned = pinnedSet.has(String(resolvedCaseId));

    const row = document.createElement("tr");
    row.className = "cm-row";
    if (pinned) row.classList.add("is-pinned");
    // Admins receive soft-deleted cases in the list (server sets
    // hideDeleted = !is_admin); flag them so they read as struck-through and
    // the "Retrieve the Case" action has an obvious target.
    if (isCaseDeleted(caseItem)) row.classList.add("cm-row-deleted");
    // Re-apply the selected highlight after a re-render (filter/refresh/sort/
    // pin), since the table body is rebuilt but window.selectedCaseId persists.
    if (
      window.selectedCaseId != null &&
      String(resolvedCaseId) === String(window.selectedCaseId)
    ) {
      row.classList.add("is-active");
    }
    row.dataset.caseId = resolvedCaseId;
    row.setAttribute("role", "button");
    row.tabIndex = 0;

    // Urgency bar shown at the left of the row, colored by days remaining
    // until the due date (compared with today).
    const dueInd = dueDateIndicator(dueDate);
    const dueBarHtml = dueInd
      ? `<span class="cm-due-bar ${dueInd.cls}" title="${escapeAttr(dueInd.label)}" aria-hidden="true"></span>`
      : "";

    row.innerHTML = `
      <td class="cm-td-name">
        <span class="cm-row-name" title="${escapeAttr(caseItem.case_id || "")}">${escapeAttr(caseDisplayName)}</span>${pinned ? '<i class="fa-solid fa-flag cm-row-pin" title="Pinned"></i>' : ""}${dueBarHtml}
      </td>
      <td class="cm-td-status">
        <span class="cm-pill ${statusPillClass(caseItem.new_status)}" data-action="edit-status" role="button" tabindex="0" title="Change status">${statusPillInner(caseItem.new_status)}</span>
      </td>
      <td class="cm-td-date" data-label="Created">${formatDateTime(caseItem.creation_date)}</td>
      <td class="cm-td-date cm-due-date ${dueInd ? dueInd.cls : ""}" data-label="Due">
        <span class="cm-due-text">${dueDate ? formatDateOnly(dueDate) : "N/A"}</span>
        <button class="cm-due-edit" type="button" title="Edit due date" aria-label="Edit due date" data-action="edit-due"><i class="fa-regular fa-pen-to-square"></i></button>
      </td>
      <td class="cm-td-owner" data-label="Owner">
        <i class="fa-regular fa-circle-user"></i><span class="cm-owner-name" title="${escapeAttr(assignedTo)}">${escapeAttr(assignedTo)}</span>
      </td>
      <td class="cm-td-shared" data-label="Shared With">
        ${caseItem.co_owners?.length
          ? `<span class="cm-shared-names" title="${escapeAttr(caseItem.co_owners.join(", "))}">${escapeAttr(caseItem.co_owners.join(", "))}</span>`
          : '<span class="cm-shared-empty">—</span>'}
      </td>
      <td class="cm-td-actions">
        <button class="cm-row-icon" type="button" title="Rename" aria-label="Rename" data-action="rename"><i class="fa-regular fa-pen-to-square"></i></button>
        <button class="cm-row-icon" type="button" title="Download files" aria-label="Download files" data-action="download"><i class="fa-regular fa-circle-down"></i></button>
        <button class="cm-row-icon ${pinned ? "is-pinned" : ""}" type="button" title="${pinned ? "Unpin" : "Pin to top"}" aria-label="${pinned ? "Unpin" : "Pin to top"}" aria-pressed="${pinned}" data-action="flag"><i class="${pinned ? "fa-solid" : "fa-regular"} fa-star"></i></button>
        <button class="cm-row-icon cm-row-icon-danger" type="button" title="Delete" aria-label="Delete" data-action="delete"><i class="fa-regular fa-trash-can"></i></button>
      </td>
    `;

    const selectRow = () => {
      handleRowClick(resolvedCaseId);
      body.querySelectorAll(".cm-row").forEach((r) => r.classList.remove("is-active"));
      row.classList.add("is-active");
    };

    row.addEventListener("click", selectRow);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectRow();
      }
    });

    row.querySelector('[data-action="download"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      // Pass the case's authoritative status (from additionalcasedetails, merged
      // into the list row) so the report's status badge matches the case list /
      // dashboard — /case/get/:id, which the report would otherwise read, omits it.
      await downloadCaseFiles(resolvedCaseId, caseItem.case_id, caseItem.new_status ?? null);
    });

    row.querySelector('[data-action="rename"]').addEventListener("click", (e) => {
      e.stopPropagation();
      selectRow();
      document.getElementById("renameBtn")?.click();
    });

    row.querySelector('[data-action="flag"]').addEventListener("click", (e) => {
      e.stopPropagation();
      togglePinned(resolvedCaseId);
      applyClientFilters();
    });

    row.querySelector('[data-action="delete"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await deleteCaseById(resolvedCaseId);
      if (ok) toast.success("Case deleted successfully.");
    });

    // Inline "Edit due date" straight from the list (user feedback: allow
    // editing the Due Date on the main case-management page).
    const dueTd = row.querySelector(".cm-due-date");
    row.querySelector('[data-action="edit-due"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      // Recompute at click time: lazy enrichment may have patched the case's
      // due date after this row was rendered.
      const freshDue =
        caseItem.expected_date || caseItem.due_date || computeDefaultDueDate(caseItem.creation_date);
      openDueDateEditor(dueTd, caseItem, resolvedCaseId, freshDue);
    });

    // STATUS, which until now could only be changed from the detail pane after
    // selecting the case. The pill is the control itself — no separate pencil.
    const statusTd = row.querySelector(".cm-td-status");
    const statusPill = row.querySelector('[data-action="edit-status"]');
    statusPill?.addEventListener("click", (e) => {
      e.stopPropagation();
      openStatusEditor(statusTd, caseItem, resolvedCaseId);
    });
    // The row itself answers Enter/Space by selecting the case, so the pill has
    // to claim those keys before they bubble.
    statusPill?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      openStatusEditor(statusTd, caseItem, resolvedCaseId);
    });

    body.appendChild(row);

    // Lazy enrichment: un-enriched rows fetch their details/co-owners when
    // they scroll into view (see the enrichment section below).
    observeRowForEnrichment(row, caseItem);
  });

  // Refresh the admin overview cards whenever the table is (re)painted.
  scheduleAdminStats();
}

// 点击某一行时获取病例详情
async function handleRowClick(caseId) {
  window.selectedCaseId = caseId;
  const loggedInUser = getLoggedInUser();
  if (!loggedInUser || !caseId) return;

  // The detail pane reads enriched fields (status/due/co-owners) from the list
  // row — jump this case to the front of the lazy queue so they land ASAP;
  // syncDetailPaneIfSelected repaints the pane when they do.
  enqueueEnrichment(
    currentCases.find((c) => c.id === caseId || c.case_int_id === caseId),
    { front: true }
  );

  const requestBody = JSON.stringify([
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: loggedInUser.uuid,
      caseIntID: caseId,
    },
  ]);

  try {
    const response = await fetch(
      `https://live.api.smartrpdai.com/api/smartrpd/case/get/${caseId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      }
    );
    logApi(response, 'POST /case/get/:id');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const detail = await response.json();

    // 把 currentCases 中对应行取出来
    const extra = currentCases.find(
      (c) => c.id === caseId || c.case_int_id === caseId
    );
    if (extra) {
      Object.assign(detail, {
        new_status: extra.new_status,
        expected_date: extra.expected_date,
        assigned_to: extra.assigned_to,
        comments: extra.comments,
        co_owners: extra.co_owners,
      });
    }

    // Stash the merged row so the dashboard ("View Dashboard", opened later) can
    // read the real new_status / expected_date — /case/get/:id omits them, which
    // is why those fields are merged from the cached list row (`extra`) here.
    window.selectedCaseStub = detail;

    // Persist this case's Due Date (same value/fallback as the list "Due" column)
    // so the 2D design's Case Note can default "Date Required" to it. The 2D page
    // is a separate tab that can't read window.selectedCaseStub; localStorage is
    // shared same-origin. Keyed by caseId (= the 2D page's state.caseIntID).
    saveCaseDueDate(
      caseId,
      toDateInputValue(
        detail.expected_date ||
          detail.due_date ||
          computeDefaultDueDate(detail.creation_date)
      )
    );

    displayCaseDetails(detail);
    await fetchThumbnails(caseId);

    // NOTE: selecting a row only previews it — it must NOT reorder the list.
    // The last-opened bump now fires from the Start Case action (see the
    // ".start-case-button" handler), so a case only moves to the top once the
    // user actually enters it.
  } catch (err) {
    console.error("❌ Failed to get case detail:", err);
  }

  // Match the CSS breakpoint that switches the detail pane to its off-canvas
  // slide-in (case_list.css @media max-width: 860px). At in-between widths the
  // pane is hidden until .show-details is added; keep both numbers in sync.
  if (window.innerWidth <= 860) {
    document.querySelector(".cm-page")?.classList.add("show-details");
  }

}

// Optimistically update the local case's last_updated so the sort moves it
// immediately, without waiting for the server PUT to round-trip.
function bumpLocalLastUpdated(caseId) {
  const id = String(caseId);
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (const c of currentCases) {
    if (String(c.id ?? c.case_int_id) === id) {
      c.last_updated = nowSeconds;
      break;
    }
  }
  applyClientFilters();
}

// Fire a no-op PUT to /case/{id} re-sending the case's current fields. The
// payload doesn't change any meaningful data, but the backend bumps the row's
// last_updated as a side effect of the write — which is what the sort keys on.
async function fireLastOpenedBump(caseId, detail, user) {
  const auth = {
    machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
    uuid: user.uuid,
    caseIntID: caseId,
  };
  const caseBody = {
    case_id: detail?.case_id || "",
    upper_insertion_angle_x: Number(detail?.upper_insertion_angle_x) || 0,
    upper_insertion_angle_y: Number(detail?.upper_insertion_angle_y) || 0,
    upper_insertion_angle_z: Number(detail?.upper_insertion_angle_z) || 0,
    lower_insertion_angle_x: Number(detail?.lower_insertion_angle_x) || 0,
    lower_insertion_angle_y: Number(detail?.lower_insertion_angle_y) || 0,
    lower_insertion_angle_z: Number(detail?.lower_insertion_angle_z) || 0,
    process_upper: Number(detail?.process_upper) || 0,
    process_lower: Number(detail?.process_lower) || 0,
  };
  const res = await fetch(
    `https://live.api.smartrpdai.com/api/smartrpd/case/${caseId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([auth, caseBody]),
    }
  );
  logApi(res, 'PUT /case/:id');
  if (!res.ok) {
    throw new Error(`PUT /case/${caseId} status=${res.status}`);
  }
}

// Base of the live (deployed) site, including the GitHub-Pages repo sub-path.
// The 3D viewer link is meant to be shared / scanned from a phone, so a
// localhost URL would be unreachable off-machine. Only used as a substitute
// when developing locally (see below).
const LIVE_VIEWER_BASE = "https://faid123.github.io/.tmp-test-web";

// Build the 3D viewer URL for a case (ThreeDViewer.html reads ?id=<encryptedId>).
// Mirrors the Start Case navigation: encrypts the id and respects the
// GitHub-Pages base path so the link works when deployed.
//
// Pass `forShare: true` for links that leave this machine (copy-to-clipboard,
// QR): when developing on localhost those are rewritten to the live server so a
// phone can reach them. In-app navigation leaves it false so it stays local
// during dev. Deployed builds always use their own origin either way.
function buildThreeDViewerUrl(caseId, { forShare = false } = {}) {
  if (!caseId) return "";
  const encryptedId = lol(caseId);
  const host = window.location.hostname;
  const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "";
  if (forShare && isLocalhost) {
    return `${LIVE_VIEWER_BASE}/src/pages/ThreeDViewer.html?id=${encryptedId}`;
  }
  const isGitHubPages = host.includes("github.io");
  const basePath = isGitHubPages
    ? `/${window.location.pathname.split("/").filter(Boolean)[0] || ""}`
    : "";
  return `${window.location.origin}${basePath}/src/pages/ThreeDViewer.html?id=${encryptedId}`;
}

// Show a QR code of the 3D viewer URL in a modal. Generated fully client-side
// (qrcodejs, loaded from CDN in case_list.html), so the URL is never sent to a
// third party. Offers a PNG download of the code.
function showThreeDViewerQr(url) {
  if (typeof window.QRCode === "undefined") {
    toast.error("QR code library failed to load. Please try again.");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "cm-qr-modal";
  overlay.innerHTML =
    '<div class="cm-qr-backdrop"></div>' +
    '<div class="cm-qr-panel" role="dialog" aria-modal="true" aria-label="3D viewer QR code">' +
    '<div class="cm-qr-header">' +
    '<h2 class="cm-qr-title">Scan to open 3D viewer</h2>' +
    '<button type="button" class="cm-qr-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
    "</div>" +
    '<div class="cm-qr-code" id="cmQrCode"></div>' +
    '<p class="cm-qr-url"></p>' +
    '<button type="button" class="cm-btn cm-btn-primary cm-qr-download">Save</button>' +
    "</div>";
  document.body.appendChild(overlay);

  const codeEl = overlay.querySelector("#cmQrCode");
  // eslint-disable-next-line no-new
  new window.QRCode(codeEl, {
    text: url,
    width: 220,
    height: 220,
    correctLevel: window.QRCode.CorrectLevel.M,
  });
  overlay.querySelector(".cm-qr-url").textContent = url;

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  overlay.querySelector(".cm-qr-backdrop").addEventListener("click", close);
  overlay.querySelector(".cm-qr-close").addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);

  overlay.querySelector(".cm-qr-download").addEventListener("click", () => {
    const node = codeEl.querySelector("img") || codeEl.querySelector("canvas");
    let dataUrl = "";
    if (node?.tagName === "IMG") dataUrl = node.src;
    else if (node?.tagName === "CANVAS") dataUrl = node.toDataURL("image/png");
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `case_${window.selectedCaseId ?? "3d"}_qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

// 显示基本信息
function displayCaseDetails(data) {
  const caseIntId = data.id ?? data.case_int_id;

  const displayName = data.case_id
    ? caseIntId != null
      ? `UID ${caseIntId}-${data.case_id}`
      : data.case_id
    : "N/A";
  const nameHeader = document.getElementById("caseNameDisplay");
  if (nameHeader) nameHeader.textContent = "Case Details";

  // Case Details "CASE NAME" shows only the case name, not the "UID <id>-" prefix.
  const caseNameOnly = data.case_name || data.case_id || "N/A";
  document.getElementById("selected-case").textContent = caseNameOnly;
  const footerCaseName = document.getElementById("footerCaseName");
  if (footerCaseName) footerCaseName.textContent = data.case_name || displayName;
  const assignee = data.assigned_to || data.username || "N/A";
  document.getElementById("created-by").textContent = assignee;
  const avatar = document.getElementById("assigneeAvatar");
  if (avatar) avatar.textContent = initialsFor(assignee);

  renderSharedWith(data.co_owners);

  document.getElementById("date-created").textContent = formatDateTime(data.creation_date);
  document.getElementById("last-edited").textContent = formatDateTime(data.last_updated);

  renderCaseInstructions(caseIntId, data.comments);

  const statusSel = document.getElementById("status");
  if (statusSel) {
    statusSel.value = apiStatusToValue(data.new_status);
    applyStatusPillToSelect(data.new_status);
  }
  const statusText = document.getElementById("status-text");
  if (statusText) statusText.textContent = data.new_status || "-";

  const pill = document.getElementById("statusPill");
  if (pill) {
    pill.className = `cm-pill ${statusPillClass(data.new_status)}`;
    pill.textContent = statusDisplayText(data.new_status);
  }

  const webUrl = data.web_url || data.weburl || data.url || "-";
  const webUrlEl = document.getElementById("web-url");
  if (webUrlEl) webUrlEl.textContent = webUrl;

  // Admin detail actions: show "Delete the Case" for active cases and
  // "Retrieve the Case" for soft-deleted ones (mutually exclusive). The
  // authoritative deleted flag lives on the cached list row, not on the
  // /case/get payload merged into `data`, so look it up there.
  if (isCurrentUserAdmin()) {
    const caseObj =
      currentCases.find(
        (c) => String(c.id ?? c.case_int_id) === String(caseIntId)
      ) || data;
    const deleted = isCaseDeleted(caseObj);
    const retrieveBtn = document.getElementById("retrieveCaseBtn");
    const deleteBtn = document.getElementById("deleteCaseBtn");
    if (retrieveBtn) retrieveBtn.hidden = !deleted;
    if (deleteBtn) deleteBtn.hidden = deleted;
  }
}

function applyClientFilters() {
  // Two possible search boxes: the toolbar one (desktop; admin page only) and
  // the phone header's collapsible bar. Only one is ever visible, so take
  // whichever actually has a query.
  const searchInput = document.getElementById("searchCaseInput");
  const mobileSearch = document.getElementById("mobileSearchInput");
  const dateInput = document.getElementById("dateFilterInput");
  const todayOnly = document.getElementById("todayOnly");

  // Keep the stat-card counts in sync with the underlying list (they reflect
  // the whole non-deleted list, independent of the active stage/search).
  updateStatFilterCounts();
  // Grey the date/status controls while they hold no real selection.
  syncSearchPlaceholderState();

  const q = (mobileSearch?.value || searchInput?.value || "").trim().toLowerCase();
  const dateVal = dateInput?.value || "";
  const todayFlag = !!todayOnly?.checked;

  const today = new Date();
  const base = currentCases.filter((item) => {
    // Deleted cases are hidden by default; the "View" link under Total Deleted
    // Cases flips to showing ONLY deleted cases.
    if (deletedOnlyView) {
      if (!isCaseDeleted(item)) return false; // deleted-only view
    } else if (isCaseDeleted(item)) {
      return false; // default: hide removed cases
    }

    const caseName = (item.case_id || "").toLowerCase();
    const matchName = !q || caseName.includes(q);

    const createdDate = item.creation_date
      ? new Date(Number(item.creation_date) * (String(item.creation_date).length === 13 ? 1 : 1000))
      : null;

    const createdYmd = createdDate && !Number.isNaN(createdDate.getTime())
      ? `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}-${String(createdDate.getDate()).padStart(2, "0")}`
      : "";

    const matchDate = !dateVal || createdYmd === dateVal;
    const matchToday = !todayFlag || (
      createdDate &&
      createdDate.getFullYear() === today.getFullYear() &&
      createdDate.getMonth() === today.getMonth() &&
      createdDate.getDate() === today.getDate()
    );

    return matchName && matchDate && matchToday;
  });

  populateTable(base);
}

// Tally the non-deleted cases into the three stage buckets and paint the counts
// on the stat cards. Counts represent the whole list (they don't shrink as you
// filter), so the cards always read as a stable overview.
function updateStatFilterCounts() {
  const counts = { all: 0, preparation: 0, delivery: 0, completed: 0 };
  for (const item of currentCases) {
    if (isCaseDeleted(item)) continue;
    counts.all += 1;
    const group = caseStatusGroup(item);
    if (group && group in counts) counts[group] += 1;
  }
  const ids = {
    all: "statAllCount",
    preparation: "statPreparationCount",
    delivery: "statDeliveryCount",
    completed: "statCompletedCount",
  };
  for (const [group, id] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(counts[group]);
  }
}

// Reflect the active stage on the cards (pressed state) so it's obvious which
// filter is on and which click will clear it.
function syncStatFilterActiveState() {
  document.querySelectorAll("[data-status-group]").forEach((btn) => {
    const on = btn.getAttribute("data-status-group") === activeStatusFilter;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

// Click handler for a stat card: select its stage, or toggle back to "all" when
// the already-active card is clicked again. The "All Cases" card always clears
// the filter.
function applyStatFilter(group) {
  if (group === "all") {
    activeStatusFilter = "all";
  } else {
    activeStatusFilter = activeStatusFilter === group ? "all" : group;
  }
  syncStatFilterActiveState();
  applyClientFilters();
}

// Fade the date/status controls while they hold no real selection, so they read
// like the Name field's greyed placeholder. Native date inputs and <select>s
// have no ::placeholder, so we drive it with an .is-empty class instead: the
// date field is "empty" with no value, the status <select> while it's on "all".
function syncSearchPlaceholderState() {
  const dateInput = document.getElementById("dateFilterInput");
  if (dateInput) dateInput.classList.toggle("is-empty", !dateInput.value);
  const statusSel = document.getElementById("filter-status");
  if (statusSel) statusSel.classList.toggle("is-empty", statusSel.value === "all");
}

// Show a "N found" badge in the search bar while any search (name / date /
// status) is active, so the user sees how many cases matched — handy for the
// date and status searches where the match isn't obvious at a glance. Hidden
// when no search is active. `count` is the number of rows actually rendered.
function updateSearchResultCount(count) {
  const el = document.getElementById("searchResultCount");
  if (!el) return;
  const nameQ = (document.getElementById("searchCaseInput")?.value || "").trim();
  const mobileQ = (document.getElementById("mobileSearchInput")?.value || "").trim();
  const dateV = document.getElementById("dateFilterInput")?.value || "";
  const statusV = document.getElementById("filter-status")?.value || "all";
  const searchActive = !!(nameQ || mobileQ || dateV || statusV !== "all");
  el.hidden = !searchActive;
  // Compact corner badge: show just the match count (99+ when it overflows).
  el.textContent = searchActive ? (count > 99 ? "99+" : String(count)) : "";
  el.setAttribute(
    "title",
    `${count} ${count === 1 ? "case" : "cases"} found`
  );
}

// Show only the input that matches the chosen search mode (name / date /
// status) and clear the other two so a stale value can't keep filtering after
// the user switches modes.
function updateSearchModeUI() {
  const mode = document.getElementById("searchMode")?.value || "name";
  const nameInput = document.getElementById("searchCaseInput");
  const dateInput = document.getElementById("dateFilterInput");
  const statusSel = document.getElementById("filter-status");

  if (nameInput) {
    nameInput.hidden = mode !== "name";
    if (mode !== "name") nameInput.value = "";
  }
  if (dateInput) {
    dateInput.hidden = mode !== "date";
    if (mode !== "date") dateInput.value = "";
  }
  if (statusSel) {
    statusSel.hidden = mode !== "status";
    if (mode !== "status") statusSel.value = "all";
  }
  applyClientFilters();
}

// Edit a case's due date from the list via the shared themed calendar. Commits
// through updateCaseDueDate (writes the backend additionalcasedetails row the
// list, dashboard and 2D "Date Required" field all read), mirrors it to
// localStorage for the 2D page, then re-renders.
function openDueDateEditor(anchorTd, caseItem, caseId, currentDue) {
  if (!anchorTd) return;
  openThemedCalendar(anchorTd, {
    value: toDateInputValue(currentDue) || "",
    allowClear: true,
    onPick: async (iso) => {
      const ok = await updateCaseDueDate(caseId, iso || "");
      if (ok) {
        // additionalcasedetails.due_date is Unix *seconds*; mirror it so the
        // in-memory row (and redraw) show the new date immediately.
        let epochSec = null;
        if (iso) {
          const ms = Date.parse(`${iso}T00:00:00`);
          epochSec = Number.isNaN(ms) ? null : Math.floor(ms / 1000);
        }
        caseItem.expected_date = epochSec;
        caseItem.due_date = epochSec;
        saveCaseDueDate(caseId, iso || "");
        toast.success(iso ? "Due date updated." : "Due date cleared.");
      } else {
        toast.error("Failed to update due date. Please try again.");
      }
      applyClientFilters();
    },
  });
}

// Swap a row's STATUS pill for a native <select> so the status can be changed
// without selecting the case first. Built on demand, like the due-date calendar:
// a permanent select per row would put twelve options in the DOM for every case
// on the page.
//
// The options are cloned from the detail pane's #status rather than written out
// again, so the two editors can never drift apart.
function openStatusEditor(anchorTd, caseItem, caseId) {
  if (!anchorTd || anchorTd.querySelector(".cm-status-inline")) return;
  const template = document.getElementById("status");
  if (!template) return;

  const pill = anchorTd.querySelector(".cm-pill");
  const select = document.createElement("select");
  select.className = "cm-status-inline";
  select.setAttribute("aria-label", "Change status");
  select.innerHTML = template.innerHTML;
  select.value = apiStatusToValue(caseItem.new_status);

  // Leave the row's own click handler alone — selecting a case out from under
  // the open editor would repaint the table and drop it.
  select.addEventListener("click", (e) => e.stopPropagation());

  let done = false;
  // `refocus` only for a deliberate cancel (Escape): on blur the user has
  // already clicked or tabbed elsewhere, and pulling focus back would fight them.
  const close = ({ refocus = false } = {}) => {
    if (done) return;
    done = true;
    select.remove();
    if (pill) {
      pill.hidden = false;
      if (refocus) pill.focus();
    }
  };

  select.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close({ refocus: true });
    }
  });
  // Dismissing without choosing (click away, Tab out) restores the pill.
  select.addEventListener("blur", () => close());

  select.addEventListener("change", async () => {
    const apiValue = valueToApiStatus(select.value);
    const previous = caseItem.new_status;
    done = true;                 // the repaint below removes the row entirely
    select.disabled = true;

    try {
      // postNewStatus re-reads the stored record and merges, so this is safe on
      // a row lazy enrichment hasn't reached yet.
      await postNewStatus(caseItem, apiValue);
      caseItem.new_status = apiValue;
      syncDetailPaneIfSelected(caseItem);
      toast.success("Status updated.");
    } catch (err) {
      console.error("Status update failed:", err);
      caseItem.new_status = previous;
      toast.error("Failed to update status.");
    }
    // Repaint from the model: the pill, the stage filter counts and this row's
    // place in them all follow the status.
    applyClientFilters();
  });

  if (pill) pill.hidden = true;
  anchorTd.appendChild(select);
  select.focus();
}

// Compute a default due-date timestamp (ms) that's 14 days after the
// creation timestamp. Returns null when creation is missing/invalid.
function computeDefaultDueDate(creationTs) {
  if (creationTs == null || creationTs === "" || creationTs === 0 || creationTs === "0") return null;
  const n = Number(creationTs);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = String(n).length >= 13 ? n : n * 1000;
  return ms + 14 * 24 * 60 * 60 * 1000;
}

// Date-only formatter (no hh:mm:ss). Same parsing/guards as formatDateTime,
// used by the Due Date column where the time of day is noise.
function formatDateOnly(ts) {
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
  return new Date(ms).toLocaleDateString();
}

// Truncate a string to at most `max` whole words, appending an ellipsis when
// it's clipped. Used to keep the Case Name column compact.
function truncateWords(str, max) {
  const words = String(str).trim().split(/\s+/);
  if (words.length <= max) return String(str);
  return words.slice(0, max).join(" ") + "…";
}

// 日期格式化
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
  // Anything before 2000-01-01 is almost certainly an unset/epoch value
  // (e.g. API returning "0" for missing due_date).
  if (ms < 946684800000) return "N/A";
  return new Date(ms).toLocaleString();
}

// Normalize a timestamp (Unix seconds/ms, or a date string) to the local
// calendar-day midnight in ms, mirroring formatDateTime. Returns null for
// missing / invalid / pre-2000 (unset) values.
function toDayMidnight(ts) {
  if (ts == null || ts === "" || ts === 0 || ts === "0") return null;
  const n = Number(ts);
  let ms;
  if (Number.isFinite(n)) {
    if (n <= 0) return null;
    ms = String(n).length >= 13 ? n : n * 1000;
  } else {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    ms = d.getTime();
  }
  if (ms < 946684800000) return null;
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Urgency classifier shared by the desktop left bar and the mobile DUE-date
// text: buckets a case by how many whole calendar days remain until its due
// date (gap = due - today, so "due today" is 0 regardless of time). Buckets:
// gap < 0 = is-overdue, 0 = is-due, 1-5 = is-soon, 6-14 = is-ok, > 14 = none.
// Returns { cls, label } or null (no due date / due > 14 days out). The actual
// colors per cls are defined in CSS — the bar and the mobile text differ only
// there (e.g. is-overdue: black vs grey).
function dueDateIndicator(dueTs) {
  const dueMid = toDayMidnight(dueTs);
  if (dueMid == null) return null;

  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86400000;
  const gap = Math.round((dueMid - todayMid) / DAY); // days remaining until due

  const days = (d) => `${d} day${Math.abs(d) === 1 ? "" : "s"}`;
  if (gap < 0) return { cls: "is-overdue", label: `Overdue by ${days(-gap)}` };
  if (gap === 0) return { cls: "is-due", label: "Due today" };
  if (gap <= 5) return { cls: "is-soon", label: `Due in ${days(gap)}` };
  if (gap <= 14) return { cls: "is-ok", label: `Due in ${days(gap)}` };
  return null; // due more than 14 days out — no indicator
}

// Map a case + sort column to a comparable value. Numeric columns (dates,
// recency) return a number for numeric ordering; text columns return a
// lowercased string compared via localeCompare. The caller applies the
// asc/desc direction. Keep these keyed off the same fields the card renders.
function sortValue(caseItem, column) {
  switch (column) {
    case "name":
      return (caseItem.case_id || "").toLowerCase();
    case "status":
      return statusDisplayText(caseItem.new_status).toLowerCase();
    case "owner":
      return (caseItem.assigned_to || caseItem.username || "").toLowerCase();
    case "created":
      return Number(caseItem.creation_date) || 0;
    case "due": {
      const due =
        caseItem.expected_date ||
        caseItem.due_date ||
        computeDefaultDueDate(caseItem.creation_date);
      return Number(due) || 0;
    }
    case "recent":
    default:
      return Number(caseItem.last_updated) || 0;
  }
}

// 缩略图切换
function updateThumbnail() {
  const image = document.getElementById("caseImage");
  const counter = document.getElementById("imageCounter");
  const area = image?.closest(".cm-image-area");

  if (!image || !counter) return;

  if (currentThumbnails.length === 0) {
    image.removeAttribute("src");
    image.alt = "No images available";
    counter.textContent = "IMAGE 0 OF 0";
    area?.classList.remove("has-image");
    return;
  }

  image.src = "data:image/png;base64," + currentThumbnails[currentImageIndex];
  image.alt = `Case thumbnail ${currentImageIndex + 1}`;
  counter.textContent = `IMAGE ${currentImageIndex + 1} OF ${currentThumbnails.length}`;
  area?.classList.add("has-image");
}

// Move the inline carousel by delta (wraps around) and re-render.
function stepThumbnail(delta) {
  if (currentThumbnails.length === 0) return;
  currentImageIndex =
    (currentImageIndex + delta + currentThumbnails.length) % currentThumbnails.length;
  updateThumbnail();
}

// Attach left/right swipe navigation to an element for mobile photo browsing.
// onSwipe(1) for a left swipe (next), onSwipe(-1) for a right swipe (previous).
// Vertical drags and taps are ignored so scrolling and click-to-zoom still work.
function attachSwipeNav(el, onSwipe) {
  if (!el || el.dataset.swipeBound) return;
  el.dataset.swipeBound = "1";
  const THRESHOLD = 40; // min horizontal travel (px) to count as a swipe
  let startX = 0;
  let startY = 0;
  let tracking = false;
  el.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    },
    { passive: true }
  );
  el.addEventListener(
    "touchend",
    (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Require a mostly-horizontal gesture past the threshold.
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
      onSwipe(dx < 0 ? 1 : -1);
    },
    { passive: true }
  );
}

// Lightbox preview for the case thumbnail carousel: clicking the thumbnail opens
// the current image enlarged over a dark overlay, with prev/next + a counter that
// stay in sync with the small carousel. Close via the × button, a click on the
// backdrop, or Escape. The overlay is built once and reused.
function openThumbnailPreview() {
  if (currentThumbnails.length === 0) return;
  let overlay = document.getElementById("thumbPreviewOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "thumbPreviewOverlay";
    overlay.className = "thumb-preview-overlay hidden";
    overlay.innerHTML = `
      <button type="button" class="thumb-preview-close" aria-label="Close preview">&times;</button>
      <button type="button" class="thumb-preview-nav thumb-preview-prev" aria-label="Previous image"><i class="fa fa-chevron-left"></i></button>
      <img class="thumb-preview-img" alt="Case thumbnail preview" />
      <button type="button" class="thumb-preview-nav thumb-preview-next" aria-label="Next image"><i class="fa fa-chevron-right"></i></button>
      <span class="thumb-preview-counter"></span>`;
    document.body.appendChild(overlay);

    const close = () => overlay.classList.add("hidden");
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector(".thumb-preview-close").addEventListener("click", close);
    overlay.querySelector(".thumb-preview-prev").addEventListener("click", (e) => {
      e.stopPropagation();
      stepThumbnailPreview(-1);
    });
    overlay.querySelector(".thumb-preview-next").addEventListener("click", (e) => {
      e.stopPropagation();
      stepThumbnailPreview(1);
    });
    document.addEventListener("keydown", (e) => {
      if (overlay.classList.contains("hidden")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") stepThumbnailPreview(-1);
      else if (e.key === "ArrowRight") stepThumbnailPreview(1);
    });

    // Swipe left/right on the enlarged image to move between photos (mobile).
    attachSwipeNav(overlay.querySelector(".thumb-preview-img"), stepThumbnailPreview);
  }
  renderThumbnailPreview();
  overlay.classList.remove("hidden");
}

function stepThumbnailPreview(delta) {
  if (currentThumbnails.length === 0) return;
  currentImageIndex =
    (currentImageIndex + delta + currentThumbnails.length) % currentThumbnails.length;
  updateThumbnail(); // keep the small carousel in sync with the lightbox
  renderThumbnailPreview();
}

function renderThumbnailPreview() {
  const overlay = document.getElementById("thumbPreviewOverlay");
  if (!overlay || currentThumbnails.length === 0) return;
  const img = overlay.querySelector(".thumb-preview-img");
  const counter = overlay.querySelector(".thumb-preview-counter");
  const multi = currentThumbnails.length > 1;
  img.src = "data:image/png;base64," + currentThumbnails[currentImageIndex];
  counter.textContent = `IMAGE ${currentImageIndex + 1} OF ${currentThumbnails.length}`;
  overlay.querySelectorAll(".thumb-preview-nav").forEach((b) => {
    b.style.display = multi ? "" : "none";
  });
}

// 判断2D图像逻辑（白底 + 宽高比）
function classifyThumbnails(images) {
  const is2D = (base64) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.width;
        const h = img.height;

        // ✅ 如果 height ≥ width 或 width/height 比例 < 1.3，可能是 2D 图
        const is2D = h >= w || w / h < 1.3;
        resolve({ base64, is2D });
      };
      img.onerror = () => resolve({ base64, is2D: false });
      img.src = "data:image/png;base64," + base64;
    });
  };

  return Promise.all(images.map((img) => is2D(img))).then((results) => {
    const twoD = results.filter((r) => r.is2D).map((r) => r.base64);
    const threeD = results.filter((r) => !r.is2D).map((r) => r.base64);
    return [...twoD, ...threeD];
  });
}

// Pull the storage slot off a /thumbnails/get row (0 = composite 2D, 1 = upper
// jaw, 2 = lower jaw). Tolerates a couple of field-name variants; returns null
// when the row carries no usable slot.
function thumbnailSlot(row) {
  const v = row?.slot ?? row?.slot_index ?? row?.slot_id;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Order case thumbnails so the carousel is always 2D -> upper jaw -> lower jaw,
// matching their stored slots, no matter what order the API returns them in.
// Older cases whose rows predate slot tagging fall back to the legacy
// aspect-ratio grouping (2D-shaped first, then 3D).
async function orderThumbnailsBySlot(rows) {
  const withData = rows.filter((r) => r && r.data);
  const haveSlots = withData.some((r) => thumbnailSlot(r) != null);
  if (!haveSlots) {
    return classifyThumbnails(withData.map((r) => r.data));
  }
  return withData
    .slice()
    .sort((a, b) => (thumbnailSlot(a) ?? 999) - (thumbnailSlot(b) ?? 999))
    .map((r) => r.data);
}

// 获取缩略图
async function fetchThumbnails(caseId) {
  const loggedInUser = getLoggedInUser();
  if (!loggedInUser) return;

  // Identify the case NUMERICALLY (case_int_id), never by the case-name
  // string: the backend's non-admin lookup resolves from element-0's
  // caseIntID anyway, but its ADMIN lookup parses the payload identifier as
  // a numeric caseIntID — a string name 404s every case for admin accounts
  // ("No thumbnails found for case with caseIntID <name>"). case_int_id is
  // live-verified to return rows for both roles (2026-07-10).
  const requestBody = JSON.stringify([
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: loggedInUser.uuid,
      caseIntID: caseId,
    },
    {
      case_int_id: caseId,
    },
  ]);

  try {
    // Go through resilientFetch so a momentary 403/5xx — e.g. this user-initiated
    // request racing the lazy row-enrichment traffic against the backend's burst
    // throttle — is retried with backoff instead of failing to a blank pane. A
    // fresh per-call breaker means pure retry: it can't be tripped/held open by
    // the shared enrichment breaker, and one click is at most a few requests.
    const res = await resilientFetch(
      "https://live.api.smartrpdai.com/api/smartrpd/thumbnails/get",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      },
      makeBreaker(BREAKER_FAILURE_THRESHOLD)
    );
    if (!res || !res.ok) {
      console.warn("⚠️ No images found or request failed:", res ? res.status : "no response");
      currentThumbnails = [];
      currentImageIndex = 0;
      updateThumbnail();
      return;
    }
    logApi(res, 'POST /thumbnails/get');

    const data = await res.json();
    currentThumbnails = await orderThumbnailsBySlot(Array.isArray(data) ? data : []);
    currentImageIndex = 0;
    updateThumbnail();
  } catch (err) {
    console.error("❌ Failed to fetch thumbnails:", err);
    currentThumbnails = [];
    currentImageIndex = 0;
    updateThumbnail();
  }
}

// ---------------------------------------------------------------------------
// Admin case-list extras (stat cards + Transfer Ownership / Retrieve actions).
// The admin case_list follows the admin prototype: a row of overview stat cards
// above the list, and admin-only detail actions replacing Start Case / 3D link
// (those are hidden via body.is-admin — see case_list.css). The server stays
// authoritative: every admin endpoint re-checks is_admin from the caller uuid.
// ---------------------------------------------------------------------------

function isCurrentUserAdmin() {
  return Number(getLoggedInUser()?.isAdmin) === 1;
}

// Cases the admin receives include soft-deleted ones; the flag name isn't
// guaranteed, so accept the common spellings and treat 1/true as deleted.
function isCaseDeleted(caseItem) {
  const v = caseItem?.deleted ?? caseItem?.is_deleted ?? caseItem?.isDeleted;
  return v === 1 || v === true || v === "1";
}

// Which month each "…(month)" card shows: 0 = current month, -1 = last month, …
// The Deleted and New cards step independently. Never positive (no future).
let deletedMonthOffset = 0;
let newMonthOffset = 0;

// When true, the list is filtered to deleted cases only (the "View" link under
// the Total Deleted Cases card).
let deletedOnlyView = false;

// [start, end) ms bounds for the month at `offset` relative to the current one.
function monthRangeMs(offset) {
  const n = new Date();
  return {
    start: new Date(n.getFullYear(), n.getMonth() + offset, 1).getTime(),
    end: new Date(n.getFullYear(), n.getMonth() + offset + 1, 1).getTime(),
  };
}

// Recompute the overview cards from the full loaded list (not the filtered
// view). Completed/Ongoing depend on new_status, which fills in as rows enrich,
// so this is called again on each enrichment via scheduleAdminStats().
function renderAdminStats(cases) {
  const bar = document.getElementById("adminStatsBar");
  if (!bar || bar.hidden) return; // non-admin / bar not shown
  const list = Array.isArray(cases) ? cases : [];
  const delRange = monthRangeMs(deletedMonthOffset); // Deleted card's month
  const newRange = monthRangeMs(newMonthOffset);     // New card's month

  let total = 0, completed = 0, deletedTotal = 0, deletedMonth = 0, newMonth = 0;
  for (const c of list) {
    const createdMs = toDayMidnight(c.creation_date);
    const inDelMonth = createdMs != null && createdMs >= delRange.start && createdMs < delRange.end;
    const inNewMonth = createdMs != null && createdMs >= newRange.start && createdMs < newRange.end;

    if (isCaseDeleted(c)) {
      deletedTotal++; // all-time deleted count
      // No deletion timestamp is exposed, so approximate "deleted in month"
      // by cases created in that month that are now deleted.
      if (inDelMonth) deletedMonth++;
      continue; // deleted cases are excluded from the active totals
    }

    total++;
    const status = apiStatusToValue(c.new_status);
    // Completed → Completed; anything else except N/A counts as active.
    if (status === "completed") completed++;
    if (inNewMonth) newMonth++;
  }

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };
  set("statTotal", total);
  set("statCompleted", completed);
  set("statDeletedTotal", deletedTotal);
  set("statDeleted", deletedMonth);
  set("statNew", newMonth);

  // Name each card's shown month, e.g. "July" (add the year when not this year).
  const now = new Date();
  const monthLabelFor = (offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const name = d.toLocaleString(undefined, { month: "long" });
    return d.getFullYear() === now.getFullYear() ? name : `${name} ${d.getFullYear()}`;
  };
  set("statDeletedLabel", `Deleted Cases (${monthLabelFor(deletedMonthOffset)})`);
  set("statNewLabel", `New Cases (${monthLabelFor(newMonthOffset)})`);

  // Can't step into the future: disable each card's "next" arrow at offset 0.
  document
    .querySelectorAll('[data-month-target="deleted"][data-month-delta="1"]')
    .forEach((b) => (b.disabled = deletedMonthOffset >= 0));
  document
    .querySelectorAll('[data-month-target="new"][data-month-delta="1"]')
    .forEach((b) => (b.disabled = newMonthOffset >= 0));
}

// Enrichment updates rows one at a time; debounce so we recompute once per
// burst instead of O(N) times.
let _adminStatsTimer = null;
function scheduleAdminStats() {
  if (!isCurrentUserAdmin()) return;
  clearTimeout(_adminStatsTimer);
  _adminStatsTimer = setTimeout(() => renderAdminStats(currentCases), 150);
}

// Resolve a username → uuid via user/uuid/get. Returns the uuid string or null.
async function resolveUuidByUsername(username) {
  const me = getLoggedInUser();
  const res = await fetch(`${DL_API}/user/uuid/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([
      { machine_id: DL_MACHINE_ID, uuid: me?.uuid },
      { username },
    ]),
  });
  logApi(res, "POST /user/uuid/get");
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  // Model selects `uuid`; response may be a row array or a bare object.
  if (Array.isArray(data)) return data[0]?.uuid ?? null;
  return data?.uuid ?? null;
}

// Rebuild the new-owner datalist for the selected case: only the case's
// shared co-owners are suggested (the usual transfer target). Any other
// username can still be typed — resolution happens server-side either way.
// Skips the current owner (a no-op transfer) and dedupes case-insensitively.
function populateTransferOptions(caseObj) {
  const dl = document.getElementById("transferOwnerOptions");
  if (!dl) return;
  const seen = new Set(
    [(caseObj?.assigned_to || caseObj?.username || "").toLowerCase()]
  );
  dl.textContent = "";
  for (const co of caseObj?.co_owners || []) {
    const name = String(co ?? "").trim();
    const key = name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const opt = document.createElement("option");
    opt.value = name;
    opt.label = "Shared co-owner"; // shown next to the value in most browsers
    dl.appendChild(opt);
  }
}

// Transfer ownership: resolve the entered username, then PUT /role/owner
// (changeOwner is admin-only server-side).
async function submitOwnershipTransfer() {
  const errEl = document.getElementById("transferOwnerError");
  const input = document.getElementById("transferOwnerInput");
  const btn = document.getElementById("confirmTransferBtn");
  if (errEl) errEl.textContent = "";

  const caseId = window.selectedCaseId;
  if (!caseId) {
    if (errEl) errEl.textContent = "Select a case first.";
    return;
  }
  const username = (input?.value || "").trim();
  if (!username) {
    if (errEl) errEl.textContent = "Enter the new owner's username.";
    return;
  }

  const caseObj = currentCases.find(
    (c) => String(c.id ?? c.case_int_id) === String(caseId)
  );
  // No-op guard: transferring to the user who already owns the case.
  const currentOwner = caseObj?.assigned_to || caseObj?.username || "";
  if (currentOwner && currentOwner.toLowerCase() === username.toLowerCase()) {
    if (errEl) errEl.textContent = `"${currentOwner}" already owns this case.`;
    return;
  }

  if (btn) btn.disabled = true;
  try {
    const newUuid = await resolveUuidByUsername(username);
    if (!newUuid) {
      if (errEl) errEl.textContent = `No user found with username "${username}".`;
      return;
    }
    const me = getLoggedInUser();
    const res = await fetch(`${DL_API}/role/owner`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: DL_MACHINE_ID, uuid: me?.uuid },
        { uuid: newUuid, case_int_id: Number(caseId) },
      ]),
    });
    logApi(res, "PUT /role/owner");
    if (!res.ok) {
      // Surface the server's own message (changeOwner answers 404 when the
      // case/owner pairing isn't found, 500 on SQL errors) instead of a
      // generic failure — the admin needs to know which it was.
      const body = await res.json().catch(() => null);
      const detail =
        (body?.serverErrorMessage && body.serverErrorMessage !== "..." && body.serverErrorMessage) ||
        body?.sqlMessage || `HTTP ${res.status}`;
      throw new Error(detail);
    }

    // Reflect the new owner locally so the row *and* the open detail pane
    // update without a reload.
    if (caseObj) {
      caseObj.assigned_to = username;
      patchRowInPlace(caseObj);
      syncDetailPaneIfSelected(caseObj);
    }
    closeTransferModal();
    toast.success(`Ownership transferred to "${username}".`);
  } catch (err) {
    console.error("Transfer ownership failed:", err);
    if (errEl) errEl.textContent = `Transfer failed — ${err.message || "please try again."}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function openTransferModal() {
  if (!window.selectedCaseId) {
    toast.warning("Select a case first.");
    return;
  }
  const modal = document.getElementById("transferOwnerModal");
  const input = document.getElementById("transferOwnerInput");
  const errEl = document.getElementById("transferOwnerError");
  if (errEl) errEl.textContent = "";
  if (input) input.value = "";

  // Name the case being transferred + fill the "current owner" side of the
  // owner → owner flow so the admin can confirm they picked the right row.
  const caseObj = currentCases.find(
    (c) => String(c.id ?? c.case_int_id) === String(window.selectedCaseId)
  );
  const lineEl = document.getElementById("transferOwnerCaseLine");
  if (lineEl) {
    lineEl.textContent = caseObj?.case_id || `Case ${window.selectedCaseId}`;
    lineEl.title = lineEl.textContent;
  }
  const owner = caseObj?.assigned_to || caseObj?.username || "";
  const ownerNameEl = document.getElementById("transferOwnerCurrentName");
  const ownerAvatarEl = document.getElementById("transferOwnerCurrentAvatar");
  if (ownerNameEl) {
    ownerNameEl.textContent = owner || "Unknown";
    ownerNameEl.title = owner || "";
  }
  if (ownerAvatarEl) ownerAvatarEl.textContent = (owner || "?").charAt(0);

  // Suggestions: the case's shared co-owners (already on the enriched row).
  populateTransferOptions(caseObj);

  // .modal is display:none until .show lands (createCase.css) — removing
  // .hidden alone leaves it invisible, which read as "nothing happens".
  modal?.classList.remove("hidden");
  modal?.classList.add("show");
  input?.focus();
}

function closeTransferModal() {
  const modal = document.getElementById("transferOwnerModal");
  modal?.classList.remove("show");
  modal?.classList.add("hidden");
}

// Retrieve (restore) the selected soft-deleted case via POST /case/undelete/:id.
async function retrieveSelectedCase() {
  const caseId = window.selectedCaseId;
  if (!caseId) {
    toast.warning("Select a case first.");
    return;
  }
  const caseObj = currentCases.find(
    (c) => String(c.id ?? c.case_int_id) === String(caseId)
  );
  if (caseObj && !isCaseDeleted(caseObj)) {
    toast.info("This case is not deleted.");
    return;
  }

  const confirmed = await confirmModal({
    title: "Retrieve this case?",
    message: "The case will be restored and visible to its members again.",
    confirmText: "Retrieve",
    cancelText: "Cancel",
    variant: "info",
  });
  if (!confirmed) return;

  try {
    const me = getLoggedInUser();
    const res = await fetch(`${DL_API}/case/undelete/${Number(caseId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ machine_id: DL_MACHINE_ID, uuid: me?.uuid }]),
    });
    logApi(res, "POST /case/undelete/:id");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (caseObj) {
      caseObj.deleted = 0;
      const row = document.querySelector(
        `#caseTableBody tr[data-case-id="${CSS.escape(String(caseId))}"]`
      );
      row?.classList.remove("cm-row-deleted");
    }
    // Flip the detail CTA from Retrieve → Delete.
    const retrieveBtn = document.getElementById("retrieveCaseBtn");
    const deleteBtn = document.getElementById("deleteCaseBtn");
    if (retrieveBtn) retrieveBtn.hidden = true;
    if (deleteBtn) deleteBtn.hidden = false;
    scheduleAdminStats();
    applyClientFilters();
    toast.success("Case retrieved.");
  } catch (err) {
    console.error("Retrieve case failed:", err);
    toast.error("Failed to retrieve case.");
  }
}

// Soft-delete the selected case from the admin detail panel. Unlike the user
// row action (deleteCaseById, which drops the case from the list), admins keep
// the case in view — flagged deleted (struck-through, retrievable) — so the
// Delete ⇄ Retrieve toggle stays coherent without a refetch.
async function deleteSelectedCase() {
  const caseId = window.selectedCaseId;
  if (!caseId) {
    toast.warning("Select a case first.");
    return;
  }
  const caseObj = currentCases.find(
    (c) => String(c.id ?? c.case_int_id) === String(caseId)
  );
  if (caseObj && isCaseDeleted(caseObj)) {
    toast.info("This case is already deleted.");
    return;
  }

  const confirmed = await confirmModal({
    title: "Delete this case?",
    message: "The case will be removed from its members. You can retrieve it later.",
    confirmText: "Delete",
    cancelText: "Cancel",
    variant: "danger",
  });
  if (!confirmed) return;

  try {
    const me = getLoggedInUser();
    const res = await fetch(`${DL_API}/case/delete/${Number(caseId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: DL_MACHINE_ID, uuid: me?.uuid, caseIntID: Number(caseId) },
        { case_int_id: Number(caseId) },
      ]),
    });
    logApi(res, "POST /case/delete/:id");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (caseObj) {
      caseObj.deleted = 1;
      const row = document.querySelector(
        `#caseTableBody tr[data-case-id="${CSS.escape(String(caseId))}"]`
      );
      row?.classList.add("cm-row-deleted");
    }
    // Flip the detail CTA from Delete → Retrieve.
    const retrieveBtn = document.getElementById("retrieveCaseBtn");
    const deleteBtn = document.getElementById("deleteCaseBtn");
    if (retrieveBtn) retrieveBtn.hidden = false;
    if (deleteBtn) deleteBtn.hidden = true;
    scheduleAdminStats();
    applyClientFilters();
    toast.success("Case deleted.");
  } catch (err) {
    console.error("Delete case failed:", err);
    toast.error("Failed to delete case.");
  }
}

// Download the selected case's files (STL/OFF, 2D JPEG, report .docx) as a zip —
// the same bundle the user case-list row's download action produces.
function downloadSelectedCaseFiles() {
  const caseId = window.selectedCaseId;
  if (!caseId) {
    toast.warning("Select a case first.");
    return;
  }
  const caseObj = currentCases.find(
    (c) => String(c.id ?? c.case_int_id) === String(caseId)
  );
  const caseLabel = caseObj?.case_id || window.selectedCaseStub?.case_id;
  const apiStatus = caseObj?.new_status ?? window.selectedCaseStub?.new_status ?? null;
  return downloadCaseFiles(caseId, caseLabel, apiStatus);
}

// Wire the admin-only UI once, from the init handler.
function setupAdminCaseList() {
  if (!isCurrentUserAdmin()) return;

  document.body.classList.add("is-admin");

  // Populate the branded header's user chip from the logged-in account.
  const _me = getLoggedInUser();
  const _uname = _me?.username || "User";
  const nameEl = document.getElementById("adminUserName");
  const avatarEl = document.getElementById("adminUserAvatar");
  if (nameEl) nameEl.textContent = _uname;
  if (avatarEl) avatarEl.textContent = _uname.charAt(0);

  // User chip → dropdown (holds Logout). The logout item keeps class .logout so
  // the existing logout handler wires it.
  const chip = document.getElementById("adminUserChip");
  const chipMenu = document.getElementById("adminUserDropdown");
  if (chip && chipMenu) {
    const toggle = (e) => {
      e.stopPropagation();
      const open = chipMenu.classList.toggle("hidden") === false;
      chip.setAttribute("aria-expanded", String(open));
    };
    chip.addEventListener("click", toggle);
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") toggle(e);
    });
    document.addEventListener("click", (e) => {
      if (chipMenu.classList.contains("hidden")) return;
      if (!chipMenu.contains(e.target) && !chip.contains(e.target)) {
        chipMenu.classList.add("hidden");
        chip.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Reveal the overview cards and the admin detail actions.
  const statsBar = document.getElementById("adminStatsBar");
  if (statsBar) statsBar.hidden = false;
  document.querySelectorAll(".cm-admin-cta").forEach((el) => (el.hidden = false));

  document.getElementById("transferOwnershipBtn")?.addEventListener("click", openTransferModal);
  document.getElementById("retrieveCaseBtn")?.addEventListener("click", retrieveSelectedCase);
  document.getElementById("deleteCaseBtn")?.addEventListener("click", deleteSelectedCase);
  document.getElementById("downloadFilesBtn")?.addEventListener("click", downloadSelectedCaseFiles);

  // Month steppers: each card (Deleted / New) has its own offset so they move
  // independently. Never step into the future.
  document.querySelectorAll("[data-month-delta]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.dataset.monthDelta);
      const target = btn.dataset.monthTarget;
      if (target === "deleted") {
        const next = deletedMonthOffset + delta;
        if (next > 0) return;
        deletedMonthOffset = next;
      } else if (target === "new") {
        const next = newMonthOffset + delta;
        if (next > 0) return;
        newMonthOffset = next;
      }
      renderAdminStats(currentCases);
    });
  });

  // "View" link under Total Deleted Cases: toggle a deleted-only list filter.
  const viewDeletedLink = document.getElementById("viewDeletedLink");
  viewDeletedLink?.addEventListener("click", (e) => {
    e.preventDefault();
    deletedOnlyView = !deletedOnlyView;
    // The link carries an icon + a text span, so update those in place instead
    // of overwriting textContent (which would drop the icon).
    const label = viewDeletedLink.querySelector(".cm-stat-link-text");
    const text = deletedOnlyView ? "Back to active cases" : "View";
    if (label) label.textContent = text;
    else viewDeletedLink.textContent = text;
    const icon = viewDeletedLink.querySelector("i");
    if (icon) icon.className = deletedOnlyView ? "fa fa-arrow-left" : "fa fa-eye";
    viewDeletedLink.classList.toggle("is-active", deletedOnlyView);
    applyClientFilters();
  });

  document.getElementById("closeTransferModal")?.addEventListener("click", closeTransferModal);
  document.getElementById("cancelTransferBtn")?.addEventListener("click", closeTransferModal);
  document.getElementById("confirmTransferBtn")?.addEventListener("click", submitOwnershipTransfer);
  document.getElementById("transferOwnerModal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeTransferModal();
  });
  document.getElementById("transferOwnerInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); submitOwnershipTransfer(); }
  });

  renderAdminStats(currentCases);
}

// 初始化页面
document.addEventListener("DOMContentLoaded", async () => {
  // Role-based routing: admins get the purpose-built admin_case_list.html
  // (overview stats + Transfer Ownership / Retrieve Case); everyone else gets
  // the normal case_list.html (Start Case + 3D viewer + Actions). Redirect when
  // the page doesn't match the role so neither audience sees the other's UI.
  {
    const me = getLoggedInUser();
    if (me) {
      const onAdminPage = document.body.dataset.adminPage === "1";
      const admin = Number(me.isAdmin) === 1;
      // Paths are relative to the CURRENT page. case_list.html lives in
      // src/pages/, admin_case_list.html in src/pages/admin/ — so each branch
      // (which only fires from its own page) targets the other across that
      // one-directory gap.
      if (admin && !onAdminPage) { window.location.replace("admin/admin_case_list.html"); return; }
      if (!admin && onAdminPage) { window.location.replace("../case_list.html"); return; }
    }
  }

  // Instant paint FIRST — before any other setup (connectivity / sidebar /
  // thumbnail, any of which could be slow or throw) and before the network call —
  // so the table shows the last-known list immediately instead of staying blank
  // while /case/user/findall/get is in flight. That request can lag when the API
  // host is busy (e.g. right after the chat's heavy notes query); the fetch below
  // replaces this paint as soon as it lands.
  let cachedForPaint = null;
  try {
    cachedForPaint = loadCachedCases();
    if (cachedForPaint && cachedForPaint.length) {
      currentCases = cachedForPaint;
      populateTable(currentCases);
      applyClientFilters();
    }
  } catch (err) {
    console.warn("[caseList] instant cached paint failed", err);
  }

  const footerUserName = document.getElementById("footerUserName");
  if (footerUserName) {
    const u = getLoggedInUser();
    footerUserName.textContent = u?.username || "—";
  }

  // Admins get the prototype layout: overview stat cards + Transfer Ownership /
  // Retrieve actions, with Start Case / 3D link / Actions column hidden via the
  // `is-admin` body class (see case_list.css). setupAdminCaseList() is a no-op
  // for non-admins.
  setupAdminCaseList();
  // index.html is at the web root; admin_case_list.html lives one level deeper
  // (src/pages/admin/) than the normal case_list.html (src/pages/).
  const _inAdminDir = /\/admin\//.test(window.location.pathname);
  setupAppSidebar({ indexHref: _inAdminDir ? "../../../index.html" : "../../index.html" });

  updateThumbnail();
  const cases = await fetchCases();

  if (cases) {
    // Stale-while-revalidate: the fresh base list has no details/co-owners
    // yet (those now load lazily as rows scroll into view), so carry over the
    // enrichment cached from the previous session. Rows show the last-known
    // values immediately and still re-fetch when they become visible.
    if (cachedForPaint?.length) {
      const cachedByKey = new Map(
        cachedForPaint.map((c) => [String(c.id ?? c.case_int_id), c])
      );
      for (const c of cases) {
        const prev = cachedByKey.get(String(c.id ?? c.case_int_id));
        if (!prev) continue;
        for (const k of ["expected_date", "new_status", "assigned_to", "comments", "co_owners"]) {
          if (c[k] === undefined && prev[k] !== undefined) c[k] = prev[k];
        }
      }
    }
    // Persist for the next load's instant paint.
    saveCachedCases(cases);
    // Paint immediately — enrichment never gates the first render. Each row
    // registers with the IntersectionObserver inside populateTable and pulls
    // its own details + co-owners when scrolled into view (≤ ENRICH_CONCURRENCY
    // requests in flight), instead of the old eager 2×N burst that tripped the
    // backend's rate limiter into a wall of 403s on large lists.
    currentCases = cases;
    populateTable(currentCases);
    applyClientFilters();

    const searchInput = document.getElementById("searchCaseInput");
    const dateInput = document.getElementById("dateFilterInput");
    const clearDateBtn = document.getElementById("clearDateBtn");
    const todayOnly = document.getElementById("todayOnly");
    const refreshListBtn = document.getElementById("refreshListBtn");
    const searchBtn = document.getElementById("searchBtn");

    searchInput?.addEventListener("input", applyClientFilters);
    // <input type="search"> clears itself on Escape in WebKit, which would wipe
    // the active filter out from under the user. Swallow Escape so the query
    // (and the filtered list) stay put.
    searchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Esc") e.preventDefault();
    });

    // Header search mode picker (Name / Date / Status). Switching modes swaps
    // the visible control and re-applies filters.
    document.getElementById("searchMode")?.addEventListener("change", updateSearchModeUI);

    // Stat-card stage filters (All / Preparation / Delivery / Completed).
    // Clicking a stage card filters the list to it; clicking it again (or the
    // "All Cases" card) clears the filter.
    document.querySelectorAll("[data-status-group]").forEach((btn) => {
      btn.addEventListener("click", () =>
        applyStatFilter(btn.getAttribute("data-status-group"))
      );
    });
    syncStatFilterActiveState();

    // Phone header actions. The filter toolbar is hidden at this width, so the
    // magnifier reveals the search bar and the "+" reuses the toolbar's own
    // create button (kept in the DOM, just CSS-hidden) rather than duplicating
    // createCase.js's open logic.
    const mobileSearchBtn = document.getElementById("mobileSearchBtn");
    const mobileSearchBar = document.getElementById("mobileSearchBar");
    const mobileSearchInput = document.getElementById("mobileSearchInput");
    mobileSearchInput?.addEventListener("input", applyClientFilters);
    mobileSearchInput?.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Esc") e.preventDefault();
    });
    if (mobileSearchBtn && mobileSearchBar && mobileSearchInput) {
      mobileSearchBtn.addEventListener("click", () => {
        const opening = mobileSearchBar.classList.contains("hidden");
        mobileSearchBar.classList.toggle("hidden", !opening);
        mobileSearchBtn.setAttribute("aria-expanded", String(opening));
        if (opening) {
          mobileSearchInput.focus();
        } else if (mobileSearchInput.value) {
          // Closing the bar drops the filter — otherwise the list would stay
          // filtered by a query the user can no longer see.
          mobileSearchInput.value = "";
          applyClientFilters();
        }
      });
    }
    document.getElementById("mobileSearchClear")?.addEventListener("click", () => {
      if (!mobileSearchInput) return;
      mobileSearchInput.value = "";
      applyClientFilters();
      mobileSearchInput.focus();
    });
    document.getElementById("mobileCreateCaseBtn")?.addEventListener("click", () => {
      document.getElementById("createCaseBtn")?.click();
    });
    // Themed calendar for the "Search by Date" filter (allow clearing the filter).
    if (dateInput) attachThemedCalendar(dateInput, { allowClear: true });
    dateInput?.addEventListener("change", applyClientFilters);
    todayOnly?.addEventListener("change", applyClientFilters);
    searchBtn?.addEventListener("click", applyClientFilters);
    clearDateBtn?.addEventListener("click", () => {
      if (!dateInput) return;
      dateInput.value = "";
      applyClientFilters();
    });
    // Guard against rapid-fire refresh clicks: each reload kicks off ~30
    // parallel API calls (cases + per-case roles/details/alerts), and the
    // backend rate-limits aggressive bursts by responding 403 without CORS
    // headers — which the browser then surfaces as a confusing CORS error.
    // Disable the button while the reload is in flight so successive clicks
    // are absorbed locally instead of hammering the API.
    let refreshInFlight = false;
    refreshListBtn?.addEventListener("click", () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      refreshListBtn.disabled = true;
      refreshListBtn.style.opacity = "0.5";
      refreshListBtn.style.cursor = "wait";
      window.location.reload();
    });

    // Auto-refresh on return to the case list. Common flow: the user opens a
    // case in a new tab (Start Case), edits it there, then switches back here —
    // the list should pick up the new status/ordering (incl. the last-opened
    // bump) without a manual refresh. Reload when the tab becomes visible again
    // or is restored from the bfcache, mirroring the manual refresh button.
    // Throttled so quick tab-switches don't reload repeatedly or hammer the
    // rate-limited API; seeded at load so it never fires immediately.
    let lastAutoRefreshAt = Date.now();
    const AUTO_REFRESH_MIN_INTERVAL_MS = 10000;
    const maybeAutoRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshInFlight) return;
      if (Date.now() - lastAutoRefreshAt < AUTO_REFRESH_MIN_INTERVAL_MS) return;
      lastAutoRefreshAt = Date.now();
      refreshInFlight = true;
      window.location.reload();
    };
    document.addEventListener("visibilitychange", maybeAutoRefresh);
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) maybeAutoRefresh();
    });

    // Wire every logout affordance (the user-chip dropdown item + the
    // mobile-only header logout button both carry class .logout).
    const handleLogout = async () => {
      const confirmed = await confirmModal({
        title: "Log out?",
        message: "You'll need to sign in again to access your cases.",
        confirmText: "Log out",
        cancelText: "Cancel",
        variant: "info",
      });
      if (!confirmed) return;
      // Drop the cached case list (compute the key while the user is still known)
      // so the next account doesn't briefly see this one's list on instant paint.
      const cacheKey = caseListCacheKey();
      if (cacheKey) { try { localStorage.removeItem(cacheKey); } catch { /* ignore */ } }
      localStorage.removeItem("loggedInUser");
      // admin_case_list.html is one directory deeper (src/pages/admin/) than the
      // normal case_list.html (src/pages/); index.html sits at the web root.
      window.location.href = /\/admin\//.test(window.location.pathname)
        ? "../../../index.html"
        : "../../index.html";
    };
    document.querySelectorAll(".logout").forEach((btn) =>
      btn.addEventListener("click", handleLogout)
    );

    const headWrap = document.querySelector(".table-head-wrapper");
    const bodyWrap = document.querySelector(".table-body-wrapper");
    if (headWrap && bodyWrap) {
      let syncing = false;
      const sync = (src, dst) => {
        if (syncing) return;
        syncing = true;
        dst.scrollLeft = src.scrollLeft;
        syncing = false;
      };
      bodyWrap.addEventListener("scroll", () => sync(bodyWrap, headWrap));
      headWrap.addEventListener("scroll", () => sync(headWrap, bodyWrap));
    }

    document.getElementById("backToListBtn")?.addEventListener("click", () => {
      document.querySelector(".cm-page")?.classList.remove("show-details");
      document.body.classList.remove("show-details");
    });

    const filterSel = document.getElementById("filter-status");
if (filterSel) filterSel.addEventListener("change", () => applyClientFilters());


    // Sortable column headers. Clicking a header sorts by that column; clicking
    // the active header again flips direction. Re-renders go through
    // applyClientFilters so the active search/date/status filters stay applied
    // while only the ordering changes. populateTable reads the module sort
    // state (currentSortColumn / currentSortOrder), with pinned cases always
    // floating above their group.
    const sortableHeaders = document.querySelectorAll(".cm-th-sort");

    // Default direction per column: names/owners/status read best A→Z, while
    // date columns default to newest-first.
    const defaultOrderFor = (col) =>
      col === "name" || col === "owner" || col === "status" ? "asc" : "desc";

    const sortSelectMobile = document.getElementById("sortFieldMobile");

    // Keep both sort UIs in lockstep: clicking a table header updates the
    // mobile select's value, picking a mobile option updates the table carets.
    const syncSortUi = () => {
      sortableHeaders.forEach((th) => {
        const active = th.dataset.sort === currentSortColumn;
        th.classList.toggle("is-sorted", active);
        const caret = th.querySelector(".cm-sort-caret");
        if (!caret) return;
        caret.classList.remove("fa-sort", "fa-sort-up", "fa-sort-down");
        caret.classList.add(
          !active
            ? "fa-sort"
            : currentSortOrder === "asc"
            ? "fa-sort-up"
            : "fa-sort-down"
        );
      });
      if (sortSelectMobile) {
        const want = `${currentSortColumn}|${currentSortOrder}`;
        // Only set if the option exists — header clicks can produce
        // combinations the mobile picker doesn't expose (e.g. recent|asc).
        const hasOption = [...sortSelectMobile.options].some((o) => o.value === want);
        if (hasOption) sortSelectMobile.value = want;
      }
    };

    sortableHeaders.forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.sort;
        if (currentSortColumn === col) {
          currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
        } else {
          currentSortColumn = col;
          currentSortOrder = defaultOrderFor(col);
        }
        syncSortUi();
        applyClientFilters();
      });
    });

    sortSelectMobile?.addEventListener("change", () => {
      const [col, dir] = sortSelectMobile.value.split("|");
      if (!col || !dir) return;
      currentSortColumn = col;
      currentSortOrder = dir;
      syncSortUi();
      applyClientFilters();
    });

    syncSortUi();

    // 缩略图切换按钮绑定
    document.getElementById("prevBtn").addEventListener("click", () => stepThumbnail(-1));
    document.getElementById("nextBtn").addEventListener("click", () => stepThumbnail(1));

    // Swipe left/right on the preview to move between photos (mobile devices).
    attachSwipeNav(document.querySelector(".cm-image-area"), stepThumbnail);

    // Click the thumbnail to open it enlarged in a lightbox preview.
    document.getElementById("caseImage")?.addEventListener("click", () => {
      openThumbnailPreview();
    });

    document
      .getElementById("upload3dFileBtn")
      ?.addEventListener("click", () => pickAndUploadStl());

    // Case instructions autosave: no Save button, so the note commits when focus
    // leaves the box or on Enter. The box expands to fit while it's being edited
    // and collapses back once committed.
    const instructionsBox = document.getElementById("caseInstructions");
    if (instructionsBox) {
      instructionsBox.addEventListener("focus", () => autoGrowInstructions(instructionsBox));
      instructionsBox.addEventListener("input", () => {
        autoGrowInstructions(instructionsBox);
        setInstructionsStatus("");
      });
      instructionsBox.addEventListener("blur", () => saveCaseInstructions());
      // Enter commits; Shift+Enter still inserts a newline for multi-line notes.
      // Blurring (rather than saving directly) keeps a single commit path and
      // stops the blur that follows from firing a second save.
      instructionsBox.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          instructionsBox.blur();
        }
      });
    }
  }

  // ✅ START CASE 按钮绑定逻辑（使用 class 绑定方案 B）
  const startBtn = document.querySelector(".start-case-button");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      const caseId = window.selectedCaseId;
      console.log("🔹 Selected case ID:", caseId);

      if (!caseId) {
        toast.warning("Please select a case first.");
        return;
      }

      const encryptedId = lol(caseId);
      const isGitHubPages = window.location.hostname.includes("github.io");
      const queryConnector = "?";
      const basePath = isGitHubPages
        ? `/${window.location.pathname.split("/").filter(Boolean)[0] || ""}`
        : "";

      const targetURL = `${window.location.origin}${basePath}/src/pages/2DAnnotation.html${queryConnector}id=${encryptedId}`;
      window.open(targetURL, "_blank");

      // Entering the case is what bumps it to the top of the list — not merely
      // selecting the row. Optimistically update the local timestamp so the UI
      // moves it immediately, then fire the PUT in the background so the order
      // persists on the next load (and across devices).
      const loggedInUser = getLoggedInUser();
      if (loggedInUser) {
        bumpLocalLastUpdated(caseId);
        fireLastOpenedBump(caseId, window.selectedCaseStub, loggedInUser).catch(
          (err) => {
            console.warn("[caseManagement] last-opened bump failed:", err);
          }
        );
      }
    });
  }

  // Generate a QR code of the selected case's 3D viewer link.
  const generateQrBtn = document.getElementById("generateQrBtn");
  if (generateQrBtn) {
    generateQrBtn.addEventListener("click", () => {
      const url3d = buildThreeDViewerUrl(window.selectedCaseId, { forShare: true });
      if (!url3d) {
        toast.warning("Please select a case first.");
        return;
      }
      showThreeDViewerQr(url3d);
    });
  }

  // Copy the selected case's 3D viewer link to the clipboard.
  const copy3dLinkBtn = document.getElementById("copy3dLinkBtn");
  if (copy3dLinkBtn) {
    copy3dLinkBtn.addEventListener("click", async () => {
      const url3d = buildThreeDViewerUrl(window.selectedCaseId, { forShare: true });
      if (!url3d) {
        toast.warning("Please select a case first.");
        return;
      }
      try {
        await navigator.clipboard.writeText(url3d);
        toast.success("3D viewer link copied.");
      } catch (err) {
        console.warn("Failed to copy 3D viewer link", err);
        toast.error("Couldn't copy the link.");
      }
    });
  }

  // Open the 3D viewer as the currently logged-in user (no identity swap).
  const export3dLinkBtn = document.getElementById("export3dLinkBtn");
  if (export3dLinkBtn) {
    export3dLinkBtn.addEventListener("click", () => {
      const url3d = buildThreeDViewerUrl(window.selectedCaseId);
      if (!url3d) {
        toast.warning("Please select a case first.");
        return;
      }
      window.open(url3d, "_blank");
    });
  }

  // ✅ 👇 在这里添加 ⋯ 按钮展开菜单逻辑
  const dropdownToggle = document.querySelector(".dropdown-toggle");
  const dropdownMenu = document.getElementById("caseDropdown");

  if (dropdownToggle && dropdownMenu) {
    const setDropdownOpen = (open) => {
      dropdownMenu.classList.toggle("hidden", !open);
      dropdownToggle.setAttribute("aria-expanded", String(open));
    };

    dropdownToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setDropdownOpen(dropdownMenu.classList.contains("hidden"));
    });

    // Clicking anywhere outside closes it.
    document.addEventListener("click", () => setDropdownOpen(false));

    // Every entry is an action, so picking one closes the menu. Delegated to the
    // menu rather than bound per item so entries added later behave the same.
    dropdownMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target.closest(".dropdown-item")) setDropdownOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setDropdownOpen(false);
    });
  }

  const deleteBtn = document.getElementById("deleteBtn");

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const caseId = window.selectedCaseId;
      if (!caseId) {
        toast.warning("Please select a case first.");
        return;
      }
      const ok = await deleteCaseById(caseId);
      if (ok) toast.success("Case deleted successfully.");
    });
  }

  const duplicateBtn = document.getElementById("duplicateBtn");

  if (duplicateBtn) {
    duplicateBtn.addEventListener("click", async () => {
      const caseId = window.selectedCaseId;
      if (!caseId) {
        toast.warning("Please select a case first.");
        return;
      }
      duplicateBtn.classList.add("is-disabled");
      try {
        await duplicateCaseById(caseId);
      } finally {
        duplicateBtn.classList.remove("is-disabled");
      }
    });
  }

  const downloadReferencesBtn = document.getElementById("downloadReferencesBtn");

  if (downloadReferencesBtn) {
    downloadReferencesBtn.addEventListener("click", async () => {
      const caseId = window.selectedCaseId;
      if (!caseId) {
        toast.warning("Please select a case first.");
        return;
      }
      const caseObj = currentCases.find((c) => {
        const resolvedId = c?.id ?? c?.case_int_id;
        return String(resolvedId) === String(caseId);
      }) || window.selectedCaseStub || null;

      downloadReferencesBtn.classList.add("is-disabled");
      try {
        await downloadCaseReferenceImages(caseId, caseObj?.case_id);
      } finally {
        downloadReferencesBtn.classList.remove("is-disabled");
        dropdownMenu?.classList.add("hidden");
      }
    });
  }

  const editUserAccessBtn = document.getElementById("editUserAccessBtn");

  if (editUserAccessBtn) {
    editUserAccessBtn.addEventListener("click", async () => {
      const caseId = window.selectedCaseId;
      const user = getLoggedInUser();

      if (!caseId || !user?.uuid) {
        toast.warning("Please select a case first.");
        return;
      }

      const caseObj = currentCases.find(
        (c) => c.id === caseId || c.case_id === caseId
      );
      if (!caseObj) {
        toast.warning("Case not found in current list.");
        return;
      }

      const caseName = caseObj.case_id;
      const caseIntID = caseObj.id;
      const uuid = user.uuid;
      const machine_id = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

      // ✅ 打开弹窗
      userAccessModal.classList.remove("hidden");
      userAccessModal.classList.add("show");

      // ✅ 动态显示 Case Name
      document.querySelectorAll(".case-name-display").forEach((el) => {
        el.textContent = caseName;
      });

      // ✅ 设置上下文变量
      window._inviteContext = {
        caseName,
        caseIntID,
        uuid,
        machine_id,
      };

      // ✅ 获取已有共享用户
      try {
        const rolePayload = [
          { machine_id, uuid, caseIntID },
          { case_int_id: caseIntID },
        ];

        const roleRes = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/role/all/get",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rolePayload),
          }
        );
        logApi(roleRes, 'POST /role/all/get');
        const text = await roleRes.text();
        if (!roleRes.ok)
          throw new Error(`Role fetch failed: ${roleRes.status}`);

        const roleData = JSON.parse(text);
        existingUsers = roleData;

        renderSharedUserList(); // ✅ 渲染已有成员
      } catch (err) {
        console.error("❌ Failed to fetch roles:", err);
        sharedUserList.innerHTML = "<li>Failed to load users.</li>";
      }
    });
  }

  const renameBtn = document.getElementById("renameBtn");
  const renameCaseModal = document.getElementById("renameCaseModal");
  const renameCaseInput = document.getElementById("renameCaseInput");
  const closeRenameModalBtn = document.getElementById("closeRenameModal");
  const cancelRenameBtn = document.getElementById("cancelRenameBtn");
  const confirmRenameBtn = document.getElementById("confirmRenameBtn");

  const closeRenameModal = () => {
    if (!renameCaseModal) return;
    renameCaseModal.classList.add("hidden");
    renameCaseModal.classList.remove("show");
    window._renameContext = null;
  };

  const openRenameModal = (caseObj, user) => {
    if (!renameCaseModal || !renameCaseInput) return;
    window._renameContext = { caseObj, user };
    renameCaseInput.value = caseObj.case_id || "";
    renameCaseModal.classList.remove("hidden");
    renameCaseModal.classList.add("show");
    setTimeout(() => {
      renameCaseInput.focus();
      renameCaseInput.select();
    }, 0);
  };

  const submitRename = async () => {
    const ctx = window._renameContext;
    if (!ctx || !renameCaseInput) return;
    const { caseObj, user } = ctx;
    const newCaseName = renameCaseInput.value.trim();
    if (!newCaseName) {
      renameCaseInput.focus();
      return;
    }
    if (newCaseName === caseObj.case_id) {
      closeRenameModal();
      return;
    }

    const requestData = [
      {
        machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
        uuid: user.uuid,
        caseIntID: caseObj.id,
      },
      { case_id: newCaseName },
    ];

    confirmRenameBtn.disabled = true;
    try {
      const response = await fetch(
        `https://live.api.smartrpdai.com/api/smartrpd/case/rename/${caseObj.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestData),
        }
      );
      logApi(response, 'POST /case/rename/:id');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      caseObj.case_id = newCaseName;
      populateTable(currentCases);
      document.getElementById("caseNameDisplay").textContent = newCaseName;

      const caseListItems = document.querySelectorAll(".case-list-item");
      caseListItems.forEach((item) => {
        if (item.dataset.caseId === caseObj.id) {
          const nameElement = item.querySelector(".case-name");
          if (nameElement) nameElement.textContent = newCaseName;
        }
      });

      document.querySelectorAll(".case-name-display").forEach((el) => {
        el.textContent = newCaseName;
      });

      if (typeof renderCaseTable === "function") {
        renderCaseTable(currentCases);
      }

      console.log("✅ Case renamed successfully:", newCaseName);
      closeRenameModal();
    } catch (error) {
      console.error("❌ Failed to rename case:", error);
      toast.error(`Failed to rename case: ${error.message}`);
    } finally {
      confirmRenameBtn.disabled = false;
    }
  };

  if (renameBtn) {
    renameBtn.addEventListener("click", () => {
      const caseId = window.selectedCaseId;
      const user = getLoggedInUser();

      if (!caseId || !user?.uuid) {
        toast.warning("Please select a case first.");
        return;
      }

      const caseObj = currentCases.find(
        (c) => c.id === caseId || c.case_id === caseId
      );
      if (!caseObj) {
        toast.warning("Case not found in current list.");
        return;
      }

      openRenameModal(caseObj, user);
    });
  }

  closeRenameModalBtn?.addEventListener("click", closeRenameModal);
  cancelRenameBtn?.addEventListener("click", closeRenameModal);
  confirmRenameBtn?.addEventListener("click", submitRename);

  renameCaseModal?.addEventListener("click", (e) => {
    if (e.target === renameCaseModal) closeRenameModal();
  });

  renameCaseInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeRenameModal();
    }
  });

    /* ===== 状态下拉框保存 ===== */
  const statusSel = document.getElementById("status");
  if (statusSel) {
  statusSel.addEventListener("change", async (e) => {
    const newVal   = e.target.value;           // 下划线或 "na"
    const apiValue = valueToApiStatus(newVal); // 空格或 ""

    const caseId = window.selectedCaseId;
    const user   = getLoggedInUser();
    if (!caseId || !user?.uuid) {
      toast.warning("Please select a case first.");
      e.target.value = "na";
      return;
    }

    const caseObj = currentCases.find(
      (c) => c.id === caseId || c.case_int_id === caseId
    );
    if (!caseObj) return;

    try {
      await postNewStatus(caseObj, apiValue);   // ← 发送空格写法
      caseObj.new_status = apiValue;            // 本地同步
      applyStatusPillToSelect(apiValue);        // recolor the select pill
      applyClientFilters();
    } catch (err) {
      console.error("Status update failed:", err);
      toast.error("Failed to update status.");
      e.target.value = apiStatusToValue(caseObj.new_status);
      applyStatusPillToSelect(caseObj.new_status);
    }
  });
}

const openWebUrlBtn = document.getElementById("openWebUrl");
if (openWebUrlBtn) {
  openWebUrlBtn.addEventListener("click", () => {
    const value = document.getElementById("web-url")?.textContent?.trim();
    if (!value || value === "-") return;
    const url = value.startsWith("http") ? value : `https://${value}`;
    window.open(url, "_blank");
  });
}

const copyWebUrlBtn = document.getElementById("copyWebUrl");
if (copyWebUrlBtn) {
  copyWebUrlBtn.addEventListener("click", async () => {
    const value = document.getElementById("web-url")?.textContent?.trim();
    if (!value || value === "-") return;
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) {
      console.warn("Failed to copy URL", err);
    }
  });
}

});

function renderSharedUserList() {
  const container = document.getElementById("sharedUserList");

  if (!container) {
    console.warn("⚠️ Missing element: #sharedUserList");
    return;
  }

  // 清空旧内容
  container.innerHTML = "";

  // 如果没有用户，显示提示
  if (!existingUsers || existingUsers.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.textContent = "No users found.";
    emptyItem.style.color = "#888";
    emptyItem.style.fontStyle = "italic";
    container.appendChild(emptyItem);
    return;
  }

  // 遍历用户并渲染每个条目
  existingUsers.forEach((user) => {
    const li = document.createElement("li");
    li.className = "shared-user-item";
    li.style.position = "relative"; // 用于定位小 ×

    const nameSpan = document.createElement("span");
    nameSpan.className = "user-name";
    nameSpan.textContent = `👤 ${user.username}`;

    const roleSpan = document.createElement("span");
    roleSpan.className = "user-role";
    roleSpan.textContent = user.role;

    // ✅ 删除按钮（右上角 ×）
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "×";
    deleteBtn.title = "Remove user";
    deleteBtn.className = "delete-user-btn";

    // ⚠️ 如果缺失 uuid，不显示删除按钮
    if (!user.uuid || user.role === "owner") {
      deleteBtn.style.display = "none";
    }

    deleteBtn.addEventListener("click", async () => {
      const confirmed = await confirmModal({
        title: "Remove user?",
        message: `Remove ${user.username} from this case? They'll lose access immediately.`,
        confirmText: "Remove",
        cancelText: "Cancel",
        variant: "danger",
      });
      if (!confirmed) return;

      try {
        const { caseIntID, uuid, machine_id } = window._inviteContext;
        const payload = [
          { machine_id, uuid, caseIntID },
          { case_int_id: caseIntID, uuid: user.uuid },
        ];

        const res = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/role/delete",
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        logApi(res, 'PUT /role/delete');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast.success(`User ${user.username} removed.`);

        existingUsers = existingUsers.filter((u) => u.uuid !== user.uuid);
        renderSharedUserList();

        // Keep the detail pane's SHARED WITH in sync: drop this user from the
        // case's cached co_owners and re-render if it's the active case. Only
        // co-owners appear there (owner shows in ASSIGNED TO).
        if (user.role === "coowner") {
          const caseObj = currentCases.find(
            (c) => (c.id ?? c.case_int_id) === window._inviteContext?.caseIntID
          );
          if (caseObj) {
            caseObj.co_owners = (caseObj.co_owners || []).filter(
              (n) => n !== user.username
            );
            if (String(window.selectedCaseId) === String(window._inviteContext?.caseIntID)) {
              renderSharedWith(caseObj.co_owners);
            }
          }
        }
      } catch (err) {
        console.error("Failed to remove user:", err);
        toast.error("Failed to remove user.");
      }
    });

    li.appendChild(nameSpan);
    li.appendChild(roleSpan);
    li.appendChild(deleteBtn); // ✅ 添加到右上角
    container.appendChild(li);
  });
}

// --- resilience for the per-case enrichment --------------------------------
// The detail/co-owner endpoints have no by-user batch variant, so enriching a
// case means one request per case. When the backend throttles or fails, firing
// requests anyway produces a wall of CORS/403/5xx console errors (each failed
// fetch is logged natively by the browser — JS can't mute that). Two guards:
//   • retry+backoff rides out an ISOLATED transient failure so the row recovers;
//   • a shared circuit breaker STOPS firing further requests once the backend
//     is clearly refusing, then half-opens after a cooldown so scrolling later
//     (when the rate-limit window has passed) resumes enrichment by itself.
const BREAKER_FAILURE_THRESHOLD = 6; // consecutive failures before we stop
const BREAKER_COOLDOWN_MS = 30000; // how long an open breaker stays closed to traffic
const PER_CASE_FETCH_RETRIES = 2; // extra attempts for a transient failure
const PER_CASE_FETCH_TIMEOUT_MS = 10000; // abort a hung request so the breaker can trip

// Statuses that mean "the server is refusing this burst" rather than giving a
// real per-case answer: 429 (rate limit) and 403 (this backend returns it when
// a large fan-out trips its throttle — the first handful return 200, then it
// starts 403ing). Treated like 5xx: retried with backoff, and counted toward
// the breaker so a sustained refusal stops the flood. 401/404 are NOT here —
// those are genuine answers that wouldn't recover on retry.
const THROTTLE_STATUSES = new Set([403, 429]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Trips (opens) after `threshold` consecutive failures; any success resets it.
// With `cooldownMs`, an open breaker "half-opens" once the cooldown elapses:
// isOpen() flips back to false so the next attempt goes through — success
// closes it for real, failure re-trips it after another `threshold` strikes.
function makeBreaker(threshold, cooldownMs = 0) {
  let consecutiveFailures = 0;
  let openedAt = 0;
  return {
    isOpen() {
      if (!openedAt) return false;
      if (cooldownMs && Date.now() - openedAt >= cooldownMs) {
        openedAt = 0;
        consecutiveFailures = 0;
        return false;
      }
      return true;
    },
    recordSuccess() {
      consecutiveFailures = 0;
      openedAt = 0;
    },
    recordFailure() {
      consecutiveFailures += 1;
      if (consecutiveFailures >= threshold && !openedAt) openedAt = Date.now();
    },
  };
}

// Returns a Response (whatever status came back — callers handle 4xx), or null
// if the request ultimately failed or was skipped because the breaker is open.
// 5xx and throttle statuses (see THROTTLE_STATUSES) are retryable and count
// toward the breaker; any other status is a real answer and is returned as-is.
async function resilientFetch(url, options, breaker) {
  for (let attempt = 0; attempt <= PER_CASE_FETCH_RETRIES; attempt += 1) {
    if (breaker.isOpen()) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_CASE_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.status >= 500 || THROTTLE_STATUSES.has(res.status)) {
        throw new Error(`HTTP ${res.status}`);
      }
      breaker.recordSuccess();
      return res;
    } catch {
      clearTimeout(timer);
      breaker.recordFailure();
      if (breaker.isOpen() || attempt === PER_CASE_FETCH_RETRIES) return null;
      // Exponential backoff with jitter so retries don't resynchronize.
      await sleep(250 * 2 ** attempt + Math.random() * 150);
    }
  }
  return null;
}

// --- lazy per-case enrichment (visible rows only) ---------------------------
// The old flow eagerly fetched details + co-owners for EVERY case on load —
// ~2×N requests for one page view — which the backend answers with a 403 wall
// once its burst throttle trips (see the reload-guard note near the refresh
// button). Instead, rows now enrich themselves when they scroll into view:
// populateTable registers each un-enriched row with an IntersectionObserver,
// visible rows enter a small queue (≤ ENRICH_CONCURRENCY in flight), and the
// fetched fields are patched into the row IN PLACE — no full re-render, so the
// table never re-sorts and jumps under the user mid-scroll.
//
// Per-case enrichment state lives on the case object as `__enrich`:
//   undefined → not fetched (observer will queue it when its row is seen)
//   "queued" / "inflight" → in the pipeline, don't double-queue
//   "wait"   → last attempt was refused (throttle/outage); a timer re-observes
//              the row after the breaker cooldown so it self-heals
//   "done"   → enriched; skipped by the observer on later re-renders
// Keys starting with "__" are stripped from the localStorage cache.
// (ENRICH_CONCURRENCY + the request/fold layer live in caseEnrichment.js.)
const enrichBreaker = makeBreaker(BREAKER_FAILURE_THRESHOLD, BREAKER_COOLDOWN_MS);
const enrichQueue = [];
let enrichWorkersActive = 0;
let enrichWarnedAt = 0;
let enrichCacheSaveTimer = null;

// One shared observer; root = the table's own scroll container. rootMargin
// prefetches rows slightly before they become visible so data usually lands
// by the time the user's eyes do.
let rowObserver = null;
function getRowObserver() {
  if (rowObserver !== null) return rowObserver;
  if (typeof IntersectionObserver === "undefined") {
    rowObserver = false; // no observer support: enqueue immediately instead
    return rowObserver;
  }
  rowObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        rowObserver.unobserve(entry.target);
        enqueueEnrichment(entry.target.__caseObj);
      }
    },
    { root: document.getElementById("caseList"), rootMargin: "200px 0px" }
  );
  return rowObserver;
}

// Called by populateTable for every rendered row that still needs data.
function observeRowForEnrichment(row, caseObj) {
  if (!caseObj || caseObj.__enrich) return; // done/queued/inflight/wait
  row.__caseObj = caseObj;
  const obs = getRowObserver();
  if (obs) obs.observe(row);
  else enqueueEnrichment(caseObj); // ancient browser: degrade to queue-all
}

function enqueueEnrichment(caseObj, { front = false } = {}) {
  if (!caseObj || caseObj.__enrich === "done" || caseObj.__enrich === "queued" || caseObj.__enrich === "inflight") {
    return;
  }
  caseObj.__enrich = "queued";
  if (front) enrichQueue.unshift(caseObj);
  else enrichQueue.push(caseObj);
  pumpEnrichQueue();
}

function pumpEnrichQueue() {
  while (enrichWorkersActive < ENRICH_CONCURRENCY && enrichQueue.length) {
    const caseObj = enrichQueue.shift();
    enrichWorkersActive += 1;
    enrichOneCase(caseObj).finally(() => {
      enrichWorkersActive -= 1;
      pumpEnrichQueue();
    });
  }
}

// Fetch details + co-owner roles for ONE case and fold them into the case
// object + its rendered row. Refusals (throttle/outage → resilientFetch null)
// park the case in "wait" and re-observe its row after the breaker cooldown.
async function enrichOneCase(caseObj) {
  const logged = getLoggedInUser();
  const caseIntID = caseIntIdOf(caseObj);
  if (!logged || caseIntID == null) {
    caseObj.__enrich = "done"; // nothing we can ever fetch for this row
    return;
  }
  caseObj.__enrich = "inflight";

  const [detailRes, rolesRes] = await Promise.all(
    buildEnrichRequests(caseIntID, logged.uuid).map(([url, options]) =>
      resilientFetch(url, options, enrichBreaker)
    )
  );

  // false = both refused (throttle/outage or breaker already open): park and
  // retry after the cooldown. Fold details are in caseEnrichment.js.
  if (!(await applyEnrichmentResponses(caseObj, detailRes, rolesRes, logApi))) {
    scheduleEnrichRetry(caseObj);
    return;
  }

  caseObj.__enrich = "done";
  patchRowInPlace(caseObj);
  syncDetailPaneIfSelected(caseObj);
  scheduleEnrichCacheSave();
}

// Refused by throttle/outage: warn once per breaker window, then re-observe
// the row after the cooldown so a still-visible row retries automatically.
function scheduleEnrichRetry(caseObj) {
  caseObj.__enrich = "wait";
  if (Date.now() - enrichWarnedAt > BREAKER_COOLDOWN_MS) {
    enrichWarnedAt = Date.now();
    console.warn(
      "[cases] Case enrichment paused — backend refusing requests (rate-limited or unreachable). Retrying automatically in " +
        Math.round(BREAKER_COOLDOWN_MS / 1000) +
        "s."
    );
  }
  setTimeout(() => {
    caseObj.__enrich = undefined;
    const id = String(caseObj.id ?? caseObj.case_int_id);
    const row = document.querySelector(`#caseTableBody tr[data-case-id="${CSS.escape(id)}"]`);
    // Re-observing an on-screen row fires the observer immediately, which
    // re-queues it; an off-screen or re-rendered row is picked up by the next
    // populateTable pass instead.
    if (row) observeRowForEnrichment(row, caseObj);
  }, BREAKER_COOLDOWN_MS + Math.random() * 2000);
}

// Update just this case's rendered cells (status pill, due date + urgency bar,
// owner, shared-with). Deliberately NOT a populateTable() re-render: that would
// re-sort the table and yank rows around under the user mid-scroll. The one
// case where in-place patching would be wrong is an active status filter (the
// fresh new_status may add/remove the row from the filtered set), so that path
// re-filters properly instead.
function patchRowInPlace(caseObj) {
  const sel = document.getElementById("filter-status");
  if (sel && sel.value !== "all") {
    applyClientFilters();
    return;
  }

  const id = String(caseObj.id ?? caseObj.case_int_id);
  const row = document.querySelector(`#caseTableBody tr[data-case-id="${CSS.escape(id)}"]`);
  if (!row) return; // filtered out / re-rendered away — caseObj already holds the data

  const pill = row.querySelector(".cm-td-status .cm-pill");
  if (pill) {
    pill.className = `cm-pill ${statusPillClass(caseObj.new_status)}`;
    pill.innerHTML = statusPillInner(caseObj.new_status);
  }

  const dueDate =
    caseObj.expected_date || caseObj.due_date || computeDefaultDueDate(caseObj.creation_date);
  const dueInd = dueDateIndicator(dueDate);
  const dueCell = row.querySelector(".cm-due-date");
  if (dueCell) {
    dueCell.className = `cm-td-date cm-due-date ${dueInd ? dueInd.cls : ""}`;
    const text = dueCell.querySelector(".cm-due-text");
    if (text) text.textContent = dueDate ? formatDateOnly(dueDate) : "N/A";
  }
  const nameCell = row.querySelector(".cm-td-name");
  if (nameCell) {
    nameCell.querySelector(".cm-due-bar")?.remove();
    if (dueInd) {
      const bar = document.createElement("span");
      bar.className = `cm-due-bar ${dueInd.cls}`;
      bar.title = dueInd.label;
      bar.setAttribute("aria-hidden", "true");
      nameCell.appendChild(bar);
    }
  }

  const owner = caseObj.assigned_to || caseObj.username || "N/A";
  const ownerEl = row.querySelector(".cm-owner-name");
  if (ownerEl) {
    ownerEl.textContent = owner;
    ownerEl.title = owner;
  }

  const sharedCell = row.querySelector(".cm-td-shared");
  if (sharedCell) {
    sharedCell.textContent = "";
    const span = document.createElement("span");
    if (caseObj.co_owners?.length) {
      span.className = "cm-shared-names";
      span.textContent = caseObj.co_owners.join(", ");
      span.title = span.textContent;
    } else {
      span.className = "cm-shared-empty";
      span.textContent = "—";
    }
    sharedCell.appendChild(span);
  }

  // Status may have just resolved from enrichment — refresh the admin counters.
  scheduleAdminStats();
}

// If the enriched case is the one open in the detail pane, fold the fresh
// fields into the stub (dashboard reads it) and repaint the pane.
function syncDetailPaneIfSelected(caseObj) {
  const id = String(caseObj.id ?? caseObj.case_int_id);
  if (String(window.selectedCaseId) !== id || !window.selectedCaseStub) return;
  Object.assign(window.selectedCaseStub, {
    new_status: caseObj.new_status,
    expected_date: caseObj.expected_date,
    assigned_to: caseObj.assigned_to,
    comments: caseObj.comments,
    co_owners: caseObj.co_owners,
  });
  displayCaseDetails(window.selectedCaseStub);
}

// Enrichment lands incrementally now, so persist the cache on a debounce
// instead of once-per-case (2400 cases scrolling by = 2400 JSON.stringify).
function scheduleEnrichCacheSave() {
  clearTimeout(enrichCacheSaveTimer);
  enrichCacheSaveTimer = setTimeout(() => saveCachedCases(currentCases), 1500);
}

// --- Upload 3D file --------------------------------------------------------
// Same "extra STL slot" mechanism the 2D annotation page's 3D preview uses
// (POST /stl/slot/), surfaced here so a clinic can attach an STL without opening
// the case first. Slots 1–4 sit alongside the case's real upper/lower jaws.
const API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";
const EXTRA_STL_SLOTS = [1, 2, 3, 4];

function extraSlotAuth(caseIntId) {
  const user = getLoggedInUser();
  return {
    machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
    uuid: user?.uuid || "",
    caseIntID: caseIntId,
  };
}

// Find the lowest unoccupied extra slot, or null when all four are taken.
//
// Probed one at a time and stopped at the first miss on purpose: /stl/slot/get
// has no "is it empty" mode — an occupied slot returns the whole base64 STL — so
// checking all four in parallel would pull tens of MB just to pick a slot. In the
// common case (slot 1 free) this downloads nothing at all.
async function findFreeStlSlot(caseIntId) {
  const auth = extraSlotAuth(caseIntId);
  for (const slotNumber of EXTRA_STL_SLOTS) {
    try {
      const res = await fetch(`${API_BASE}/stl/slot/get`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([auth, { slotNumber }]),
      });
      if (!res.ok) return slotNumber; // 404 = empty slot
      const data = await res.json();
      const item = Array.isArray(data) ? data[0] : data;
      if (!item?.data) return slotNumber;
    } catch (err) {
      console.warn(`⚠️ /stl/slot/get probe failed for slot ${slotNumber}`, err);
      return slotNumber; // treat an unreachable probe as free and let the POST decide
    }
  }
  return null;
}

// Read a File as base64, chunked so a large STL doesn't blow the call stack.
async function stlFileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// POST via XHR rather than fetch so upload progress is reportable — STLs are
// large enough that a silent multi-second wait reads as a hang.
function uploadStlSlotXHR(payload, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/stl/slot/`);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.responseText)
        : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(payload);
  });
}

async function uploadCaseStlFile(file) {
  const caseIntId = window.selectedCaseId;
  if (caseIntId == null) {
    toast.warning("Please select a case first.");
    return;
  }
  if (!/\.stl$/i.test(file.name)) {
    toast.warning("Only .stl files are supported.");
    return;
  }
  const btn = document.getElementById("upload3dFileBtn");
  if (btn) btn.disabled = true;
  try {
    const slotNumber = await findFreeStlSlot(caseIntId);
    if (slotNumber == null) {
      toast.warning("All 4 extra 3D file slots are in use. Delete one first.");
      return;
    }
    toast.info(`Uploading ${file.name}…`);
    const data = await stlFileToBase64(file);
    await uploadStlSlotXHR(
      JSON.stringify([extraSlotAuth(caseIntId), { slotNumber, filename: file.name, data }])
    );
    toast.success(`${file.name} uploaded.`);
  } catch (err) {
    console.error("❌ 3D file upload failed", err);
    toast.error("Upload failed. Please try again.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// One-shot file picker, removed after the pick.
function pickAndUploadStl() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".stl";
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.remove();
    if (file) uploadCaseStlFile(file);
  });
  input.click();
}

// --- Case instructions -----------------------------------------------------
// Free-text case note the clinic uses for anything the structured fields don't
// cover. Stored in additionalcasedetails.comments — the same field the 2D Case
// Note's comment box writes, so the two stay in sync by design.

// Size the textarea to its content so it grows as the note gets longer (there is
// no drag handle). Height is cleared first so the box can shrink again, and the
// border is added back on top of scrollHeight, which measures content + padding
// only — without it a border-box textarea clips its last line.
function autoGrowInstructions(box) {
  if (!box) return;
  box.style.height = "auto";
  box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;
}

// Drop the inline height so the box falls back to its CSS resting size. Called
// once a note is committed: it grows while being typed, then goes back to
// compact so a long note doesn't permanently eat the detail panel.
function collapseInstructions(box) {
  if (box) box.style.height = "";
}

// The case the textarea currently holds, and the value last known to be on the
// server. Tracked so a slow save can't land on a case the user has since
// switched away from, and so Save only enables on a real edit.
let instructionsLoadedFor = null;
let instructionsSavedValue = "";

function renderCaseInstructions(caseIntId, comments) {
  const box = document.getElementById("caseInstructions");
  if (!box) return;
  instructionsLoadedFor = caseIntId ?? null;
  instructionsSavedValue = comments ?? "";
  box.value = instructionsSavedValue;
  box.disabled = caseIntId == null;
  // Opening a case shows the note at its resting size; it only expands once the
  // user focuses in to edit.
  collapseInstructions(box);
  setInstructionsStatus("");
}

function setInstructionsStatus(text, isError = false) {
  const status = document.getElementById("caseInstructionsStatus");
  if (!status) return;
  status.textContent = text;
  status.classList.toggle("is-error", !!isError);
}

// Read the case's current additionalcasedetails row. The table is append-only —
// every POST inserts a new row and the newest is authoritative — so the latest
// row is the one to merge onto. Returns { ok, detail }: ok=false means the read
// failed and the caller must NOT write; detail=null with ok=true = no row yet.
async function fetchAdditionalCaseDetails(caseIntId) {
  const user = getLoggedInUser();
  if (!user?.uuid || caseIntId == null) return { ok: false, detail: null };
  try {
    const res = await fetch(
      "https://live.api.smartrpdai.com/api/smartrpd/additionalcasedetails/getall",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
            uuid: user.uuid,
            caseIntID: caseIntId,
          },
        ]),
      }
    );
    logApi(res, "POST /additionalcasedetails/getall");
    // 404 = this case has no row yet, which is a valid starting point.
    if (res.status === 404) return { ok: true, detail: null };
    if (!res.ok) return { ok: false, detail: null };
    const arr = await res.json();
    return { ok: true, detail: Array.isArray(arr) ? arr.at(-1) ?? null : null };
  } catch (err) {
    console.error("❌ Failed to read additional case details:", err);
    return { ok: false, detail: null };
  }
}

// Save the instructions box. POST /additionalcasedetails is a FULL upsert, so
// read the current row first and carry assigned_to/due_date/new_status forward —
// posting only `comments` would null the rest (that's how the case loses its due
// date and status).
// There is no Save button — this is called on Enter and on focus leaving the
// box, so it fires often and must be cheap and idempotent when nothing changed.
async function saveCaseInstructions() {
  const box = document.getElementById("caseInstructions");
  const caseIntId = instructionsLoadedFor;
  if (!box || caseIntId == null) return;

  const text = box.value.trim();
  // Blur fires every time focus leaves, including when the user just clicked in
  // and out. Nothing to write, so collapse and stay quiet.
  if (text === instructionsSavedValue.trim()) {
    collapseInstructions(box);
    return;
  }

  const user = getLoggedInUser();
  if (!user?.uuid) {
    setInstructionsStatus("Not signed in.", true);
    return;
  }

  setInstructionsStatus("Saving…");

  const { ok, detail } = await fetchAdditionalCaseDetails(caseIntId);
  if (!ok) {
    setInstructionsStatus("Couldn't save — try again.", true);
    return;
  }

  try {
    const res = await fetch(
      "https://live.api.smartrpdai.com/api/smartrpd/additionalcasedetails",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          {
            machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
            uuid: user.uuid,
            caseIntID: caseIntId,
          },
          {
            assigned_to: detail?.assigned_to ?? null,
            due_date: detail?.due_date ?? null,
            new_status: detail?.new_status ?? null,
            comments: text || null,
          },
        ]),
      }
    );
    logApi(res, "POST /additionalcasedetails");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Mirror into the cached list row and the dashboard stub so reopening the
    // case shows the saved text without waiting for a re-fetch.
    const cached = currentCases.find(
      (c) => String(c.id ?? c.case_int_id) === String(caseIntId)
    );
    if (cached) cached.comments = text || null;
    if (window.selectedCaseStub) window.selectedCaseStub.comments = text || null;

    // The user may have switched cases mid-request; only touch the box if it is
    // still showing the case we saved.
    if (instructionsLoadedFor === caseIntId) {
      instructionsSavedValue = text;
      box.value = text;
      // Committed — shrink back to the resting size.
      collapseInstructions(box);
      setInstructionsStatus("Saved.");
      setTimeout(() => {
        const status = document.getElementById("caseInstructionsStatus");
        if (status?.textContent === "Saved.") setInstructionsStatus("");
      }, 2000);
    }
  } catch (err) {
    console.error("❌ Failed to save case instructions:", err);
    setInstructionsStatus("Couldn't save — try again.", true);
  }
}

// Read the stored additionalcasedetails row for one case, or null when the case
// has no record yet. Throws if the backend refuses, so a caller about to
// overwrite the record can abort rather than guess at its contents.
async function readCaseDetails(caseIntID, uuid) {
  const res = await fetch(
    "https://live.api.smartrpdai.com/api/smartrpd/additionalcasedetails/getall",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616", uuid, caseIntID },
      ]),
    }
  );
  logApi(res, 'POST /additionalcasedetails/getall');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  return (Array.isArray(rows) ? rows.at(-1) : null) || null;
}

async function postNewStatus(caseObj, newStatus) {
  const uuid = getLoggedInUser().uuid;
  const caseIntID = caseObj.id || caseObj.case_int_id;

  // POST /additionalcasedetails replaces the whole row — every field this body
  // leaves out comes back null. So read the record and merge into it rather than
  // trusting the in-memory case: lazy enrichment marks a case "done" as soon as
  // EITHER of its two fetches succeeds, so a row whose roles call landed and
  // whose details call was throttled still carries no due date or comments, and
  // sending those would erase them.
  const stored = await readCaseDetails(caseIntID, uuid);

  const body = [
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid,
      caseIntID,
    },
    {
      assigned_to: stored?.assigned_to ?? caseObj.assigned_to ?? null,
      due_date: stored?.due_date ?? caseObj.expected_date ?? null, // 你的 clean 已改名
      comments: stored?.comments ?? caseObj.comments ?? null,
      new_status: newStatus,
    },
  ];

  const res = await fetch(
    "https://live.api.smartrpdai.com/api/smartrpd/additionalcasedetails",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  logApi(res, 'POST /additionalcasedetails');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  /* ★★★ 这三行是新加的 ★★★ */
await createStatusAlerts(
  caseObj,
  getLoggedInUser().username || "",   // from_user
  newStatus                          // 必要时写成 "" 也行
).catch(console.error);
  return res.json(); // ← 如需用返回值可接住
}


/*  当状态改完以后，为同一 case 的其它成员创建通知                    */
async function createStatusAlerts(caseObj, fromUser, newStatus) {
  const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
  const me         = getLoggedInUser();
  const myUuid     = me.uuid;
  const caseIntID  = caseObj.id || caseObj.case_int_id;

  /* 1️⃣ 拉角色列表 —— 把 owner / coowner / lab 都列进来 */
  let recipients = [];
  try {
    const res = await fetch(
      "https://live.api.smartrpdai.com/api/smartrpd/role/all/get",
      {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify([
          { machine_id: MACHINE_ID, uuid: myUuid, caseIntID },
          { case_int_id: caseIntID }
        ])
      }
    );
    logApi(res, 'POST /role/all/get');
    if (res.ok) {
      const arr = await res.json();
      recipients = arr
        .filter(r => ["owner", "coowner", "lab"].includes(r.role))
        .map(r =>
          r.username ||
          (r.email ? r.email.split("@")[0] : "") ||      // 回退到邮箱前缀
          r.uuid                                          // 最后用 uuid
        )
        .filter(Boolean);
    }
  } catch (err) {
    console.warn("[alerts] role fetch failed:", err);
  }

  /* 2️⃣ 排除自己 & 去重 */
  recipients = [...new Set(
    recipients.filter(u =>
      u && fromUser && u.toLowerCase() !== fromUser.toLowerCase()
    )
  )];

  if (!recipients.length) return;   // 没别人需要通知

  /* 3️⃣ 并发写 alerts */
  await Promise.all(
    recipients.map(async toName => {
      const body = [
        { machine_id: MACHINE_ID, uuid: myUuid, caseIntID },
        {
          case_int_id   : caseIntID,
          to_user       : toName,
          from_user     : fromUser,
          new_status    : newStatus,
          alert_message : "",          // 需要可自定义
          read_status   : 0,
          deleted       : 0
        }
      ];
      console.log("[alerts] push to", toName, body);  // 调试用

      try {
        const alertRes = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/alerts",
          {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify(body)
          }
        );
        logApi(alertRes, 'POST /alerts');
      } catch (e) {
        console.error("[alerts] create failed:", e);
      }
    })
  );
}



// 把后端的空格写法 -> 下划线写法
function apiStatusToValue(str) {
  if (!str) return "na";                  // 后端空/null → N/A
  return str.toLowerCase().replace(/ /g, "_");
}

// 把下划线写法 -> 后端需要的空格写法
function valueToApiStatus(val) {
  if (!val || val === "na") return "";    // N/A → 空字符串（等同 null）
  return val.replace(/_/g, " ");
}
