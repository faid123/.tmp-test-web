import { state, setMessage } from "./2DAnnotation.js";
import { captureJawJpegDataUrl } from "./annotationLocks.js";
import { openInstructionEditor } from "./instructionEditor.js";

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
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchNoticeboardBase(caseIntID, uuid) {
  return postNoticeboardEndpoint("/noticeboard/get", noticeboardPayload(caseIntID, uuid));
}

async function fetchNoticeboardDrawn(caseIntID, uuid) {
  return postNoticeboardEndpoint("/noticeboard/drawnview/get", noticeboardPayload(caseIntID, uuid));
}

async function fetchNoticeboardEdited(caseIntID, uuid) {
  return postNoticeboardEndpoint("/noticeboard/editedview/get", noticeboardPayload(caseIntID, uuid));
}

function parseRowToArrays(row) {
  if (!row) return { filenames: [], data: [] };
  const filenames = safeJsonParse(row.filenames || "[]", []);
  const data = safeJsonParse(row.data || "[]", []);
  return {
    filenames: Array.isArray(filenames) ? filenames : [],
    data: Array.isArray(data) ? data : []
  };
}

function isDataUrlImage(v) {
  return typeof v === "string" && v.startsWith("data:image/");
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function composeBaseAndOverlay(baseDataUrl, overlayDataUrl) {
  if (!baseDataUrl && !overlayDataUrl) return "";
  const [base, overlay] = await Promise.all([
    baseDataUrl ? loadImage(baseDataUrl) : Promise.resolve(null),
    overlayDataUrl ? loadImage(overlayDataUrl) : Promise.resolve(null),
  ]);
  const ref = base || overlay;
  if (!ref) return "";
  const canvas = document.createElement("canvas");
  canvas.width = ref.naturalWidth || ref.width;
  canvas.height = ref.naturalHeight || ref.height;
  const ctx = canvas.getContext("2d");
  if (base) ctx.drawImage(base, 0, 0);
  if (overlay) ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function maybeStrokeJson(v) {
  if (typeof v !== "string") return null;
  const parsed = safeJsonParse(v, null);
  if (!parsed) return null;
  return parsed; // keep generic for fallback
}

async function buildServerViewcaptures(baseRow, drawnRow, editedRow) {
  const base = parseRowToArrays(baseRow);
  const drawn = parseRowToArrays(drawnRow);
  const edited = parseRowToArrays(editedRow);

  // Prefer edited if present, else composed base+drawn
  const maxLen = Math.max(base.data.length, drawn.data.length, edited.data.length, base.filenames.length);

  const out = [];
  for (let i = 0; i < maxLen; i += 1) {
    const filename = edited.filenames[i] || base.filenames[i] || `Viewcapture ${i + 1}`;
    const editedItem = edited.data[i];
    const baseItem = base.data[i];
    const drawnItem = drawn.data[i];

    let preview = "";
    let strokes = null;

    if (isDataUrlImage(editedItem)) {
      preview = editedItem;
    } else {
      const baseImage = isDataUrlImage(baseItem) ? baseItem : "";
      const drawnImage = isDataUrlImage(drawnItem) ? drawnItem : "";
      preview = await composeBaseAndOverlay(baseImage, drawnImage);
    }

    if (!preview) {
      const s1 = maybeStrokeJson(drawnItem);
      const s2 = maybeStrokeJson(baseItem);
      const s3 = maybeStrokeJson(editedItem);
      strokes = s1 || s2 || s3 || null;
    }

    if (!preview && !strokes) continue;

    out.push({
      id: `vc_srv_${i}_${filename}`,
      title: filename,
      preview: preview || "",
      strokes: strokes || undefined,
      createdAt: new Date().toISOString(),
      source: "server"
    });
  }

  return out;
}

function mergeViewcaptures(localItems, serverItems) {
  const map = new Map();

  const keyOf = (item) => {
    if (item.title) return `title:${item.title}`;
    if (item.id) return `id:${item.id}`;
    return `preview:${item.preview || ""}`;
  };

  for (const it of localItems || []) map.set(keyOf(it), it);
  for (const it of serverItems || []) map.set(keyOf(it), { ...(map.get(keyOf(it)) || {}), ...it });

  return Array.from(map.values());
}

async function hydrateNoticeboardFromServer() {
  const user = getLoggedInUser();
  if (!user?.uuid || !state.caseIntID) return false;

  try {
    const [baseRaw, drawnRaw, editedRaw] = await Promise.all([
      fetchNoticeboardBase(state.caseIntID, user.uuid),
      fetchNoticeboardDrawn(state.caseIntID, user.uuid),
      fetchNoticeboardEdited(state.caseIntID, user.uuid)
    ]);

    const baseRow = normalizeApiRow(baseRaw);
    const drawnRow = normalizeApiRow(drawnRaw);
    const editedRow = normalizeApiRow(editedRaw);

    const serverViewcaptures = await buildServerViewcaptures(baseRow, drawnRow, editedRow);
    if (!serverViewcaptures.length) return false;

    const data = ensureCache();
    data.viewcaptures = mergeViewcaptures(data.viewcaptures || [], serverViewcaptures);

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


const STORAGE_PREFIX = "noticeboard";

function getStorageKey() {
  const id = state.encryptedCaseId || "draft";
  return `${STORAGE_PREFIX}_${id}`;
}

function emptyData() {
  return { instructions: [], viewcaptures: [] };
}

function loadData() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw);
    return {
      instructions: Array.isArray(parsed.instructions) ? parsed.instructions : [],
      viewcaptures: Array.isArray(parsed.viewcaptures) ? parsed.viewcaptures : [],
    };
  } catch {
    return emptyData();
  }
}

function saveData(data) {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
  } catch (e) {
    console.error("Noticeboard save failed", e);
    setMessage("Could not save noticeboard entry — storage may be full.", true);
  }
}

let cache = null;

function getModal() {
  return document.getElementById("noticeboardModal");
}

function ensureCache() {
  if (!cache) cache = loadData();
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

  const canEdit = kind === "instruction";

  if (canEdit) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "noticeboard-thumb-menu-item";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeThumbActionMenu();
      const item = items[idx];
      if (!item) return;
      const updated = await openInstructionEditor({ initialImage: item.preview });
      if (!updated) return;
      item.preview = updated;
      item.updatedAt = new Date().toISOString();
      saveData(cache);
      renderGrids();
      setMessage("Instruction updated.", false);
    });
    menu.appendChild(editBtn);
  }

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "noticeboard-thumb-menu-item noticeboard-thumb-menu-item-danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeThumbActionMenu();
    items.splice(idx, 1);
    saveData(cache);
    renderGrids();
    setMessage(`${kind === "instruction" ? "Instruction" : "Viewcapture"} deleted.`, false);
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

async function addInstruction() {
  setMessage("Opening instruction editor…", false);
  const dataUrl = await openInstructionEditor();
  if (!dataUrl) {
    setMessage("Instruction discarded.", false);
    return;
  }
  const data = ensureCache();
  data.instructions.push({
    id: `inst_${Date.now()}`,
    title: `Instruction ${data.instructions.length + 1}`,
    preview: dataUrl,
    createdAt: new Date().toISOString(),
  });
  saveData(data);
  renderGrids();
  setMessage("Instruction added to noticeboard.", false);
}

function addViewcapture() {
  const previewImg = document.getElementById("previewImage");
  const preview = previewImg && previewImg.src && previewImg.style.display !== "none"
    ? previewImg.src
    : "";
  const data = ensureCache();
  data.viewcaptures.push({
    id: `vc_${Date.now()}`,
    title: `Viewcapture ${data.viewcaptures.length + 1}`,
    preview,
    createdAt: new Date().toISOString(),
  });
  saveData(data);
  renderGrids();
  setMessage(
    preview ? "Viewcapture added from 3D preview." : "Empty viewcapture slot added.",
    false
  );
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function generateReport() {
  const data = ensureCache();
  const caseLabel = escapeHtml(state.caseIntID ?? "Unknown");
  const renderItems = (items, label) => {
    if (!items.length) {
      return `<p class="empty">No ${escapeHtml(label.toLowerCase())} captured.</p>`;
    }
    return items
      .map(
        (item) => `
        <figure class="report-item">
          ${item.preview ? `<img src="${item.preview}" alt="" />` : `<div class="report-item-empty">No preview</div>`}
          <figcaption>${escapeHtml(item.title || "")}</figcaption>
        </figure>`
      )
      .join("");
  };

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>SmartRPD Report — Case ${caseLabel}</title>
<style>
  body { font-family: "Segoe UI", sans-serif; color: #2f3b46; padding: 28px; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  h2 { font-size: 1rem; margin: 24px 0 8px; border-bottom: 1px solid #dde3ea; padding-bottom: 4px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .report-item { margin: 0; border: 1px solid #dde3ea; border-radius: 6px; padding: 8px; background: #fff; }
  .report-item img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
  .report-item-empty { color: #b3bcc6; text-align: center; padding: 24px; font-size: 0.85rem; }
  figcaption { margin-top: 6px; font-size: 0.75rem; color: #6b7682; text-align: center; }
  .empty { color: #8895a4; font-size: 0.85rem; font-style: italic; }
  @media print { body { padding: 14px; } }
</style></head>
<body>
  <h1>SmartRPD — Case ${caseLabel}</h1>
  <div>Generated ${escapeHtml(new Date().toLocaleString())}</div>

  <h2>2D Setup &amp; Design — Instructions</h2>
  <div class="grid">${renderItems(data.instructions, "Instructions")}</div>

  <h2>3D Design — Viewcaptures</h2>
  <div class="grid">${renderItems(data.viewcaptures, "Viewcaptures")}</div>
  <script>setTimeout(() => window.print(), 300);<\/script>
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
  cache = loadData();
  renderGrids();
  modal.classList.remove("is-hidden");
  modal.setAttribute("aria-hidden", "false");
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
  cache = loadData();
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
