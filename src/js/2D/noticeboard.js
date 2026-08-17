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
import { WORK_CATEGORY_LABELS, loadCaseNote, fetchAdditionalCaseDetails } from "./caseNote.js";
import { statusLabel } from "../shared/apiLog.js";
import {
  encodeEditedViewColumns,
  extractFilenamesFromBinaryFormatter,
  extractPngsFromBinaryFormatter,
} from "./dotnetBinaryFormatter.js";
import { resolveToothArtSources } from "./toothUtils.js";
import { API_BASE, MACHINE_ID, getLoggedInUser } from "../shared/api.js";

//Add constants

// Dedupe local + server items by stable key (title -> id -> preview): server fields win
// on collision, local-only fields survive. Pure and exported so the unit test drives it.
export function mergeInstructions(localItems, serverItems) {
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

// A "guest" reached this page via a shared link with no uuid. They can't write to the
// server, so their noticeboard mirrors to localStorage instead. See openNoticeboard().
function isGuest(){
  return !getLoggedInUser()?.uuid;
}

// sessionStorage flag: the guest already chose "Continue as guest" this tab
// session, so don't re-prompt on every noticeboard open.
const GUEST_ACK_KEY = "noticeboardGuestAck";

// Per-case localStorage key holding a guest's in-memory noticeboard cache so
// their instructions survive a reload (logged-in users use the server blob).
function guestStorageKey(){
  return state.caseIntID ? `noticeboardGuest_${state.caseIntID}` : null;
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
  // MUST be the desktop's .NET BinaryFormatter byte[][] layout: plain JSON here made
  // desktop login fail to parse, empty the noticeboard and overwrite web uploads.
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

// Merge local filename/data arrays over the server's: local wins by filename, server-only
// entries survive so a save can't delete what another session or desktop wrote.
function mergeCaptureArrays(localFilenames, localData, serverRow) {
  const server = readEditedViewArrays(serverRow);
  const filenames = [...localFilenames];
  const data = [...localData];
  const seen = new Set(filenames);
  for (let i = 0; i < server.filenames.length; i += 1) {
    const name = server.filenames[i];
    if (!name || seen.has(name)) continue;
    filenames.push(name);
    data.push(server.data[i] || "");
    seen.add(name);
  }
  return { filenames, data };
}

// Create POST for a capture table (view_capture, /noticeboard/view); columns use the
// desktop's .NET BinaryFormatter byte[][] layout. Throws on non-2xx so callers continue.
async function postNoticeboardCapture(createPath, caseIntID, uuid, filenames, data) {
  // Same desktop .NET BinaryFormatter byte[][] layout as editedview, so the
  // view_capture table is desktop-readable too.
  const { filenames: filenamesBlob, data: dataBlob } =
    await encodeEditedViewColumns(filenames, data);
  const payload = [
    { machine_id: MACHINE_ID, uuid, caseIntID },
    { case_id: caseIntID, filenames: filenamesBlob, data: dataBlob },
  ];
  const res = await fetch(`${API_BASE}${createPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body = ""; try { body = await res.text(); } catch {}
    throw new Error(`noticeboard ${createPath} save failed: ${res.status} ${body.slice(0, 120)}`);
  }
  return res.json().catch(() => null);
}

// Mirror capture PNGs into view_capture alongside the editedview blob, fetch-merge-save so
// desktop rows survive. Best-effort — editedview stays the read-back source of truth.
async function mirrorCaptureTable(createPath, getPath, caseIntID, uuid, filenames, data) {
  try {
    const existing = await postNoticeboardEndpoint(getPath, noticeboardPayload(caseIntID, uuid));
    const merged = mergeCaptureArrays(filenames, data, normalizeApiRow(existing));
    await postNoticeboardCapture(createPath, caseIntID, uuid, merged.filenames, merged.data);
    console.log(`[noticeboard] ✓ mirrored ${merged.data.length} item(s) → ${createPath}`);
    return true;
  } catch (err) {
    console.warn(`[noticeboard] mirror → ${createPath} failed`, err);
    return false;
  }
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


// Desktop filenames prefix `2D_*` for instructions, `3D_*` (or none) for viewcaptures.
// Anything else defaults to viewcaptures so nothing is silently dropped.
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

// Persisted titles must carry a 2D_/3D_ prefix so the next hydrate routes them back to
// the right bucket. Never double-prefix one that already has it.
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

// Read the server's current editedview filename+data arrays, falling back to the
// BinaryFormatter parser when the response is the desktop's blob rather than JSON.
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

    // 2) Serialize our local buckets (instructions + viewcaptures) with the
    // 2D_/3D_ prefix convention so they round-trip back into the right panel.
    const dataModel = ensureCache();
    const instructions = dataModel.instructions || [];
    const viewcaptures = dataModel.viewcaptures || [];
    const local = serializeForEditedView(instructions, viewcaptures);

    // 3) Merge over the server's editedview arrays (local wins by filename, server-only
    // survives), then 4) POST back — /editedview stays the read-back source of truth.
    const merged = mergeCaptureArrays(local.filenames, local.data, row);
    await saveNoticeboardEdited(state.caseIntID, user.uuid, merged.filenames, merged.data);

    // 5) Mirror BOTH buckets into view_capture — SmartRPD reads its 2D AND 3D slides from
    // that ONE table, classifying by the 2D_/3D_ prefix. One merged idempotent write.
    const all = serializeForEditedView(instructions, viewcaptures);
    await mirrorCaptureTable(
      "/noticeboard/view",
      "/noticeboard/view/get",
      state.caseIntID,
      user.uuid,
      all.filenames,
      all.data
    );

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
    // Drop previously-hydrated server items from both buckets first, so an item that
    // re-routes between them doesn't leave a duplicate behind.
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


// In-memory only: /noticeboard/editedview is the sole source of truth, and nothing hits
// localStorage, so the ~5MB quota never applies.
function emptyData() {
  return { instructions: [], viewcaptures: [] };
}

// A no-op when logged in (the cache is live, the server updated on add/edit). Guests have
// no uuid, so mirror to localStorage per case and their work survives a reload.
function saveData(data) {
  if (!isGuest()) return;
  const key = guestStorageKey();
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        instructions: data?.instructions || [],
        viewcaptures: data?.viewcaptures || [],
      })
    );
  } catch (err) {
    // Most likely the ~5 MB quota (data URLs are large). Keep the in-memory
    // cache working and let the caller's "saved locally" message stand.
    console.warn("[noticeboard] guest localStorage save failed", err);
  }
}

// Guest counterpart to hydrateNoticeboardFromServer: rebuild the cache from the
// per-case localStorage mirror written by saveData.
function hydrateNoticeboardFromLocal() {
  const key = guestStorageKey();
  if (!key) return false;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const data = ensureCache();
    data.instructions = Array.isArray(parsed?.instructions) ? parsed.instructions : [];
    data.viewcaptures = Array.isArray(parsed?.viewcaptures) ? parsed.viewcaptures : [];
    renderGrids();
    return true;
  } catch (err) {
    console.warn("[noticeboard] guest localStorage hydrate failed", err);
    return false;
  }
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
    editBtn.setAttribute("aria-label", "Edit");
    editBtn.title = "Edit";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editInstructionItem(items, idx, kind);
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

// The pencil opens the editor directly, with no Delete: the editedview blob retains items
// and the next hydrate resurrects them, so a delete would never stick.
async function editInstructionItem(items, idx, kind) {
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

// Capture the 3D WebGL canvas when preview3D is active, else fall back to the static
// <img id="previewImage">. Shared by the add-viewcapture flow and its card thumbnail.
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

// Shared add flow for both columns: grab a base image, open the editor on it, push the
// result into the given bucket and sync. `captureBaseImage` may be sync or async.
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

  // Mirrors the clinical-info chart: note.present === false (desktop ToothPresence=1)
  // renders as missing and gets the cross, even when the annotation status doesn't.
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
    const { crownSrc, rootSrc, mobilityTint } = resolveToothArtSources(id, note);

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
        </div>
      </div>
      <div class="cli-legend-item">
        <span class="cli-legend-text">ROOT CANAL THERAPY</span>
        <img class="cli-legend-img" src="${assetBase}/root_canal.png" alt="" />
      </div>
      <div class="cli-legend-item">
        <span class="cli-legend-text">RESTORATION</span>
        <img class="cli-legend-img" src="${assetBase}/filling.png" alt="" />
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
      <div class="cli-legend-item">
        <span class="cli-legend-text">TILTED TOOTH</span>
        <img class="cli-legend-img" src="${assetBase}/tilted.png" alt="" />
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

// Crops the uniform white border so content fills the frame — editor previews export at
// the editor's aspect ratio and letterbox the design. Returns the original if it can't.
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

// Maps the API status to a label + pill colours, mirroring caseManagement.js's unexported
// statusPillClass/statusDisplayText and the --status-* palette in case_list.css.
function reportStatusBadge(apiStatus) {
  const v = apiStatus ? String(apiStatus).toLowerCase().replace(/ /g, "_") : "na";

  // Full status title verbatim from the shared apiLog.js, matching the
  // case list and dashboard.
  const label = statusLabel(apiStatus);

  // Follow statusPillClass's precedence so the color matches the case list.
  let bg = "#e2e8f0";
  let fg = "#475569"; // na (grey)
  if (v === "completed" || v === "delivered") { bg = "#d1fae5"; fg = "#047857"; } // green
  else if (v === "draft") { bg = "#f5f5f4"; fg = "#57534e"; } // draft grey
  else if (v.endsWith("_pending") || v === "pending") { bg = "#fef3c7"; fg = "#92400e"; } // yellow
  else if (v && v !== "na") { bg = "#dbeafe"; fg = "#1e40af"; } // in-progress (blue)

  return { label, bg, fg };
}

// Fetch the report's upper (slot 1) / lower (slot 2) jaw renders. /thumbnails/get returns
// a row per slot (0 = composite 2D); prefer the slot field, else classify by aspect.
async function fetchCaseThumbnailSlots(caseIntID) {
  const user = getLoggedInUser();
  if (!caseIntID || !user?.uuid) return { upper: "", lower: "" };

  const toDataUrl = (d) => {
    if (typeof d !== "string" || !d) return "";
    return d.startsWith("data:") ? d : `data:image/png;base64,${d}`;
  };

  try {
    const res = await fetch(`${API_BASE}/thumbnails/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID },
        // Numeric id, not the case-name string — the backend's admin-path
        // lookup parses this as caseIntID (string names 404 for admins).
        { case_int_id: caseIntID },
      ]),
    });
    if (!res.ok) return { upper: "", lower: "" };
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return { upper: "", lower: "" };

    // Preferred path: the API tags each row with its slot.
    const hasSlot = rows.some((r) => r && r.slot != null);
    if (hasSlot) {
      const bySlot = (n) => rows.find((r) => Number(r?.slot) === n);
      return {
        upper: toDataUrl(bySlot(1)?.data),
        lower: toDataUrl(bySlot(2)?.data),
      };
    }

    // Fallback: no slot field — classify by aspect ratio. 3D renders are
    // landscape (w/h ≥ 1.3); take the first two as upper/lower in order.
    const measure = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ src, landscape: img.width / img.height >= 1.3 });
        img.onerror = () => resolve({ src, landscape: false });
        img.src = src;
      });
    const measured = await Promise.all(
      rows.map((r) => toDataUrl(r?.data)).filter(Boolean).map(measure)
    );
    const threeD = measured.filter((m) => m.landscape).map((m) => m.src);
    return { upper: threeD[0] || "", lower: threeD[1] || "" };
  } catch (err) {
    console.warn("[noticeboard] thumbnail slots fetch failed", err);
    return { upper: "", lower: "" };
  }
}

// Fetch a case's detail row by id (the report needs the case_id string + status
// without relying on the live annotation page's cached fetch).
async function fetchCaseDetailById(caseIntID) {
  const user = getLoggedInUser();
  if (!caseIntID || !user?.uuid) return null;
  try {
    const res = await fetch(`${API_BASE}/case/get/${caseIntID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ machine_id: MACHINE_ID, uuid: user.uuid, caseIntID }]),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn("[noticeboard] case detail fetch failed", err);
    return null;
  }
}

// Pull the newest 2D_* instruction straight from the editedview blob — used when building
// the report off-page (the case-list download), where the local cache is empty.
async function fetchTwoDPreviewSrc(caseIntID) {
  const user = getLoggedInUser();
  if (!caseIntID || !user?.uuid) return "";
  try {
    const row = normalizeApiRow(await fetchNoticeboardEdited(caseIntID, user.uuid));
    const { instructions } = buildServerEntries(row);
    return instructions.at(-1)?.preview || "";
  } catch (err) {
    console.warn("[noticeboard] 2D preview fetch failed", err);
    return "";
  }
}

// Build the standalone report HTML, gathering every input by caseIntID so it works off the
// live page. `twoDPreviewSrc` reuses a loaded design; `autoPrint` adds the print script.
export async function buildReportHtml(
  caseIntID,
  { caseLabel, caseOwner, twoDPreviewSrc, apiStatus, autoPrint = false } = {}
) {
  const assetBase = new URL("../../assets/clinicalInfo", window.location.href).href;
  const creationDate = new Date().toLocaleString("sv-SE").replace("T", " ").slice(0, 19);
  const caseNote = loadCaseNote(caseIntID);
  const ownerName = caseOwner || caseNote.caseOwner || "";
  const workCategoryLabel =
    WORK_CATEGORY_LABELS[caseNote.workCategory] || caseNote.workCategory || "";

  // The "2D Design" panel shows only the newest 2D_* instruction and its edited .preview.
  // The viewcaptures bucket is deliberately NOT used here; no design → placeholder.
  let twoDSrc = twoDPreviewSrc;
  if (twoDSrc == null) twoDSrc = await fetchTwoDPreviewSrc(caseIntID);

  // /case/get/:id doesn't reliably carry new_status, so the badge reads it from
  // additionalcasedetails. Callers already holding it pass `apiStatus` to skip that.
  const [detail, addlRes] = await Promise.all([
    fetchCaseDetailById(caseIntID),
    apiStatus === undefined ? fetchAdditionalCaseDetails(caseIntID) : Promise.resolve(null),
  ]);
  const resolvedStatus =
    apiStatus !== undefined ? apiStatus : addlRes?.detail?.new_status ?? detail?.new_status;
  const status = reportStatusBadge(resolvedStatus);
  const caseIdStr = detail?.case_id ?? caseLabel ?? caseIntID;
  const label =
    caseLabel ||
    (detail?.id != null && detail?.case_id
      ? `${detail.id} : ${detail.case_id}`
      : caseIdStr ?? "Unknown");

  // The 2D preview exports at the editor's aspect ratio and letterboxes the design, so trim
  // the margins. The 3D renders come from thumbnail slots 1 (upper) and 2 (lower).
  const [jaw2dSrc, jaws] = await Promise.all([
    trimImageMargins(twoDSrc),
    fetchCaseThumbnailSlots(caseIntID),
  ]);
  const jaw3dUpper = jaws.upper;
  const jaw3dLower = jaws.lower;

  const notes = await getClinicalNotesForCase(caseIntID);
  const upperRow = buildReportRowHtml(UPPER_TEETH, assetBase, notes);
  const lowerRow = buildReportRowHtml(LOWER_TEETH, assetBase, notes);
  const legend = buildReportLegendHtml(assetBase);
  const printScript = autoPrint
    ? `<script>window.addEventListener("load", () => setTimeout(() => window.print(), 400));<\/script>`
    : "";

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>SmartRPD Report — Case ${escapeHtml(label)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", "Montserrat", sans-serif; color: #2f3b46; margin: 0; padding: 18px; }
  img { image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; }

  .cli-sheet { display: flex; flex-direction: column; }

  .cli-report-title { margin: 0 0 14px; padding-bottom: 10px; border-bottom: 2px solid #2aa67c; text-align: center; font-size: 1.35rem; font-weight: 700; letter-spacing: 0.06em; color: #2aa67c; text-transform: uppercase; }

  .cli-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 12px; }
  .cli-meta { display: grid; grid-template-columns: 1fr 1fr; row-gap: 7px; column-gap: 28px; flex: 1; }
  .cli-field { font-size: 0.82rem; }
  .cli-field-label { color: #4a5663; margin-right: 6px; }
  .cli-field-value { color: #2f3b46; font-weight: 500; }
  .cli-field.cli-field-creation .cli-field-value { color: #b0341c; font-weight: 600; }
  .cli-status-wrap { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
  .cli-status-title { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; color: #2aa67c; text-transform: uppercase; }
  .cli-status { padding: 6px 16px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; text-transform: none; letter-spacing: 0.02em; white-space: nowrap; }

  .cli-chart { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  .cli-chart-label { text-align: center; font-weight: 700; letter-spacing: 0.12em; font-size: 0.72rem; color: #2aa67c; }
  .cli-row { display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; }

  .cli-tooth { position: relative; display: flex; flex-direction: column; align-items: center; background: #fafafa; border: 1px solid #e1e4e8; border-radius: 4px; padding: 2px 1px; min-height: 84px; }
  .cli-tooth-number { font-size: 0.58rem; color: #2a3340; font-weight: 600; margin-bottom: 1px; }
  .cli-tooth-img-wrap { position: relative; flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .cli-tooth-stack { display: flex; flex-direction: column; align-items: center; line-height: 0; }
  .cli-tooth-img { max-width: 100%; object-fit: contain; display: block; }
  .cli-tooth-crown { max-height: 26px; }
  .cli-tooth-root { max-height: 44px; }
  .cli-tooth-full { max-height: 70px; }
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

  .cli-tooth-tilt { position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.2rem; font-weight: 900; color: #1f8a6b !important; padding: 2px 6px; border-radius: 6px; z-index: 3; line-height: 1; pointer-events: none; }
  .cli-tooth.is-upper .cli-tooth-tilt { bottom: 24px; }
  .cli-tooth.is-lower .cli-tooth-tilt { top: 30px; }
  .cli-tooth-tilt--SE { font-size: 0.66rem; padding: 2px 5px; }

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

  .cli-legend-title { color: #2aa67c; letter-spacing: 0.1em; font-weight: 700; font-size: 0.78rem; margin: 12px 0 6px; }
  .cli-legend-grid { display: flex; flex-wrap: wrap; row-gap: 8px; column-gap: 16px; align-items: flex-end; }
  .cli-legend-item { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 34px; }
  .cli-legend-row-item { align-items: flex-start; }
  .cli-legend-cluster { display: flex; gap: 6px; align-items: flex-end; }
  .cli-legend-text { font-size: 0.58rem; font-weight: 700; color: #2a3340; text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; }
  .cli-legend-sub { align-self: flex-end; padding-bottom: 4px; }
  .cli-legend-img { height: 24px; max-width: 30px; object-fit: contain; display: block; }
  .cli-mob { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 4px; font-size: 0.64rem; font-weight: 700; color: #fff; }
  .cli-mob-1 { background: #4caf50; }
  .cli-mob-2 { background: #f6c344; color: #3a2c00; }
  .cli-mob-3 { background: #c0392b; }

  .cli-comment { font-size: 0.82rem; margin: 10px 0 12px; }
  .cli-comment .cli-field-label { color: #4a5663; margin-right: 6px; }
  .cli-comment .cli-field-value { color: #2f3b46; font-weight: 500; white-space: pre-wrap; }

  /* Bottom panel: 2D design left, the two jaw renders stacked right. A fixed height, not a
     full-page flex fill — that fragments unreliably and pushes this to a second page. */
  .cli-bottom { display: flex; gap: 12px; align-items: stretch; height: 470px; margin-top: 16px; }
  .cli-bottom-left { flex: 1.15; }
  .cli-bottom-right { flex: 1; display: flex; flex-direction: column; gap: 12px; }
  .cli-panel { display: flex; flex-direction: column; border: 1px solid #e1e4e8; border-radius: 6px; overflow: hidden; background: #fafafa; }
  .cli-bottom-left .cli-panel { height: 100%; }
  .cli-bottom-right .cli-panel { flex: 1; min-height: 0; }
  .cli-panel-cap { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.06em; color: #2aa67c; text-transform: uppercase; padding: 5px 8px; border-bottom: 1px solid #e8ebee; background: #fff; }
  .cli-panel-body { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 6px; }
  .cli-panel-body > img { max-width: 100%; max-height: 100%; object-fit: contain; image-rendering: auto; }
  .cli-empty { color: #8895a4; font-style: italic; font-size: 0.74rem; }

  @media print {
    body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .cli-row { gap: 2px; }
    .cli-bottom { break-inside: avoid; }
    .cli-tooth, .cli-tooth-cross::before, .cli-tooth-cross::after,
    .cli-tooth-restoration, .cli-tooth-extraction-arrow, .cli-tooth-tilt,
    .cli-tooth-rootstump-label, .cli-status {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style></head>
<body>
  <div class="cli-sheet">
  <h1 class="cli-report-title">Design Report</h1>
  <header class="cli-top">
    <div class="cli-meta">
      ${reportFieldRow("Case Number", label)}
      ${reportFieldRow("Creation Date", creationDate).replace("cli-field", "cli-field cli-field-creation")}
      ${reportFieldRow("Customer", ownerName)}
      ${reportFieldRow("Date Required", caseNote.dateRequired || "")}
      ${reportFieldRow("Tooth Shade", caseNote.toothShade || "")}
      ${reportFieldRow("Work Category", workCategoryLabel)}
    </div>
    <div class="cli-status-wrap">
      <div class="cli-status-title">Case Status</div>
      <div class="cli-status" style="background:${status.bg};color:${status.fg};">${escapeHtml(status.label)}</div>
    </div>
  </header>

  <section class="cli-chart">
    <div class="cli-chart-label">BUCCAL</div>
    <div class="cli-row">${upperRow}</div>
    <div class="cli-chart-label">LINGUAL</div>
    <div class="cli-row">${lowerRow}</div>
    <div class="cli-chart-label">BUCCAL</div>
  </section>

  <div class="cli-legend-title">LEGEND</div>
  ${legend}

  <div class="cli-comment">
    <span class="cli-field-label">Additional Comments :</span>
    <span class="cli-field-value">${escapeHtml(caseNote.comment || "")}</span>
  </div>

  <section class="cli-bottom">
    <div class="cli-bottom-left">
      <div class="cli-panel">
        <div class="cli-panel-cap">2D Design</div>
        <div class="cli-panel-body">
          ${jaw2dSrc ? `<img src="${jaw2dSrc}" alt="2D design" />` : `<span class="cli-empty">No 2D design available.</span>`}
        </div>
      </div>
    </div>
    <div class="cli-bottom-right">
      <div class="cli-panel">
        <div class="cli-panel-cap">3D Upper Jaw</div>
        <div class="cli-panel-body">
          ${jaw3dUpper ? `<img src="${escapeHtml(jaw3dUpper)}" alt="3D upper jaw" />` : `<span class="cli-empty">No upper jaw render.</span>`}
        </div>
      </div>
      <div class="cli-panel">
        <div class="cli-panel-cap">3D Lower Jaw</div>
        <div class="cli-panel-body">
          ${jaw3dLower ? `<img src="${escapeHtml(jaw3dLower)}" alt="3D lower jaw" />` : `<span class="cli-empty">No lower jaw render.</span>`}
        </div>
      </div>
    </div>
  </section>
  </div>

  ${printScript}
</body></html>`;

  return html;
}

// "Generate Report" builds from live page state and opens a print window. The case-list
// bulk download instead calls buildReportHtml directly and renders a PDF.
async function generateReport() {
  // Prefer the full "{id} : {name}" label rendered in the topbar so the
  // report matches what the user sees on screen.
  const topbarLabel = (document.getElementById("caseLabel")?.textContent || "")
    .replace(/^Case:\s*/i, "")
    .trim();
  const caseLabel = topbarLabel || (state.caseIntID ?? "Unknown");
  const twoDPreviewSrc = (ensureCache().instructions || []).at(-1)?.preview || "";

  const html = await buildReportHtml(state.caseIntID, {
    caseLabel,
    caseOwner: state.caseOwner,
    twoDPreviewSrc,
    autoPrint: true,
  });

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

  // Guests can't save to the server, so the first noticeboard open per tab session is
  // gated behind a Login / Continue-as-guest prompt.
  if (isGuest() && sessionStorage.getItem(GUEST_ACK_KEY) !== "1") {
    openGuestGate();
    return;
  }

  ensureCache();
  renderGrids();
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
  // Logged-in: re-fetch from the server every open so saves from other
  // sessions/devices show up. Guest: rehydrate from their local mirror.
  if (isGuest()) hydrateNoticeboardFromLocal();
  else hydrateNoticeboardFromServer();
}

// ============ guest gate (Login / Continue as guest) ============
function ensureGuestGateModal() {
  let modal = document.getElementById("noticeboardGuestGate");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "noticeboardGuestGate";
  modal.className = "noticeboard-guestgate-modal is-hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <div class="noticeboard-guestgate-backdrop" data-gate-close></div>
    <div class="noticeboard-guestgate-card" role="document">
      <h2 class="noticeboard-guestgate-title">Sign in to continue</h2>
      <p class="noticeboard-guestgate-text">
        Log in to save your noticeboard instructions to this case. You can also
        continue as a guest &mdash; your edits will be kept on this device only.
      </p>
      <div class="noticeboard-guestgate-actions">
        <button type="button" class="noticeboard-guestgate-btn is-primary" data-gate-login>Login</button>
        <!-- TEMP: "Continue as guest" hidden for now — remove style="display:none" to restore. -->
        <button type="button" class="noticeboard-guestgate-btn is-ghost" data-gate-guest style="display:none">Continue as guest</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal
    .querySelectorAll("[data-gate-close]")
    .forEach((el) => el.addEventListener("click", closeGuestGate));
  modal.querySelector("[data-gate-login]").addEventListener("click", goToLoginFromGate);
  modal.querySelector("[data-gate-guest]").addEventListener("click", continueAsGuest);
  return modal;
}

function openGuestGate() {
  const modal = ensureGuestGateModal();
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeGuestGate() {
  const modal = document.getElementById("noticeboardGuestGate");
  if (!modal) return;
  modal.classList.add("is-hidden");
  modal.setAttribute("aria-hidden", "true");
}

function continueAsGuest() {
  // Remember the choice for the rest of this tab session, then open for real.
  try { sessionStorage.setItem(GUEST_ACK_KEY, "1"); } catch {}
  closeGuestGate();
  openNoticeboard();
}

function goToLoginFromGate() {
  // Remember this case's URL so login.js can bring the user straight back here
  // after a successful sign-in (instead of the default case list).
  try { localStorage.setItem("postLoginRedirect", window.location.href); } catch {}
  closeGuestGate();
  // Login lives at the repo root (index.html); the annotation page sits two
  // levels deep under src/pages/, so resolve back up to it.
  window.location.href = new URL("../../index.html", window.location.href).href;
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !getModal()?.classList.contains("is-hidden")) {
      closeNoticeboard();
    }
  });
  bindTabSwitching();
  hydrateNoticeboardFromServer();
}
