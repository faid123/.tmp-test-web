import { lol } from "../crypt.js";

function getLoggedInUser() {
  const user = localStorage.getItem("loggedInUser");
  return user ? JSON.parse(user) : null;
}

let currentSortColumn = null;
let currentSortOrder = "asc";
let currentCases = [];
let existingUsers = [];

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

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? dedupeCases(data) : data;
  } catch (err) {
    console.error("❌ Failed to fetch cases:", err);
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
    alert("⚠️ Unable to delete: missing case id or login.");
    return false;
  }

  if (!skipConfirm) {
    const confirmed = confirm("Are you sure you want to delete this case?");
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
      currentThumbnails = [];
      currentImageIndex = 0;
      updateThumbnail();
    }

    return true;
  } catch (err) {
    console.error("❌ Delete failed:", err);
    alert(`❌ Failed to delete case.\n\n${err.message || err}`);
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

async function downloadCaseFiles(caseIntId, caseLabel) {
  const user = getLoggedInUser();
  if (!user?.uuid || caseIntId == null) {
    alert("⚠️ Unable to download: missing case info or login.");
    return;
  }

  const payload = [
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: user.uuid,
      caseIntID: caseIntId,
    },
    { case_int_id: caseIntId },
  ];

  const endpoints = [
    "https://live.api.smartrpdai.com/api/smartrpd/stl/raw/get",
    "https://live.api.smartrpdai.com/api/smartrpd/stl/get",
  ];

  let files = [];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : [data];
      files = list.filter((item) => item && item.data);
      if (files.length) break;
    } catch (err) {
      console.warn("[case/download] endpoint failed", endpoint, err);
    }
  }

  if (!files.length) {
    alert("No uploaded files found for this case.");
    return;
  }

  if (typeof window.JSZip !== "function") {
    alert("Zip library failed to load. Please refresh and try again.");
    return;
  }

  const base = String(caseLabel || `case_${caseIntId}`).replace(/[^a-z0-9_\-]+/gi, "_");
  const zip = new window.JSZip();
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
      zip.file(name, base64ToBytes(file.data));
    } catch (err) {
      console.error("❌ Failed to add file to zip:", name, err);
    }
  });

  try {
    const blob = await zip.generateAsync({ type: "uint8array" });
    triggerBlobDownload(blob, `${base}.zip`);
  } catch (err) {
    console.error("❌ Failed to generate zip:", err);
    alert(`❌ Failed to generate zip: ${err.message || err}`);
  }
}

// Map an API status string to a CSS modifier so card/detail pills get the
// right color (yellow/blue/green/grey). Keep the keys broad — anything we
// don't recognise falls back to a neutral "na" pill.
function statusPillClass(apiStatus) {
  const v = apiStatusToValue(apiStatus);
  if (!v || v === "na") return "cm-pill-na";
  if (v === "completed" || v === "delivered") return "cm-pill-completed";
  if (v === "draft") return "cm-pill-draft";
  if (
    v === "in_production" ||
    v === "out_for_delivery" ||
    v.endsWith("_drafted") ||
    v.endsWith("_approved")
  ) return "cm-pill-progress";
  if (v.endsWith("_pending") || v === "pending") return "cm-pill-pending";
  return "cm-pill-progress";
}

function statusDisplayText(apiStatus) {
  const v = apiStatusToValue(apiStatus);
  if (!v || v === "na") return "N/A";
  if (v === "draft") return "draft";
  if (v.endsWith("_pending")) 
    if (v.startsWith("2d_")) return "pending (2D)";
    if (v.startsWith("3d_")) return "pending (3D)";
    return "pending";
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

function applyStatusPillToSelect(apiStatus) {
  const sel = document.getElementById("status");
  if (!sel) return;
  sel.classList.remove(
    "cm-pill-pending",
    "cm-pill-progress",
    "cm-pill-completed",
    "cm-pill-na",
    "cm-pill-draft"
  );
  sel.classList.add(statusPillClass(apiStatus));
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

// 渲染病例卡片列表（取代旧表格）
function populateTable(cases) {
  const sel = document.getElementById("filter-status");
  if (sel && sel.value !== "all") {
    cases = cases.filter((c) => apiStatusToValue(c.new_status) === sel.value);
  }

  const pinnedSet = getPinnedSet();
  cases = [...(cases || [])].sort((a, b) => {
    const aId = String(a.id ?? a.case_int_id ?? "");
    const bId = String(b.id ?? b.case_int_id ?? "");
    return Number(pinnedSet.has(bId)) - Number(pinnedSet.has(aId));
  });

  const list = document.getElementById("caseList");
  const countBadge = document.getElementById("caseCountBadge");
  if (countBadge) countBadge.textContent = String(cases?.length || 0);
  if (!list) return;
  list.innerHTML = "";

  if (!cases || cases.length === 0) {
    const empty = document.createElement("div");
    empty.className = "cm-list-empty";
    empty.textContent = "No cases found.";
    list.appendChild(empty);
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
    const caseDisplayName = caseItem.case_id
      ? caseIntId != null
        ? `UID_${caseIntId} : ${caseItem.case_id}`
        : caseItem.case_id
      : "N/A";

    const pinned = pinnedSet.has(String(resolvedCaseId));

    const card = document.createElement("div");
    card.className = pinned ? "cm-card is-pinned" : "cm-card";
    card.dataset.caseId = resolvedCaseId;
    card.setAttribute("role", "button");
    card.tabIndex = 0;

    card.innerHTML = `
      <div class="cm-card-main">
        <div class="cm-card-title">
          <span class="cm-card-name">${escapeAttr(caseDisplayName)}</span>
          <span class="cm-pill ${statusPillClass(caseItem.new_status)}">${escapeAttr(statusDisplayText(caseItem.new_status))}</span>
        </div>
        <div class="cm-card-meta">
          <span class="cm-meta-item"><i class="fa-regular fa-calendar"></i>${formatDateTime(caseItem.creation_date)}</span>
          <span class="cm-meta-item"><i class="fa-regular fa-clock"></i>Due: ${dueDate ? formatDateTime(dueDate) : "N/A"}</span>
          <span class="cm-meta-item"><i class="fa-regular fa-circle-user"></i>${escapeAttr(assignedTo)}</span>
        </div>
      </div>
      <div class="cm-card-actions">
        <button class="cm-card-icon" type="button" title="Rename" aria-label="Rename" data-action="rename">
          <i class="fa-regular fa-pen-to-square"></i>
        </button>
        <button class="cm-card-icon ${pinned ? "is-pinned" : ""}" type="button" title="${pinned ? "Unpin" : "Pin to top"}" aria-label="${pinned ? "Unpin" : "Pin to top"}" aria-pressed="${pinned}" data-action="flag">
          <i class="${pinned ? "fa-solid" : "fa-regular"} fa-flag"></i>
        </button>
        <button class="cm-card-icon" type="button" title="Download files" aria-label="Download files" data-action="download">
          <i class="fa-regular fa-circle-down"></i>
        </button>
      </div>
    `;

    const selectCard = () => {
      handleRowClick(resolvedCaseId);
      list.querySelectorAll(".cm-card").forEach((c) => c.classList.remove("is-active"));
      card.classList.add("is-active");
    };

    card.addEventListener("click", selectCard);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectCard();
      }
    });

    card.querySelector('[data-action="download"]').addEventListener("click", async (e) => {
      e.stopPropagation();
      await downloadCaseFiles(resolvedCaseId, caseItem.case_id);
    });

    card.querySelector('[data-action="rename"]').addEventListener("click", (e) => {
      e.stopPropagation();
      selectCard();
      document.getElementById("renameBtn")?.click();
    });

    card.querySelector('[data-action="flag"]').addEventListener("click", (e) => {
      e.stopPropagation();
      togglePinned(resolvedCaseId);
      applyClientFilters();
    });

    list.appendChild(card);
  });
}

// 点击某一行时获取病例详情
async function handleRowClick(caseId) {
  window.selectedCaseId = caseId;
  const loggedInUser = getLoggedInUser();
  if (!loggedInUser || !caseId) return;

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
      });
    }

    displayCaseDetails(detail);
    await fetchThumbnails(caseId);
  } catch (err) {
    console.error("❌ Failed to get case detail:", err);
  }

  if (window.innerWidth <= 768) {
    document.querySelector(".container")?.classList.add("show-details");
  }
  
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

  document.getElementById("selected-case").textContent = displayName;
  const assignee = data.assigned_to || data.username || "N/A";
  document.getElementById("created-by").textContent = assignee;
  const avatar = document.getElementById("assigneeAvatar");
  if (avatar) avatar.textContent = initialsFor(assignee);

  document.getElementById("date-created").textContent = formatDateTime(data.creation_date);
  document.getElementById("last-edited").textContent = formatDateTime(data.last_updated);

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
}

function applyClientFilters() {
  const searchInput = document.getElementById("searchCaseInput");
  const dateInput = document.getElementById("dateFilterInput");
  const todayOnly = document.getElementById("todayOnly");

  const q = (searchInput?.value || "").trim().toLowerCase();
  const dateVal = dateInput?.value || "";
  const todayFlag = !!todayOnly?.checked;

  const today = new Date();
  const base = currentCases.filter((item) => {
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

// Compute a default due-date timestamp (ms) that's 14 days after the
// creation timestamp. Returns null when creation is missing/invalid.
function computeDefaultDueDate(creationTs) {
  if (creationTs == null || creationTs === "" || creationTs === 0 || creationTs === "0") return null;
  const n = Number(creationTs);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = String(n).length >= 13 ? n : n * 1000;
  return ms + 14 * 24 * 60 * 60 * 1000;
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

// 排序逻辑
function sortCases(cases, key, order = "asc") {
  return [...cases].sort((a, b) => {
    let valA = a[key] || "",
      valB = b[key] || "";
    if (key.includes("date")) {
      valA = new Date(+valA);
      valB = new Date(+valB);

      if (isNaN(valA)) return 1;
      if (isNaN(valB)) return -1;
    } else {
      valA = valA.toString().toLowerCase();
      valB = valB.toString().toLowerCase();
    }

    return (
      (valA < valB ? -1 : valA > valB ? 1 : 0) * (order === "asc" ? 1 : -1)
    );
  });
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

// 获取缩略图
async function fetchThumbnails(caseId) {
  const loggedInUser = getLoggedInUser();
  if (!loggedInUser) return;

  // Server expects the STRING case name (e.g. "case_04") under `case_id`,
  // not the numeric row id. Look it up from currentCases.
  const caseObj = currentCases.find(
    (c) => c.id === caseId || c.case_int_id === caseId
  );
  const caseIdStr = caseObj?.case_id ?? caseId;

  const requestBody = JSON.stringify([
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: loggedInUser.uuid,
      caseIntID: caseId,
    },
    {
      case_id: caseIdStr,
    },
  ]);

  try {
    const res = await fetch(
      "https://live.api.smartrpdai.com/api/smartrpd/thumbnails/get",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      }
    );

    if (!res.ok) {
      console.warn("⚠️ No images found or request failed:", res.status);
      currentThumbnails = [];
      currentImageIndex = 0;
      updateThumbnail();
      return;
    }

    const data = await res.json();
    const rawImages = data.map((img) => img.data).filter(Boolean);
    currentThumbnails = await classifyThumbnails(rawImages);
    currentImageIndex = 0;
    updateThumbnail();
  } catch (err) {
    console.error("❌ Failed to fetch thumbnails:", err);
    currentThumbnails = [];
    currentImageIndex = 0;
    updateThumbnail();
  }
}

// 初始化页面
document.addEventListener("DOMContentLoaded", async () => {
  updateThumbnail();
  const cases = await fetchCases();

  if (cases) {
    // ① 拉扩展字段
    const extraMap = (await fetchAdditionalCaseDetails(cases)) || {};
    console.log("[extraMap]", extraMap);
    // ② 合并到每个 case 上（找得到就塞进去）
    cases.forEach((c) =>
      Object.assign(
        c,
        extraMap[String(c.id)] || extraMap[String(c.case_int_id)] || {}
      )
    );
    console.log("[after merge]", cases[0]);
    currentCases = cases; // 放到 merge 之后
    populateTable(currentCases);
    applyClientFilters();

    const searchInput = document.getElementById("searchCaseInput");
    const dateInput = document.getElementById("dateFilterInput");
    const clearDateBtn = document.getElementById("clearDateBtn");
    const todayOnly = document.getElementById("todayOnly");
    const refreshListBtn = document.getElementById("refreshListBtn");
    const searchBtn = document.getElementById("searchBtn");

    searchInput?.addEventListener("input", applyClientFilters);
    dateInput?.addEventListener("change", applyClientFilters);
    todayOnly?.addEventListener("change", applyClientFilters);
    searchBtn?.addEventListener("click", applyClientFilters);
    clearDateBtn?.addEventListener("click", () => {
      if (!dateInput) return;
      dateInput.value = "";
      applyClientFilters();
    });
    refreshListBtn?.addEventListener("click", () => {
      window.location.reload();
    });

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


    // 排序逻辑绑定
    document.querySelectorAll(".sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const sortKey = th.dataset.sort;
        console.log("🔍 正在排序字段：", sortKey);

        currentSortOrder =
          currentSortColumn === sortKey && currentSortOrder === "asc"
            ? "desc"
            : "asc";
        currentSortColumn = sortKey;

        const sorted = sortCases(currentCases, sortKey, currentSortOrder);
        currentCases = sorted; // ✅ 保证下一轮点击时用的是更新后的顺序
        applyClientFilters();

        // 箭头样式更新（你原来就有）
        document
          .querySelectorAll(".sortable")
          .forEach((el) => el.classList.remove("active-asc", "active-desc"));
        th.classList.add(
          currentSortOrder === "asc" ? "active-asc" : "active-desc"
        );
      });
    });

    // 缩略图切换按钮绑定
    document.getElementById("prevBtn").addEventListener("click", () => {
      if (currentThumbnails.length > 0) {
        currentImageIndex =
          (currentImageIndex - 1 + currentThumbnails.length) %
          currentThumbnails.length;
        updateThumbnail();
      }
    });

    document.getElementById("nextBtn").addEventListener("click", () => {
      if (currentThumbnails.length > 0) {
        currentImageIndex = (currentImageIndex + 1) % currentThumbnails.length;
        updateThumbnail();
      }
    });
  }

  // ✅ START CASE 按钮绑定逻辑（使用 class 绑定方案 B）
  const startBtn = document.querySelector(".start-case-button");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      const caseId = window.selectedCaseId;
      console.log("🔹 Selected case ID:", caseId);

      if (!caseId) {
        alert("⚠️ Please select a case first.");
        return;
      }

      const encryptedId = lol(caseId);
      const isGitHubPages = window.location.hostname.includes("github.io");
      // const isLocal = window.location.hostname === "localhost";

      // 本地要用 .html/?id=xxx，GitHub 要用 .html?id=xxx
      const queryConnector = "?";
      const basePath = isGitHubPages ? "/.tmp-test-web" : "";

      const targetURL = `${window.location.origin}${basePath}/src/pages/2DAnnotation.html${queryConnector}id=${encryptedId}`;
      window.location.href = targetURL;
    });
  }

  // ✅ 👇 在这里添加 ⋯ 按钮展开菜单逻辑
  const dropdownToggle = document.querySelector(".dropdown-toggle");
  const dropdownMenu = document.getElementById("caseDropdown");

  if (dropdownToggle && dropdownMenu) {
    // 点击 ⋯ 展开或关闭菜单
    dropdownToggle.addEventListener("click", (e) => {
      e.stopPropagation(); // 阻止冒泡
      dropdownMenu.classList.toggle("hidden");
    });

    // 点击空白处时收起菜单
    document.addEventListener("click", () => {
      dropdownMenu.classList.add("hidden");
    });

    // 点击菜单内部不关闭（防止误触）
    dropdownMenu.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  const deleteBtn = document.getElementById("deleteBtn");

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const caseId = window.selectedCaseId;
      if (!caseId) {
        alert("⚠️ Please select a case first.");
        return;
      }
      const ok = await deleteCaseById(caseId);
      if (ok) alert("✅ Case deleted successfully!");
    });
  }

  const editUserAccessBtn = document.getElementById("editUserAccessBtn");

  if (editUserAccessBtn) {
    editUserAccessBtn.addEventListener("click", async () => {
      const caseId = window.selectedCaseId;
      const user = getLoggedInUser();

      if (!caseId || !user?.uuid) {
        alert("⚠️ Please select a case first.");
        return;
      }

      const caseObj = currentCases.find(
        (c) => c.id === caseId || c.case_id === caseId
      );
      if (!caseObj) {
        alert("⚠️ Case not found in current list.");
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
      alert(`❌ Failed to rename case: ${error.message}`);
    } finally {
      confirmRenameBtn.disabled = false;
    }
  };

  if (renameBtn) {
    renameBtn.addEventListener("click", () => {
      const caseId = window.selectedCaseId;
      const user = getLoggedInUser();

      if (!caseId || !user?.uuid) {
        alert("⚠️ Please select a case first.");
        return;
      }

      const caseObj = currentCases.find(
        (c) => c.id === caseId || c.case_id === caseId
      );
      if (!caseObj) {
        alert("⚠️ Case not found in current list.");
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
      alert("⚠️ Please select a case first.");
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
      console.error("❌ Status update failed:", err);
      alert("❌ Failed to update status.");
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
      const confirmed = confirm(`Remove user ${user.username}?`);
      if (!confirmed) return;

      try {
        const { caseIntID, uuid, machine_id } = window._inviteContext;
        const payload = [
          { machine_id, uuid, caseIntID },
          { case_id: caseIntID, uuid: user.uuid },
        ];

        const res = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/role/delete",
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        alert(`✅ User ${user.username} removed.`);

        // 移除本地并刷新
        existingUsers = existingUsers.filter((u) => u.uuid !== user.uuid);
        renderSharedUserList();
      } catch (err) {
        console.error("❌ Failed to remove user:", err);
        alert("❌ Failed to remove user.");
      }
    });

    li.appendChild(nameSpan);
    li.appendChild(roleSpan);
    li.appendChild(deleteBtn); // ✅ 添加到右上角
    container.appendChild(li);
  });
}

async function fetchAdditionalCaseDetails(caseList) {
  const logged = getLoggedInUser();
  if (!logged || !caseList?.length) return {};

  const url =
    "https://live.api.smartrpdai.com/api/smartrpd/additionalcasedetails/getall";

  // 并发请求 → Promise.all
  const reqs = caseList.map((c) => {
    const body = [
      {
        machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
        uuid: logged.uuid,
        caseIntID: c.case_int_id ?? c.id, // 兼容两种字段名
      },
    ];

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : [])) // 失败就当没数据
      .then((arr) => arr.at(-1)) // 接口返回 [ {...} ]
      .catch(() => undefined);
  });

  const results = await Promise.all(reqs);

  // 把有数据的条目塞进 map
  const map = {};
  results.forEach((item) => {
    if (!item || !item.case_int_id) return;

    const clean = {
      expected_date: item.due_date,
      new_status: item.new_status,
      assigned_to: item.assigned_to,
      comments: item.comments,
    };
    map[String(item.case_int_id)] = clean;
  });

  return map; // 只包含真的有附加数据的那些病例
}

async function postNewStatus(caseObj, newStatus) {
  const body = [
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: getLoggedInUser().uuid,
      caseIntID: caseObj.id || caseObj.case_int_id,
    },
    {
      assigned_to: caseObj.assigned_to ?? null,
      due_date: caseObj.expected_date ?? null, // 你的 clean 已改名
      comments: caseObj.comments ?? null,
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
        await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/alerts",
          {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify(body)
          }
        );
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
