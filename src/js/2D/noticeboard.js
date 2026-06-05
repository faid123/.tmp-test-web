import { state, setMessage } from "./2DAnnotation.js";
import { captureJawJpegDataUrl } from "./annotationLocks.js";
import { openInstructionEditor } from "./instructionEditor.js";
import { capture3DPreviewDataUrl } from "./preview3D.js";
import {
  UPPER_TEETH,
  LOWER_TEETH,
  sourceToothFor,
  statusFor,
  getClinicalNotesForCase,
  tiltArrowFor,
} from "./clinicalInfo.js";
import { WORK_CATEGORY_LABELS, loadCaseNote } from "./caseNote.js";
import { encodeEditedViewColumns } from "./dotnetBinaryFormatter.js";

//Add constants
const API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";
const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

//Add helper to read logged-in user
function getLoggedInUser(){
  try{
    return JSON.parse(localStorage.getItem("loggedInUser") || "null");
  }
  catch{
    return null;
  }
}

//Add a common payload builder
function noticeboardPayload(caseIntID, uuid){
  return [
    {machine_id: MACHINE_ID,uuid,caseIntID},
    {case_id: caseIntID}
  ];
}

//Add safe parse helpers
function safeJsonParse(raw, fallback){
  try{
    return JSON.parse(raw);
  } catch{
    return fallback;
  }
}

function normalizeApiRow(apiResult){
  if (!apiResult) return null;
  if (Array.isArray(apiResult)) return apiResult[0] || null;
  return apiResult;
}

//Add endpoint fetchers
async function postNoticeboardEndpoint(path, payload){
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  const dt = Math.round(performance.now() - t0);
  if (!res.ok) {
    console.warn(`[noticeboard] ✕ POST ${path} FAILED  status=${res.status}  ${dt}ms`);
    return null;
  }
  console.log(`[noticeboard] ✓ POST ${path} OK  status=${res.status}  ${dt}ms`);
  return res.json();
}

async function fetchNoticeboardEdited(caseIntID, uuid) {
  return postNoticeboardEndpoint("/noticeboard/editedview/get", noticeboardPayload(caseIntID, uuid));
}

async function saveNoticeboardEdited(caseIntID, uuid, filenames, data) {
  const names = Array.isArray(filenames) ? filenames : [];
  const datas = Array.isArray(data) ? data : [];
  // Encode in the desktop's .NET BinaryFormatter byte[][] layout so the SmartRPD
  // desktop client can deserialize web-saved editedview rows. Writing plain JSON
  // here is what made desktop login wipe web uploads: the desktop fails to parse
  // the JSON, shows an empty noticeboard, then overwrites the row on its next
  // save — destroying the web's post. (Encoder verified byte-for-byte against
  // desktop-written production records; see [[noticeboard-editedview-format]].)
  const { filenames: filenamesBlob, data: dataBlob, count } =
    await encodeEditedViewColumns(names, datas);
  const payload = [
    { machine_id: MACHINE_ID, uuid, caseIntID },
    {
      case_id: caseIntID,
      filenames: filenamesBlob,
      data: dataBlob,
    },
  ];
  console.log(
    `[noticeboard] → POST /noticeboard/editedview  caseIntID=${caseIntID}  items=${count}`,
    { filenames: names }
  );
  const t0 = performance.now();
  const res = await fetch(`${API_BASE}/noticeboard/editedview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const dt = Math.round(performance.now() - t0);
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    console.error(
      `[noticeboard] ✕ POST /noticeboard/editedview FAILED  status=${res.status}  ${dt}ms  ${body.slice(0, 200)}`
    );
    throw new Error(`noticeboard editedview save failed: ${res.status}`);
  }
  console.log(
    `[noticeboard] ✓ POST /noticeboard/editedview OK  status=${res.status}  ${dt}ms`
  );
  return res.json().catch(() => null);
}

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = safeJsonParse(value, null);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

function parseRowToArrays(row) {
  if (!row) return { filenames: [], data: [] };
  return {
    filenames: coerceArray(row.filenames),
    data: coerceArray(row.data),
  };
}

function isDataUrlImage(v) {
  return typeof v === "string" && v.startsWith("data:image/");
}

// Decode base64 (tolerant of URL-safe variants and missing padding) into a
// binary string where each character represents one byte.
function safeAtob(b64) {
  if (typeof b64 !== "string") return null;
  try {
    const cleaned = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

// The desktop client stores noticeboard captures by serializing a list of
// images with .NET BinaryFormatter, then base64-encoding the whole blob. The
// result isn't JSON, so JSON.parse silently fails. This scans the decoded
// bytes for embedded PNG signatures (or base64-encoded PNG strings as a
// fallback) and rebuilds usable data URLs.
function extractPngsFromBinaryFormatter(outerBase64) {
  const decoded = safeAtob(outerBase64);
  if (!decoded) return [];

  const out = [];
  const PNG_SIG = "\x89PNG\r\n\x1a\n";
  const PNG_END = "IEND\xae\x42\x60\x82";
  let i = 0;
  while (true) {
    const start = decoded.indexOf(PNG_SIG, i);
    if (start === -1) break;
    const endMarker = decoded.indexOf(PNG_END, start);
    if (endMarker === -1) break;
    const end = endMarker + PNG_END.length;
    out.push("data:image/png;base64," + btoa(decoded.slice(start, end)));
    i = end;
  }
  if (out.length) return out;

  // Fallback: the blob may contain base64-encoded PNG *strings* rather than
  // raw PNG bytes. Scan for the canonical base64-PNG header.
  const B64_PNG_HEAD = "iVBORw0KGgo";
  let j = 0;
  while (true) {
    const idx = decoded.indexOf(B64_PNG_HEAD, j);
    if (idx === -1) break;
    let k = idx;
    while (k < decoded.length && /[A-Za-z0-9+/=]/.test(decoded[k])) k += 1;
    const b64 = decoded.slice(idx, k).replace(/=+$/, "");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    out.push("data:image/png;base64," + b64 + pad);
    j = k;
  }
  return out;
}

function extractFilenamesFromBinaryFormatter(outerBase64) {
  const decoded = safeAtob(outerBase64);
  if (!decoded) return [];
  const out = [];
  const RE = /[A-Za-z0-9_\-\. ]{1,80}\.(?:png|jpe?g|gif|bmp)/gi;
  let m;
  while ((m = RE.exec(decoded)) !== null) out.push(m[0]);
  return out;
}

// Desktop client filenames are prefixed `2D_*` for instructions and `3D_*`
// (or no prefix) for viewcaptures. Anything else routes to viewcaptures by
// default so nothing gets dropped silently.
function isInstructionFilename(name) {
  return /^\s*2d[_\-\.\s]/i.test(String(name || ""));
}

function buildServerEntries(editedRow) {
  if (!editedRow) return { instructions: [], viewcaptures: [] };

  // Preferred path: the field is a JSON-serialized array of data URLs (what
  // the web app itself writes). Use it whenever it parses cleanly.
  const edited = parseRowToArrays(editedRow);
  let previews = edited.data.filter(isDataUrlImage);
  let names = edited.filenames.filter((n) => typeof n === "string" && n);

  // Fallback path: the field is a .NET BinaryFormatter blob from the desktop
  // client. Dig PNG bytes and filenames out of it heuristically.
  if (!previews.length && typeof editedRow.data === "string") {
    previews = extractPngsFromBinaryFormatter(editedRow.data);
  }
  if (!names.length && typeof editedRow.filenames === "string") {
    names = extractFilenamesFromBinaryFormatter(editedRow.filenames);
  }

  const instructions = [];
  const viewcaptures = [];
  for (let i = 0; i < previews.length; i += 1) {
    const preview = previews[i];
    const title = names[i] || `Item ${i + 1}`;
    const item = {
      id: `srv_${i}_${title}`,
      title,
      preview,
      baseImage: preview,
      createdAt: new Date().toISOString(),
      source: "server",
    };
    if (isInstructionFilename(title)) instructions.push(item);
    else viewcaptures.push(item);
  }
  return { instructions, viewcaptures };
}

function mergeInstructions(localItems, serverItems) {
  const map = new Map();
  const keyOf = (item) => {
    if (item.title) return `title:${item.title}`;
    if (item.id) return `id:${item.id}`;
    return `preview:${item.preview || ""}`;
  };
  for (const it of localItems || []) map.set(keyOf(it), it);
  for (const it of serverItems || []) {
    const key = keyOf(it);
    map.set(key, { ...(map.get(key) || {}), ...it });
  }
  return Array.from(map.values());
}

// Ensure the persisted title carries a 2D_/3D_ prefix so the next hydrate
// can route it back to the correct bucket. We don't double-prefix if one is
// already present.
function ensureKindPrefix(title, kind) {
  const t = String(title || "").trim();
  if (/^\s*(2d|3d)[_\-\.\s]/i.test(t)) return t;
  const prefix = kind === "instruction" ? "2D_" : "3D_";
  return `${prefix}${t || (kind === "instruction" ? "Instruction" : "Viewcapture")}`;
}

function serializeForEditedView(instructions, viewcaptures) {
  const filenames = [];
  const data = [];
  const push = (item, kind, fallbackIdx) => {
    const obj = item || {};
    const rawTitle = typeof obj.title === "string" && obj.title.trim()
      ? obj.title.trim()
      : `${kind === "instruction" ? "Instruction" : "Viewcapture"} ${fallbackIdx + 1}`;
    filenames.push(ensureKindPrefix(rawTitle, kind));
    data.push(typeof obj.preview === "string" ? obj.preview : "");
  };
  (Array.isArray(instructions) ? instructions : []).forEach((it, i) => push(it, "instruction", i));
  (Array.isArray(viewcaptures) ? viewcaptures : []).forEach((it, i) => push(it, "viewcapture", i));
  return { filenames, data };
}

// Read the server's current filenames+data arrays for the edited view, then
// fall back to the BinaryFormatter parser if the server response is the
// desktop client's blob format rather than JSON.
function readEditedViewArrays(row) {
  if (!row) return { filenames: [], data: [] };
  let names = safeJsonParse(row.filenames || "[]", null);
  let data = safeJsonParse(row.data || "[]", null);
  if (!Array.isArray(names) || !names.length) {
    names = typeof row.filenames === "string"
      ? extractFilenamesFromBinaryFormatter(row.filenames)
      : [];
  }
  if (!Array.isArray(data) || !data.length) {
    data = typeof row.data === "string"
      ? extractPngsFromBinaryFormatter(row.data)
      : [];
  }
  return { filenames: names, data };
}

let editedViewSaveInFlight = false;
async function syncInstructionsToEditedView() {
  if (editedViewSaveInFlight) return false;
  const user = getLoggedInUser();
  if (!user?.uuid || !state.caseIntID) return false;

  try {
    editedViewSaveInFlight = true;

    // 1) Fetch the current server arrays so we don't blow away entries that
    // were saved by another session or by the desktop client.
    const existing = await fetchNoticeboardEdited(state.caseIntID, user.uuid);
    const row = normalizeApiRow(existing);
    const server = readEditedViewArrays(row);

    // 2) Serialize our local buckets (instructions + viewcaptures) with the
    // 2D_/3D_ prefix convention so they round-trip back into the right panel.
    const dataModel = ensureCache();
    const local = serializeForEditedView(
      dataModel.instructions || [],
      dataModel.viewcaptures || []
    );

    // 3) Merge: local entries win (by filename); server-only entries are
    // preserved so a save here can't delete something only the desktop client
    // knows about.
    const filenames = [...local.filenames];
    const data = [...local.data];
    const seen = new Set(filenames);
    for (let i = 0; i < server.filenames.length; i += 1) {
      const name = server.filenames[i];
      if (!name || seen.has(name)) continue;
      filenames.push(name);
      data.push(server.data[i] || "");
      seen.add(name);
    }

    // 4) POST the merged arrays back to /editedview.
    await saveNoticeboardEdited(state.caseIntID, user.uuid, filenames, data);
    setMessage("Noticeboard saved to server.", false);
    return true;
  } catch (err) {
    console.error("Noticeboard server save failed", err);
    setMessage("Saved locally. Server save failed.", true);
    return false;
  } finally {
    editedViewSaveInFlight = false;
  }
}

async function hydrateNoticeboardFromServer() {
  const user = getLoggedInUser();
  console.log("[noticeboard] hydrate start", { hasUser: !!user?.uuid, caseIntID: state.caseIntID });
  if (!user?.uuid || !state.caseIntID) {
    console.warn("[noticeboard] hydrate skipped — missing user.uuid or state.caseIntID");
    return false;
  }

  try {
    const editedRaw = await fetchNoticeboardEdited(state.caseIntID, user.uuid);
    console.log("[noticeboard] editedview/get raw response:", editedRaw);
    const editedRow = normalizeApiRow(editedRaw);
    console.log("[noticeboard] normalized row:", editedRow);

    const { instructions: srvInst, viewcaptures: srvVc } = buildServerEntries(editedRow);
    console.log(
      `[noticeboard] from server blob: ${srvInst.length} instruction(s), ${srvVc.length} viewcapture(s)`,
      { instructions: srvInst, viewcaptures: srvVc }
    );
    if (!srvInst.length && !srvVc.length) return false;

    const data = ensureCache();
    // Drop previously-hydrated server items from both buckets before merging
    // the fresh split, so re-routing (e.g. an item that used to land in
    // instructions but now belongs in viewcaptures) doesn't leave a duplicate.
    const keepLocal = (it) => it && it.source !== "server";
    data.instructions = mergeInstructions((data.instructions || []).filter(keepLocal), srvInst);
    data.viewcaptures = mergeInstructions((data.viewcaptures || []).filter(keepLocal), srvVc);

    saveData(data);
    renderGrids();
    setMessage("Loaded previous noticeboard from server.", false);
    return true;
  } catch (err) {
    console.error("Noticeboard hydrate failed", err);
    setMessage("Using local noticeboard cache.", true);
    return false;
  }
}


// In-memory only — matching the legacy 2Dannotation.js approach. The server
// (/noticeboard/editedview) is the sole source of truth; nothing is persisted
// to localStorage, so we never have to worry about the ~5 MB quota.
function emptyData() {
  return { instructions: [], viewcaptures: [] };
}

// `saveData` is kept as a no-op so existing call sites don't have to be
// rewritten. The cache is a live object — mutations to it already persist
// for the rest of the session, and the server is updated via
// syncInstructionsToEditedView when items are added or edited.
function saveData(_data) {
  /* intentionally empty — see emptyData() comment above */
}

let cache = null;

function getModal() {
  return document.getElementById("noticeboardModal");
}

function ensureCache() {
  if (!cache) cache = emptyData();
  return cache;
}

function renderGrid(elId, items, kind) {
  const grid = document.getElementById(elId);
  if (!grid) return;
  grid.innerHTML = "";
  items.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "noticeboard-thumb-card";
    card.setAttribute("role", "listitem");

    if (item.preview) {
      const img = document.createElement("img");
      img.src = item.preview;
      img.alt = item.title || `${kind} ${idx + 1}`;
      card.appendChild(img);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "noticeboard-add-card-placeholder";
      placeholder.textContent = item.title || `${kind} ${idx + 1}`;
      card.appendChild(placeholder);
    }

    // Dedicated preview (eye) icon — only when the item actually has an image.
    if (item.preview) {
      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.className = "noticeboard-thumb-preview";
      previewBtn.setAttribute("aria-label", "Preview");
      previewBtn.title = "Preview";
      previewBtn.innerHTML = '<i class="fa-regular fa-eye" aria-hidden="true"></i>';
      previewBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openPreview(items, idx);
      });
      card.appendChild(previewBtn);
    }

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "noticeboard-thumb-edit";
    editBtn.setAttribute("aria-label", "Edit or delete");
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openThumbActionMenu(editBtn, items, idx, kind);
    });
    card.appendChild(editBtn);
    grid.appendChild(card);
  });
}

// ============ preview lightbox ============
let previewState = null;

function ensurePreviewModal() {
  let modal = document.getElementById("noticeboardPreviewModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "noticeboardPreviewModal";
  modal.className = "noticeboard-preview-modal is-hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <div class="noticeboard-preview-backdrop" data-preview-close></div>
    <div class="noticeboard-preview-frame">
      <button class="noticeboard-preview-close" type="button" aria-label="Close preview" data-preview-close>&times;</button>
      <button class="noticeboard-preview-nav noticeboard-preview-prev" type="button" aria-label="Previous">&#8249;</button>
      <img class="noticeboard-preview-img" alt="" />
      <button class="noticeboard-preview-nav noticeboard-preview-next" type="button" aria-label="Next">&#8250;</button>
      <div class="noticeboard-preview-caption"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-preview-close]").forEach((el) =>
    el.addEventListener("click", closePreview)
  );
  modal.querySelector(".noticeboard-preview-prev").addEventListener("click", () => navigatePreview(-1));
  modal.querySelector(".noticeboard-preview-next").addEventListener("click", () => navigatePreview(1));
  return modal;
}

function openPreview(items, startIdx) {
  const previewable = (Array.isArray(items) ? items : [])
    .map((item, i) => ({ item, originalIdx: i }))
    .filter(({ item }) => item && typeof item.preview === "string" && item.preview);
  if (!previewable.length) return;

  let cur = previewable.findIndex(({ originalIdx }) => originalIdx === startIdx);
  if (cur === -1) cur = 0;

  previewState = { items: previewable, idx: cur };
  const modal = ensurePreviewModal();
  modal.classList.remove("is-hidden");
  document.addEventListener("keydown", onPreviewKeydown);
  renderCurrentPreview();
}

function navigatePreview(delta) {
  if (!previewState) return;
  const n = previewState.items.length;
  previewState.idx = (previewState.idx + delta + n) % n;
  renderCurrentPreview();
}

function renderCurrentPreview() {
  if (!previewState) return;
  const modal = document.getElementById("noticeboardPreviewModal");
  if (!modal) return;
  const { item } = previewState.items[previewState.idx];
  const img = modal.querySelector(".noticeboard-preview-img");
  const cap = modal.querySelector(".noticeboard-preview-caption");
  img.src = item.preview;
  img.alt = item.title || "";
  const total = previewState.items.length;
  cap.textContent = total > 1
    ? `${item.title || ""} · ${previewState.idx + 1} / ${total}`
    : item.title || "";
  const showNav = total > 1;
  modal.querySelector(".noticeboard-preview-prev").style.visibility = showNav ? "" : "hidden";
  modal.querySelector(".noticeboard-preview-next").style.visibility = showNav ? "" : "hidden";
}

function closePreview() {
  const modal = document.getElementById("noticeboardPreviewModal");
  if (modal) modal.classList.add("is-hidden");
  document.removeEventListener("keydown", onPreviewKeydown);
  previewState = null;
}

function onPreviewKeydown(e) {
  if (e.key === "Escape") { e.preventDefault(); closePreview(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); navigatePreview(-1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); navigatePreview(1); }
}

let openMenu = null;

function closeThumbActionMenu() {
  if (!openMenu) return;
  openMenu.remove();
  openMenu = null;
  document.removeEventListener("mousedown", onDocClickForMenu, true);
  document.removeEventListener("keydown", onKeydownForMenu, true);
}

function onDocClickForMenu(e) {
  if (openMenu && !openMenu.contains(e.target)) {
    closeThumbActionMenu();
  }
}

function onKeydownForMenu(e) {
  if (e.key === "Escape") closeThumbActionMenu();
}

function openThumbActionMenu(anchor, items, idx, kind) {
  closeThumbActionMenu();
  const menu = document.createElement("div");
  menu.className = "noticeboard-thumb-menu";
  menu.setAttribute("role", "menu");

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "noticeboard-thumb-menu-item";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeThumbActionMenu();
    const item = items[idx];
    if (!item) return;
    const result = await openInstructionEditor({
      initialImage: item.baseImage || item.preview,
      initialStrokes: Array.isArray(item.strokes) ? item.strokes : [],
    });
    if (!result) return;
    item.preview = result.dataUrl;
    item.strokes = result.strokes;
    // Legacy/server items had no separate baseImage; treat the (then-flat)
    // preview as the base so re-edits keep the original behind any new strokes.
    if (!item.baseImage) item.baseImage = item.preview;
    item.updatedAt = new Date().toISOString();
    // Once a server item is edited locally, it's no longer a pure server
    // mirror — clear the marker so the next hydrate doesn't wipe it out.
    if (item.source === "server") delete item.source;
    saveData(cache);
    const synced = await syncInstructionsToEditedView();
    renderGrids();
    if (!synced) {
      setMessage(
        kind === "instruction" ? "Instruction updated locally." : "Viewcapture updated locally.",
        false
      );
    }
  });
  menu.appendChild(editBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "noticeboard-thumb-menu-item noticeboard-thumb-menu-item-danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeThumbActionMenu();
    items.splice(idx, 1);
    saveData(cache);
    renderGrids();
    setMessage(`${kind === "instruction" ? "Instruction" : "Viewcapture"} deleted.`, false);
    // Without syncing, the server's editedview blob still contains the item
    // and the next hydrate will resurrect it.
    await syncInstructionsToEditedView();
  });
  menu.appendChild(deleteBtn);

  document.body.appendChild(menu);
  openMenu = menu;

  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let left = rect.right - menuRect.width;
  let top = rect.top - menuRect.height - 6;
  if (top < 8) top = rect.bottom + 6;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;

  setTimeout(() => {
    document.addEventListener("mousedown", onDocClickForMenu, true);
    document.addEventListener("keydown", onKeydownForMenu, true);
  }, 0);
}

function renderGrids() {
  const data = ensureCache();
  renderGrid("instructionGrid", data.instructions, "instruction");
  renderGrid("viewcaptureGrid", data.viewcaptures, "viewcapture");
  refreshAddInstructionPreview();
  refreshAddViewcapturePreview();
}

async function refreshAddInstructionPreview() {
  const previewImg = document.getElementById("addInstructionPreview");
  if (!previewImg) return;
  try {
    const dataUrl = await captureJawJpegDataUrl(0.7);
    if (dataUrl) {
      previewImg.src = dataUrl;
    } else {
      previewImg.removeAttribute("src");
    }
  } catch {
    previewImg.removeAttribute("src");
  }
}

// The 3D panel is usually a WebGL canvas (preview3D.js) — capture it. If that's
// not active, fall back to the static <img id="previewImage">. Shared by the
// add-viewcapture flow and its add-card preview thumbnail.
function capture3DOrFallbackDataUrl() {
  let src = capture3DPreviewDataUrl();
  if (!src) {
    const fallback = document.getElementById("previewImage");
    if (fallback && fallback.style.display !== "none") {
      src = fallback.currentSrc || fallback.src || "";
    }
  }
  return src;
}

function refreshAddViewcapturePreview() {
  const previewImg = document.getElementById("addViewcapturePreview");
  if (!previewImg) return;
  const src = capture3DOrFallbackDataUrl();
  if (src) previewImg.src = src;
  else previewImg.removeAttribute("src");
}

// Shared add flow for both noticeboard columns: grab a base image, open the
// instruction editor on it, then push the result into the given bucket and
// sync to the server. `captureBaseImage` may be sync or async.
async function addBoardItem({ bucket, idPrefix, titlePrefix, captureBaseImage }) {
  setMessage("Opening instruction editor…", false);
  const baseImage = await captureBaseImage();
  const caseLabelText =
    document.getElementById("caseLabel")?.textContent?.trim() || "";
  const result = await openInstructionEditor({
    initialImage: baseImage,
    caseLabel: caseLabelText,
  });
  if (!result) {
    setMessage("Instruction discarded.", false);
    return;
  }
  const data = ensureCache();
  const list = data[bucket];
  list.push({
    id: `${idPrefix}_${Date.now()}`,
    title: `${titlePrefix} ${list.length + 1}`,
    baseImage,
    strokes: result.strokes,
    preview: result.dataUrl,
    createdAt: new Date().toISOString(),
  });
  saveData(data);
  const synced = await syncInstructionsToEditedView();
  renderGrids();
  if (!synced) setMessage(`${titlePrefix} added locally.`, false);
}

function addInstruction() {
  return addBoardItem({
    bucket: "instructions",
    idPrefix: "inst",
    titlePrefix: "Instruction",
    captureBaseImage: () => captureJawJpegDataUrl(0.92),
  });
}

function addViewcapture() {
  return addBoardItem({
    bucket: "viewcaptures",
    idPrefix: "vc",
    titlePrefix: "Viewcapture",
    captureBaseImage: capture3DOrFallbackDataUrl,
  });
}

export function addViewcaptureFromImage(dataUrl) {
  if (!dataUrl) {
    setMessage("Capture failed: empty image.", true);
    return false;
  }
  const data = ensureCache();
  data.viewcaptures.push({
    id: `vc_${Date.now()}`,
    title: `Viewcapture ${data.viewcaptures.length + 1}`,
    preview: dataUrl,
    createdAt: new Date().toISOString(),
  });
  saveData(data);
  renderGrids();
  setMessage("3D screenshot added to noticeboard.", false);
  return true;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function buildReportToothHtml(toothId, assetBase, note) {
  const { id, mirrored } = sourceToothFor(toothId);
  const baseStatus = statusFor(toothId);
  const isUpper = toothId >= 11 && toothId <= 28;
  const mirrorClass = mirrored ? " is-mirrored" : "";

  // Mirror the clinical-info chart: a tooth flagged missing in the clinical
  // notes (note.present === false, e.g. desktop ToothPresence=1) renders as
  // missing — i.e. gets the cross — even when the base annotation status isn't.
  let effectiveStatus = baseStatus;
  if (note && note.present === false) effectiveStatus = "missing";
  if (note?.abutment) effectiveStatus = "abutment";

  // Root stump: keep the crown but render it solid black with a white "RS"
  // label over it (mirrors the clinical-info chart behavior).
  const isRootStump = !!note?.rootStump;

  let body;
  if (effectiveStatus === "abutment") {
    body = `<img class="cli-tooth-img cli-tooth-full${mirrorClass}" src="${assetBase}/${id}_Abutment.svg" alt="" />`;
  } else {
    const crownSrc = note?.cracked ? `${id}_Cracked.svg` : `${id}_Crown.svg`;
    const rootSrc = note?.implant
      ? `${id}_Implant.svg`
      : note?.rct
      ? `${id}_RCT.svg`
      : `${id}_Root.svg`;
    const rootReplaced = !!(note?.implant || note?.rct);
    const mobilityTint = rootReplaced
      ? ""
      : note?.mobility === "1"
      ? "is-tint-green"
      : note?.mobility === "2"
      ? "is-tint-yellow"
      : note?.mobility === "3"
      ? "is-tint-red"
      : "";

    const crownExtra =
      (!note?.cracked && note?.crown ? " is-tint-yellow" : "") +
      (isRootStump ? " is-tint-black" : "");
    const rootExtra = mobilityTint ? ` ${mobilityTint}` : "";

    const crown = `<img class="cli-tooth-img cli-tooth-crown${mirrorClass}${crownExtra}" src="${assetBase}/${crownSrc}" alt="" />`;
    const root = `<img class="cli-tooth-img cli-tooth-root${mirrorClass}${rootExtra}" src="${assetBase}/${rootSrc}" alt="" />`;
    const stack = isUpper
      ? `<div class="cli-tooth-stack">${root}${crown}</div>`
      : `<div class="cli-tooth-stack">${crown}${root}</div>`;
    const cross = effectiveStatus === "missing" ? `<span class="cli-tooth-cross"></span>` : "";
    body = `${stack}${cross}`;
  }

  // Overlay markers (above the body).
  const overlays = [];
  if (note?.tilted) {
    overlays.push(
      `<span class="cli-tooth-tilt cli-tooth-tilt--${note.tilted}">${escapeHtml(
        tiltArrowFor(note.tilted, toothId)
      )}</span>`
    );
  }
  if (note?.restoration && !note.cracked && !isRootStump) {
    overlays.push(
      `<span class="cli-tooth-restoration is-${String(note.restoration).toLowerCase()}"></span>`
    );
  }
  if (isRootStump && effectiveStatus !== "abutment") {
    overlays.push(`<span class="cli-tooth-rootstump-label">RS</span>`);
  }
  if (note?.extraction) {
    overlays.push(
      `<span class="cli-tooth-extraction-arrow">${isUpper ? "↓↓" : "↑↑"}</span>`
    );
  }

  const jawClass = isUpper ? " is-upper" : " is-lower";
  return `
    <div class="cli-tooth is-${effectiveStatus}${jawClass}">
      <div class="cli-tooth-number">${toothId}</div>
      ${overlays.join("")}
      <div class="cli-tooth-img-wrap">${body}</div>
    </div>`;
}

function buildReportRowHtml(teeth, assetBase, notes) {
  return teeth.map((id) => buildReportToothHtml(id, assetBase, notes[id])).join("");
}

function buildReportLegendHtml(assetBase) {
  return `
    <div class="cli-legend-grid">
      <div class="cli-legend-item cli-legend-row-item">
        <span class="cli-legend-text">MOBILITY</span>
        <div class="cli-legend-cluster">
          <img class="cli-legend-img" src="${assetBase}/mobility.png" alt="" />
          <span class="cli-mob cli-mob-1">I</span>
          <span class="cli-mob cli-mob-2">II</span>
          <span class="cli-mob cli-mob-3">III</span>
          <span class="cli-legend-text cli-legend-sub">CLEAR</span>
        </div>
      </div>
      <div class="cli-legend-item">
        <span class="cli-legend-text">ROOT CANAL THERAPY</span>
        <img class="cli-legend-img" src="${assetBase}/root_canal.png" alt="" />
      </div>
      <div class="cli-legend-item cli-legend-row-item">
        <span class="cli-legend-text">RESTORATION</span>
        <div class="cli-legend-cluster">
          <img class="cli-legend-img" src="${assetBase}/filling.png" alt="" />
          <span class="cli-legend-text cli-legend-sub">AR</span>
          <span class="cli-legend-text cli-legend-sub">TCR</span>
          <span class="cli-legend-text cli-legend-sub">INLAY</span>
          <span class="cli-legend-text cli-legend-sub">ONLAY</span>
        </div>
      </div>
      <div class="cli-legend-item">
        <span class="cli-legend-text">CROWN</span>
        <img class="cli-legend-img" src="${assetBase}/crown.png" alt="" />
      </div>
      <div class="cli-legend-item">
        <span class="cli-legend-text">IMPLANT</span>
        <img class="cli-legend-img" src="${assetBase}/implant.png" alt="" />
      </div>
      <div class="cli-legend-item">
        <span class="cli-legend-text">ROOT STUMP</span>
        <img class="cli-legend-img" src="${assetBase}/root_stump.png" alt="" />
      </div>
      <div class="cli-legend-item">
        <span class="cli-legend-text">CRACKED</span>
        <img class="cli-legend-img" src="${assetBase}/cracked.png" alt="" />
      </div>
      <div class="cli-legend-item cli-legend-row-item">
        <span class="cli-legend-text">TILTED TOOTH</span>
        <div class="cli-legend-cluster">
          <img class="cli-legend-img" src="${assetBase}/tilted.png" alt="" />
          <span class="cli-legend-text cli-legend-sub">M</span>
          <span class="cli-legend-text cli-legend-sub">D</span>
          <span class="cli-legend-text cli-legend-sub">B</span>
          <span class="cli-legend-text cli-legend-sub">L</span>
          <span class="cli-legend-text cli-legend-sub">A</span>
          <span class="cli-legend-text cli-legend-sub">SE</span>
        </div>
      </div>
      <div class="cli-legend-item">
        <span class="cli-legend-text">EXTRACTION</span>
        <img class="cli-legend-img" src="${assetBase}/extraction.png" alt="" />
      </div>
      <div class="cli-legend-item">
        <span class="cli-legend-text">ABUTMENT</span>
        <img class="cli-legend-img" src="${assetBase}/abutment.png" alt="" />
      </div>
    </div>`;
}

function reportFieldRow(label, value) {
  return `<div class="cli-field"><span class="cli-field-label">${escapeHtml(label)} :</span><span class="cli-field-value">${escapeHtml(value || "")}</span></div>`;
}

// Crop the uniform white border around an image so the actual content fills
// the frame. Editor previews are exported at the editor's aspect ratio and
// letterbox the design, leaving it small once placed on the report page.
// Returns the original data URL unchanged if nothing meaningful can be cropped.
function trimImageMargins(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) {
      resolve("");
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          resolve(dataUrl);
          return;
        }
        const src = document.createElement("canvas");
        src.width = w;
        src.height = h;
        const sctx = src.getContext("2d");
        sctx.drawImage(img, 0, 0);
        const { data } = sctx.getImageData(0, 0, w, h);
        // A pixel counts as content if it's visible and not near-white (the
        // 244 threshold tolerates JPEG noise in the white background).
        const isContent = (x, y) => {
          const i = (y * w + x) * 4;
          if (data[i + 3] < 16) return false;
          return data[i] < 244 || data[i + 1] < 244 || data[i + 2] < 244;
        };
        let top = 0;
        let bottom = h - 1;
        let left = 0;
        let right = w - 1;
        const rowHas = (y) => {
          for (let x = 0; x < w; x += 1) if (isContent(x, y)) return true;
          return false;
        };
        const colHas = (x) => {
          for (let y = top; y <= bottom; y += 1) if (isContent(x, y)) return true;
          return false;
        };
        while (top < bottom && !rowHas(top)) top += 1;
        while (bottom > top && !rowHas(bottom)) bottom -= 1;
        while (left < right && !colHas(left)) left += 1;
        while (right > left && !colHas(right)) right -= 1;
        const cw = right - left + 1;
        const ch = bottom - top + 1;
        // Nothing worth cropping (blank image or already tight).
        if (cw < 8 || ch < 8 || (cw === w && ch === h)) {
          resolve(dataUrl);
          return;
        }
        const pad = Math.round(Math.min(cw, ch) * 0.02);
        const ox = Math.max(0, left - pad);
        const oy = Math.max(0, top - pad);
        const ow = Math.min(w - ox, cw + pad * 2);
        const oh = Math.min(h - oy, ch + pad * 2);
        const out = document.createElement("canvas");
        out.width = ow;
        out.height = oh;
        const octx = out.getContext("2d");
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, ow, oh);
        octx.drawImage(src, ox, oy, ow, oh, 0, 0, ow, oh);
        resolve(out.toDataURL("image/png"));
      } catch (err) {
        console.warn("trimImageMargins failed", err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function generateReport() {
  // Prefer the full "UID {id}:{name}" label rendered in the topbar so the
  // report matches what the user sees on screen.
  const topbarLabelEl = document.getElementById("caseLabel");
  const topbarLabel = (topbarLabelEl?.textContent || "").replace(/^Case:\s*/i, "").trim();
  const caseLabel = topbarLabel || (state.caseIntID ?? "Unknown");
  const assetBase = new URL("../../assets/clinicalInfo", window.location.href).href;
  const creationDate = new Date().toLocaleString("sv-SE").replace("T", " ").slice(0, 19);
  const caseNote = loadCaseNote(state.caseIntID);
  const ownerName = state.caseOwner || caseNote.caseOwner || "";
  const workCategoryLabel =
    WORK_CATEGORY_LABELS[caseNote.workCategory] || caseNote.workCategory || "";

  // The report mirrors the noticeboard's saved edits: the 2D page shows the
  // most recent instruction (2D_*) and the 3D page shows the most recent
  // viewcapture (3D_*) — each item's edited .preview image.
  const boardData = ensureCache();
  const lastInstruction = (boardData.instructions || []).at(-1);
  const lastViewcapture = (boardData.viewcaptures || []).at(-1);
  // The previews are exported at the editor's on-screen aspect ratio, which
  // letterboxes the design with wide white margins. Trim those margins so the
  // design itself — not the padding — fills the report page.
  const [jaw2dSrc, previewSrc] = await Promise.all([
    trimImageMargins(lastInstruction?.preview || ""),
    trimImageMargins(lastViewcapture?.preview || ""),
  ]);

  const notes = await getClinicalNotesForCase(state.caseIntID);
  const upperRow = buildReportRowHtml(UPPER_TEETH, assetBase, notes);
  const lowerRow = buildReportRowHtml(LOWER_TEETH, assetBase, notes);
  const legend = buildReportLegendHtml(assetBase);

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>SmartRPD Report — Case ${escapeHtml(caseLabel)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", "Montserrat", sans-serif; color: #2f3b46; margin: 0; padding: 28px; }
  img { image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; }
  .cli-page { page-break-after: always; }
  .cli-page:last-child { page-break-after: auto; }
  .cli-meta { display: grid; grid-template-columns: 1fr 1fr; row-gap: 14px; column-gap: 32px; margin-bottom: 28px; }
  .cli-field { font-size: 0.95rem; }
  .cli-field-label { color: #4a5663; margin-right: 6px; }
  .cli-field-value { color: #2f3b46; font-weight: 500; }
  .cli-field.cli-field-creation .cli-field-value { color: #b0341c; font-weight: 600; }

  .cli-chart { display: flex; flex-direction: column; gap: 6px; margin-top: 18px; }
  .cli-chart-label { text-align: center; font-weight: 700; letter-spacing: 0.12em; font-size: 0.78rem; color: #2aa67c; }
  .cli-row { display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; }

  .cli-tooth { position: relative; display: flex; flex-direction: column; align-items: center; background: #fafafa; border: 1px solid #e1e4e8; border-radius: 4px; padding: 3px 1px; min-height: 108px; }
  .cli-tooth-number { font-size: 0.62rem; color: #2a3340; font-weight: 600; margin-bottom: 1px; }
  .cli-tooth-img-wrap { position: relative; flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .cli-tooth-stack { display: flex; flex-direction: column; align-items: center; line-height: 0; }
  .cli-tooth-img { max-width: 100%; object-fit: contain; display: block; }
  .cli-tooth-crown { max-height: 34px; }
  .cli-tooth-root { max-height: 60px; }
  .cli-tooth-full { max-height: 96px; }
  .cli-tooth-img.is-mirrored { transform: scaleX(-1); }
  .cli-tooth-cross { position: absolute; inset: 0; pointer-events: none; }
  .cli-tooth-cross::before, .cli-tooth-cross::after { content: ""; position: absolute; left: 50%; top: 50%; width: 260%; height: 3px; background: #b0341c; transform-origin: center; border-radius: 2px; }
  .cli-tooth-cross::before { transform: translate(-50%, -50%) rotate(72deg); }
  .cli-tooth-cross::after { transform: translate(-50%, -50%) rotate(-72deg); }

  .cli-tooth-img.is-hidden { visibility: hidden; height: 0 !important; max-height: 0 !important; }
  .cli-tooth-img.is-tint-yellow { filter: brightness(0) saturate(100%) invert(72%) sepia(85%) saturate(2200%) hue-rotate(2deg) brightness(105%) contrast(105%); }
  .cli-tooth-img.is-tint-red { filter: brightness(0) saturate(100%) invert(22%) sepia(99%) saturate(6000%) hue-rotate(355deg) brightness(95%) contrast(105%); }
  .cli-tooth-img.is-tint-green { filter: brightness(0) saturate(100%) invert(45%) sepia(85%) saturate(2500%) hue-rotate(105deg) brightness(95%) contrast(105%); }
  .cli-tooth-img.is-tint-black { filter: brightness(0); }
  .cli-tooth-rootstump-label { position: absolute; left: 50%; transform: translateX(-50%); color: #fff; font-weight: 800; font-size: 0.7rem; line-height: 1; letter-spacing: 0.5px; z-index: 3; pointer-events: none; }
  .cli-tooth.is-upper .cli-tooth-rootstump-label { bottom: 22%; }
  .cli-tooth.is-lower .cli-tooth-rootstump-label { top: 26%; }

  .cli-tooth-tilt { position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.4rem; font-weight: 900; color: #1f8a6b !important; padding: 2px 6px; border-radius: 6px; z-index: 3; line-height: 1; pointer-events: none; }
  .cli-tooth.is-upper .cli-tooth-tilt { bottom: 30px; }
  .cli-tooth.is-lower .cli-tooth-tilt { top: 38px; }
  .cli-tooth-tilt--SE { font-size: 0.7rem; padding: 2px 5px; }

  .cli-tooth-extraction-arrow { position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.1rem; color: #3BAE95 !important; padding: 0 4px; border-radius: 4px; font-weight: 900; letter-spacing: -1px; z-index: 3; line-height: 1.1; pointer-events: none; }
  .cli-tooth.is-upper .cli-tooth-extraction-arrow { bottom: -2px; }
  .cli-tooth.is-lower .cli-tooth-extraction-arrow { top: 0px; }

  .cli-tooth-restoration { position: absolute; left: 50%; transform: translateX(-50%); z-index: 2; pointer-events: none; }
  .cli-tooth.is-upper .cli-tooth-restoration { bottom: 22%; }
  .cli-tooth.is-lower .cli-tooth-restoration { top: 26%; }
  .cli-tooth-restoration.is-ar { width: 10px; height: 10px; background: #888a8f; border-radius: 50%; }
  .cli-tooth-restoration.is-tcr { width: 10px; height: 10px; background: cyan; border-radius: 50%; }
  .cli-tooth-restoration.is-inlay { width: 12px; height: 7px; background: #2563eb; border-radius: 2px; }
  .cli-tooth-restoration.is-onlay { width: 12px; height: 7px; background: #b8860b; border-radius: 2px; }

  .cli-legend-title { color: #2aa67c; letter-spacing: 0.1em; font-weight: 700; font-size: 0.85rem; margin: 24px 0 8px; }
  .cli-legend-grid { display: flex; flex-wrap: wrap; row-gap: 14px; column-gap: 18px; align-items: flex-end; }
  .cli-legend-item { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 36px; }
  .cli-legend-row-item { align-items: flex-start; }
  .cli-legend-cluster { display: flex; gap: 6px; align-items: flex-end; }
  .cli-legend-text { font-size: 0.62rem; font-weight: 700; color: #2a3340; text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; }
  .cli-legend-sub { align-self: flex-end; padding-bottom: 4px; }
  .cli-legend-img { height: 28px; max-width: 34px; object-fit: contain; display: block; }
  .cli-mob { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; color: #fff; }
  .cli-mob-1 { background: #4caf50; }
  .cli-mob-2 { background: #f6c344; color: #3a2c00; }
  .cli-mob-3 { background: #c0392b; }

  .cli-3d-page { display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; height: 100vh; gap: 12px; overflow: hidden; }
  .cli-3d-page > img { flex: 1 1 auto; min-height: 0; width: 100%; max-width: 100%; object-fit: contain; image-rendering: auto; align-self: center; }
  .cli-3d-page .cli-empty { color: #8895a4; font-style: italic; align-self: center; margin: auto 0; }
  .cli-page-caseid { font-size: 1rem; font-weight: 700; color: #2aa67c; letter-spacing: 0.05em; }

  @media print {
    body { padding: 14px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cli-row { gap: 2px; }
    .cli-tooth, .cli-tooth-cross::before, .cli-tooth-cross::after,
    .cli-tooth-restoration, .cli-tooth-extraction-arrow, .cli-tooth-tilt,
    .cli-tooth-rootstump-label {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style></head>
<body>
  ${(() => {
    const metaHtml = `
    <div class="cli-meta">
      ${reportFieldRow("Customer", ownerName)}
      ${reportFieldRow("Creation Date", creationDate).replace("cli-field", "cli-field cli-field-creation")}
      ${reportFieldRow("Case Number", caseLabel)}
      ${reportFieldRow("Date Required", caseNote.dateRequired || "")}
      ${reportFieldRow("Tooth Shade", caseNote.toothShade || "")}
      ${reportFieldRow("Work Category", workCategoryLabel)}
    </div>`;
    return `
  <section class="cli-page">
    ${metaHtml}

    <section class="cli-chart">
      <div class="cli-chart-label">BUCCAL</div>
      <div class="cli-row">${upperRow}</div>
      <div class="cli-chart-label">LINGUAL</div>
      <div class="cli-row">${lowerRow}</div>
      <div class="cli-chart-label">BUCCAL</div>
    </section>

    <div class="cli-legend-title">LEGEND</div>
    ${legend}

    <div class="cli-field" style="margin-top:18px;">
      <span class="cli-field-label">Additional Comments :</span>
      <span class="cli-field-value" style="white-space:pre-wrap;">${escapeHtml(caseNote.comment || "")}</span>
    </div>
  </section>

  <section class="cli-page cli-3d-page">
    ${metaHtml}
    ${jaw2dSrc ? `<img src="${jaw2dSrc}" alt="2D design" />` : `<div class="cli-empty">No 2D design available.</div>`}
  </section>

  <section class="cli-page cli-3d-page">
    ${metaHtml}
    ${previewSrc ? `<img src="${escapeHtml(previewSrc)}" alt="3D preview" />` : `<div class="cli-empty">No 3D preview available.</div>`}
  </section>`;
  })()}

  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 400));<\/script>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    setMessage("Please allow pop-ups to generate the report.", true);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function openNoticeboard() {
  const modal = getModal();
  if (!modal) return;
  ensureCache();
  renderGrids();
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
  // Re-fetch from server every time the panel opens so newly saved
  // instructions from other sessions/devices show up without a reload.
  hydrateNoticeboardFromServer();
}

export function closeNoticeboard() {
  const modal = getModal();
  if (!modal) return;
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
}

function bindTabSwitching() {
  const tabs = document.querySelectorAll("[data-noticeboard-tab]");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
    });
  });
}

export function initNoticeboard() {
  ensureCache();
  renderGrids();
  document.getElementById("openNoticeboardBtn")?.addEventListener("click", openNoticeboard);
  document.getElementById("noticeboardCloseBtn")?.addEventListener("click", closeNoticeboard);
  document
    .getElementById("noticeboardModal")
    ?.querySelector(".noticeboard-backdrop")
    ?.addEventListener("click", closeNoticeboard);
  document
    .getElementById("noticeboardGenerateReportBtn")
    ?.addEventListener("click", generateReport);
  document.getElementById("addInstructionBtn")?.addEventListener("click", addInstruction);
  document.getElementById("addViewcaptureBtn")?.addEventListener("click", addViewcapture);
  document.getElementById("downloadJawProfileBtn")?.addEventListener("click", () => {
    document.getElementById("saveAnnotationBtn")?.click();
  });
  document.getElementById("drawFromScratchModalBtn")?.addEventListener("click", () => {
    closeNoticeboard();
    document.getElementById("drawFromScratchBtn")?.click();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !getModal()?.classList.contains("is-hidden")) {
      closeNoticeboard();
    }
  });
  bindTabSwitching();
  hydrateNoticeboardFromServer();
}
