import { state, setMessage } from "./2DAnnotation.js";
import { captureJawJpegDataUrl } from "./annotationLocks.js";
import { openInstructionEditor } from "./instructionEditor.js";
import { UPPER_TEETH, LOWER_TEETH, sourceToothFor, statusFor } from "./clinicalInfo.js";

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
  return typeof v === "string" ? safeJsonParse(v, null) : null;
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

function buildReportToothHtml(toothId, assetBase) {
  const { id, mirrored } = sourceToothFor(toothId);
  const status = statusFor(toothId);
  const mirrorClass = mirrored ? " is-mirrored" : "";

  let body;
  if (status === "abutment") {
    body = `<img class="cli-tooth-img cli-tooth-full${mirrorClass}" src="${assetBase}/${id}_Abutment.svg" alt="" />`;
  } else {
    const crown = `<img class="cli-tooth-img cli-tooth-crown${mirrorClass}" src="${assetBase}/${id}_Crown.svg" alt="" />`;
    const root = `<img class="cli-tooth-img cli-tooth-root${mirrorClass}" src="${assetBase}/${id}_Root.svg" alt="" />`;
    const isUpper = toothId >= 11 && toothId <= 28;
    const stack = isUpper
      ? `<div class="cli-tooth-stack">${root}${crown}</div>`
      : `<div class="cli-tooth-stack">${crown}${root}</div>`;
    const cross = status === "missing" ? `<span class="cli-tooth-cross"></span>` : "";
    body = `${stack}${cross}`;
  }

  return `
    <div class="cli-tooth is-${status}">
      <div class="cli-tooth-number">${toothId}</div>
      <div class="cli-tooth-img-wrap">${body}</div>
    </div>`;
}

function buildReportRowHtml(teeth, assetBase) {
  return teeth.map((id) => buildReportToothHtml(id, assetBase)).join("");
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

async function generateReport() {
  const caseLabel = state.caseIntID ?? "Unknown";
  const assetBase = `${window.location.origin}/assets/clinicalInfo`;
  const creationDate = new Date().toLocaleString("sv-SE").replace("T", " ").slice(0, 19);

  const previewEl = document.getElementById("previewImage");
  const previewSrc = previewEl?.currentSrc || previewEl?.src || "";

  let jaw2dSrc = "";
  try {
    jaw2dSrc = (await captureJawJpegDataUrl()) || "";
  } catch (err) {
    console.warn("Failed to capture 2D jaw for report:", err);
  }

  const upperRow = buildReportRowHtml(UPPER_TEETH, assetBase);
  const lowerRow = buildReportRowHtml(LOWER_TEETH, assetBase);
  const legend = buildReportLegendHtml(assetBase);

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<title>SmartRPD Report — Case ${escapeHtml(caseLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", "Montserrat", sans-serif; color: #2f3b46; margin: 0; padding: 28px; }
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

  .cli-tooth { position: relative; display: flex; flex-direction: column; align-items: center; background: #fafafa; border: 1px solid #e1e4e8; border-radius: 4px; padding: 4px 1px; min-height: 130px; }
  .cli-tooth-number { font-size: 0.7rem; color: #2a3340; font-weight: 600; margin-bottom: 2px; }
  .cli-tooth-img-wrap { position: relative; flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .cli-tooth-stack { display: flex; flex-direction: column; align-items: center; line-height: 0; }
  .cli-tooth-img { max-width: 100%; object-fit: contain; display: block; }
  .cli-tooth-crown { max-height: 40px; }
  .cli-tooth-root { max-height: 75px; }
  .cli-tooth-full { max-height: 115px; }
  .cli-tooth-img.is-mirrored { transform: scaleX(-1); }
  .cli-tooth-cross { position: absolute; inset: 0; pointer-events: none; }
  .cli-tooth-cross::before, .cli-tooth-cross::after { content: ""; position: absolute; left: 50%; top: 50%; width: 260%; height: 3px; background: #b0341c; transform-origin: center; border-radius: 2px; }
  .cli-tooth-cross::before { transform: translate(-50%, -50%) rotate(72deg); }
  .cli-tooth-cross::after { transform: translate(-50%, -50%) rotate(-72deg); }

  .cli-legend-title { color: #2aa67c; letter-spacing: 0.1em; font-weight: 700; font-size: 0.85rem; margin: 24px 0 8px; }
  .cli-legend-grid { display: flex; flex-wrap: wrap; row-gap: 14px; column-gap: 18px; align-items: flex-end; }
  .cli-legend-item { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 36px; }
  .cli-legend-row-item { align-items: flex-start; }
  .cli-legend-cluster { display: flex; gap: 6px; align-items: flex-end; }
  .cli-legend-text { font-size: 0.62rem; font-weight: 700; color: #2a3340; text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; }
  .cli-legend-sub { align-self: flex-end; padding-bottom: 4px; }
  .cli-legend-img { height: 36px; max-width: 42px; object-fit: contain; display: block; }
  .cli-mob { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; color: #fff; }
  .cli-mob-1 { background: #4caf50; }
  .cli-mob-2 { background: #f6c344; color: #3a2c00; }
  .cli-mob-3 { background: #c0392b; }

  .cli-3d-page { display: flex; align-items: center; justify-content: center; min-height: 90vh; }
  .cli-3d-page img { max-width: 100%; max-height: 90vh; object-fit: contain; }
  .cli-3d-page .cli-empty { color: #8895a4; font-style: italic; }

  @media print {
    body { padding: 14px; }
    .cli-row { gap: 2px; }
  }
</style></head>
<body>
  <section class="cli-page">
    <div class="cli-meta">
      ${reportFieldRow("Customer", "")}
      ${reportFieldRow("Creation Date", creationDate).replace("cli-field", "cli-field cli-field-creation")}
      ${reportFieldRow("Case Number", caseLabel)}
      ${reportFieldRow("Date Required", "")}
      ${reportFieldRow("Tooth Shade", "")}
      ${reportFieldRow("Work Category", "")}
    </div>

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
    </div>
  </section>

  <section class="cli-page cli-3d-page">
    ${jaw2dSrc ? `<img src="${jaw2dSrc}" alt="2D design" />` : `<div class="cli-empty">No 2D design available.</div>`}
  </section>

  <section class="cli-page cli-3d-page">
    ${previewSrc ? `<img src="${escapeHtml(previewSrc)}" alt="3D preview" />` : `<div class="cli-empty">No 3D preview available.</div>`}
  </section>

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
