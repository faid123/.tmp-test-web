import { lol } from "../crypt.js";
import { toast } from "./toast.js";
import { confirmModal } from "./confirmModal.js";
import { logApi } from "./apiLog.js";
import { setupConnectivityIndicator } from "./connectivityIndicator.js";
import { setupAppSidebar } from "./appSidebar.js";
import { VIEWER_UUID, LOGIN_CREDENTIALS } from "../config.js";

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
    localStorage.setItem(key, JSON.stringify(list));
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

    // Mirror SessionManager.RefreshCaseList — reload so the new case appears
    // with its full server-side detail/thumbnail set, same as refreshListBtn.
    setTimeout(() => window.location.reload(), 400);
    return true;
  } catch (err) {
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
    toast.warning("Unable to download: missing case info or login.");
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
    "https://live.api.smartrpdai.com/api/smartrpd/stl/get",
    "https://live.api.smartrpdai.com/api/smartrpd/stl/raw/get",
  ];

  let files = [];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      logApi(res, `POST ${endpoint.replace('https://live.api.smartrpdai.com/api/smartrpd', '')}`);
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : [data];
      files = list.filter((item) => item && item.data);
      if (files.length) {
        console.log(
          `[case/download] STL source selected: ${endpoint.replace('https://live.api.smartrpdai.com/api/smartrpd', '')} (${files.length} file(s))`
        );
        break;
      }
    } catch (err) {
      console.warn("[case/download] endpoint failed", endpoint, err);
    }
  }

  if (!files.length) {
    toast.info("No uploaded files found for this case.");
    return;
  }

  if (typeof window.JSZip !== "function") {
    toast.error("Zip library failed to load. Please refresh and try again.");
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
    toast.error(`Failed to generate zip: ${err.message || err}`);
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

// Render the co-owner list into the detail pane's SHARED WITH field. Each
// co-owner is a small avatar chip with initials and a name tooltip; empty
// arrays render an em-dash so the field never sits blank.
function renderSharedWith(coOwners) {
  const container = document.getElementById("shared-with-list");
  if (!container) return;
  const names = Array.isArray(coOwners) ? coOwners.filter(Boolean) : [];
  if (!names.length) {
    container.innerHTML = '<span class="cm-shared-empty">—</span>';
    return;
  }
  container.innerHTML = names
    .map(
      (name) => `
        <span class="cm-shared-chip" title="${escapeAttr(name)}">
          <span class="cm-avatar-sm cm-avatar-coowner">${escapeAttr(initialsFor(name))}</span>
          <span class="cm-shared-name">${escapeAttr(name)}</span>
        </span>`
    )
    .join("");
}

// Render the case list as a sortable table. The owner cell shows a "+N"
// badge (titled with the full list) when a case has co-owners.
function populateTable(cases) {
  const sel = document.getElementById("filter-status");
  if (sel && sel.value !== "all") {
    cases = cases.filter((c) => apiStatusToValue(c.new_status) === sel.value);
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
  if (!body) return;
  body.innerHTML = "";

  if (!cases || cases.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="cm-list-empty" colspan="6">No cases found.</td>`;
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
    const caseDisplayName = caseItem.case_id
      ? caseIntId != null
        ? `UID_${caseIntId} : ${caseItem.case_id}`
        : caseItem.case_id
      : "N/A";

    const pinned = pinnedSet.has(String(resolvedCaseId));

    const row = document.createElement("tr");
    row.className = "cm-row";
    if (pinned) row.classList.add("is-pinned");
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

    const coOwnersHtml = caseItem.co_owners?.length
      ? `<span class="cm-row-coowners" title="Shared with ${escapeAttr(caseItem.co_owners.join(", "))}"><i class="fa-solid fa-user-group"></i>+${caseItem.co_owners.length}</span>`
      : "";

    row.innerHTML = `
      <td class="cm-td-name">
        <span class="cm-row-name">${escapeAttr(caseDisplayName)}</span>${pinned ? '<i class="fa-solid fa-flag cm-row-pin" title="Pinned"></i>' : ""}
      </td>
      <td class="cm-td-status"><span class="cm-pill ${statusPillClass(caseItem.new_status)}">${escapeAttr(statusDisplayText(caseItem.new_status))}</span></td>
      <td class="cm-td-date" data-label="Created">${formatDateTime(caseItem.creation_date)}</td>
      <td class="cm-td-date" data-label="Due">${dueDate ? formatDateTime(dueDate) : "N/A"}</td>
      <td class="cm-td-owner" data-label="Owner">
        <i class="fa-regular fa-circle-user"></i><span class="cm-owner-name">${escapeAttr(assignedTo)}</span>${coOwnersHtml}
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
      await downloadCaseFiles(resolvedCaseId, caseItem.case_id);
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

    body.appendChild(row);
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

    displayCaseDetails(detail);
    await fetchThumbnails(caseId);

    // Bump server-side last_updated so this case sits at the top on the next
    // list load (and across devices). Optimistically update the local timestamp
    // first so the UI moves the case immediately, then fire the PUT in the
    // background — if it fails, the next page load will fall back to whatever
    // the server has.
    bumpLocalLastUpdated(caseId);
    fireLastOpenedBump(caseId, detail, loggedInUser).catch((err) => {
      console.warn("[caseManagement] last-opened bump failed:", err);
    });
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

// Build the 3D viewer URL for a case (ThreeDViewer.html reads ?id=<encryptedId>).
// Mirrors the Start Case navigation: encrypts the id and respects the
// GitHub-Pages base path so the link works locally and when deployed.
function buildThreeDViewerUrl(caseId) {
  if (!caseId) return "";
  const encryptedId = lol(caseId);
  const isGitHubPages = window.location.hostname.includes("github.io");
  const basePath = isGitHubPages
    ? `/${window.location.pathname.split("/").filter(Boolean)[0] || ""}`
    : "";
  return `${window.location.origin}${basePath}/src/pages/ThreeDViewer.html?id=${encryptedId}`;
}

// 显示基本信息
function displayCaseDetails(data) {
  const caseIntId = data.id ?? data.case_int_id;

  const view3dLink = document.getElementById("view3dLink");
  if (view3dLink) {
    const url = buildThreeDViewerUrl(caseIntId) || "#";
    view3dLink.href = url;
    const textEl = view3dLink.querySelector(".cm-3d-link-text");
    if (textEl) textEl.textContent = url;
    // Open the viewer via window.open (not the anchor's default target=_blank,
    // which carries rel="noopener" → a null opener and a non-closeable tab).
    // window.open keeps the opener back-reference and makes the tab
    // script-closeable, so the viewer's Return button can window.close() it.
    if (!view3dLink.dataset.scriptOpenBound) {
      view3dLink.dataset.scriptOpenBound = "1";
      view3dLink.addEventListener("click", (e) => {
        const href = view3dLink.getAttribute("href");
        if (!href || href === "#") return;
        e.preventDefault();
        window.open(href, "_blank");
      });
    }
  }

  const displayName = data.case_id
    ? caseIntId != null
      ? `UID ${caseIntId}-${data.case_id}`
      : data.case_id
    : "N/A";
  const nameHeader = document.getElementById("caseNameDisplay");
  if (nameHeader) nameHeader.textContent = "Case Details";

  document.getElementById("selected-case").textContent = displayName;
  const footerCaseName = document.getElementById("footerCaseName");
  if (footerCaseName) footerCaseName.textContent = data.case_name || displayName;
  const assignee = data.assigned_to || data.username || "N/A";
  document.getElementById("created-by").textContent = assignee;
  const avatar = document.getElementById("assigneeAvatar");
  if (avatar) avatar.textContent = initialsFor(assignee);

  renderSharedWith(data.co_owners);

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
    logApi(res, 'POST /thumbnails/get');
    if (!res.ok) {
      console.warn("⚠️ No images found or request failed:", res.status);
      currentThumbnails = [];
      currentImageIndex = 0;
      updateThumbnail();
      return;
    }

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

// 初始化页面
document.addEventListener("DOMContentLoaded", async () => {
  // Instant paint FIRST — before any other setup (connectivity / sidebar /
  // thumbnail, any of which could be slow or throw) and before the network call —
  // so the table shows the last-known list immediately instead of staying blank
  // while /case/user/findall/get is in flight. That request can lag when the API
  // host is busy (e.g. right after the chat's heavy notes query); the fetch below
  // replaces this paint as soon as it lands.
  try {
    const cachedForPaint = loadCachedCases();
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
  setupConnectivityIndicator(document.getElementById("footerConnection"));
  setupAppSidebar({ indexHref: "../../index.html" });

  updateThumbnail();
  const cases = await fetchCases();

  if (cases) {
    // Persist for the next load's instant paint.
    saveCachedCases(cases);
    // Paint the base list immediately. The per-case enrichment below fires
    // 2×N requests (additional details + co-owners, capped at 5 in flight);
    // gating the first paint on all of them left the table blank until every
    // one returned. That was worst right after leaving the 2D annotation page,
    // whose own request burst leaves the API briefly rate-limited — so the list
    // "took forever" to show on return. Render now; merge + re-render in place
    // when the extra data lands.
    currentCases = cases;
    populateTable(currentCases);
    applyClientFilters();

    // Pull additional per-case data and the co-owner list in parallel, then
    // fold them into the already-rendered rows. Fire-and-forget so it never
    // blocks the list from showing.
    Promise.all([
      fetchAdditionalCaseDetails(cases),
      fetchCoOwners(cases),
    ])
      .then(([extraMap, coOwnerMap]) => {
        cases.forEach((c) => {
          const key = String(c.id ?? c.case_int_id);
          Object.assign(c, extraMap?.[key] || {});
          c.co_owners = coOwnerMap?.[key] || [];
        });
        currentCases = cases;
        populateTable(currentCases);
        applyClientFilters();
        // Cache the enriched list (co-owners + details) so the next instant
        // paint is complete, not just the bare base rows.
        saveCachedCases(currentCases);
      })
      .catch((err) => {
        // Enrichment is best-effort; the base list is already on screen.
        console.warn("[caseList] per-case enrichment failed", err);
      });

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

    const logoutBtn = document.querySelector(".logout");
    logoutBtn?.addEventListener("click", async () => {
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
      window.location.href = "../../index.html";
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

    // Click the thumbnail to open it enlarged in a lightbox preview.
    document.getElementById("caseImage")?.addEventListener("click", () => {
      openThumbnailPreview();
    });
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
    });
  }

  // Open 3D viewer link — guard against clicking when no case is selected.
  const view3dLink = document.getElementById("view3dLink");
  if (view3dLink) {
    view3dLink.addEventListener("click", (e) => {
      if (!window.selectedCaseId) {
        e.preventDefault();
        toast.warning("Please select a case first.");
      }
    });
  }

  // Copy the selected case's 3D viewer link to the clipboard.
  const copy3dLinkBtn = document.getElementById("copy3dLinkBtn");
  if (copy3dLinkBtn) {
    copy3dLinkBtn.addEventListener("click", async () => {
      const url3d = buildThreeDViewerUrl(window.selectedCaseId);
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

  // Open 3D viewer pre-logged-in as the faid account.
  const export3dLinkBtn = document.getElementById("export3dLinkBtn");
  if (export3dLinkBtn) {
    export3dLinkBtn.addEventListener("click", () => {
      const url3d = buildThreeDViewerUrl(window.selectedCaseId);
      if (!url3d) {
        toast.warning("Please select a case first.");
        return;
      }
      const exportUser = {
        uuid: VIEWER_UUID,
        username: LOGIN_CREDENTIALS.username,
        email: LOGIN_CREDENTIALS.email || "",
        isAdmin: Boolean(LOGIN_CREDENTIALS.is_admin),
      };
      const token = encodeURIComponent(btoa(JSON.stringify(exportUser)));
      window.open(`${url3d}&auto_user=${token}`, "_blank");
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

// Max in-flight requests for the per-case detail/co-owner fetches below. These
// endpoints have no by-user batch variant (only alerts does), so the case list
// must fetch one row per case — but firing `Promise.all(cases.map(fetch))` sent
// every request at once, so a large case list produced a burst of dozens-to-
// hundreds of simultaneous connections that overwhelmed the backend. This cap
// keeps the request COUNT the same but spreads them out (≤ this many at a time).
const CASE_DETAIL_FETCH_CONCURRENCY = 5;

// Run `mapper` over `items` with at most `limit` promises in flight at once.
// Drop-in for `Promise.all(items.map(mapper))`; results keep input order.
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await mapper(items[i], i);
    }
  };
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i += 1) {
    workers.push(runWorker());
  }
  await Promise.all(workers);
  return results;
}

async function fetchAdditionalCaseDetails(caseList) {
  const logged = getLoggedInUser();
  if (!logged || !caseList?.length) return {};

  const url =
    "https://live.api.smartrpdai.com/api/smartrpd/additionalcasedetails/getall";

  // One request per case, but capped so they don't all fire at once.
  const results = await mapWithConcurrency(caseList, CASE_DETAIL_FETCH_CONCURRENCY, (c) => {
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
      .then((r) => { logApi(r, 'POST /additionalcasedetails/getall'); return r.ok ? r.json() : []; })
      .then((arr) => arr.at(-1)) // 接口返回 [ {...} ]
      .catch(() => undefined);
  });

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

// Fetch co-owner usernames per case in parallel. Mirrors the shape of
// fetchAdditionalCaseDetails — returns { [case_int_id]: string[] }.
// A case absent from the map (or with an empty array) has no co-owners.
async function fetchCoOwners(caseList) {
  const logged = getLoggedInUser();
  if (!logged || !caseList?.length) return {};

  const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";
  const url = "https://live.api.smartrpdai.com/api/smartrpd/role/all/get";

  // One request per case, but capped so they don't all fire at once.
  const results = await mapWithConcurrency(caseList, CASE_DETAIL_FETCH_CONCURRENCY, (c) => {
    const caseIntID = c.case_int_id ?? c.id;
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        { machine_id: MACHINE_ID, uuid: logged.uuid, caseIntID },
        { case_int_id: caseIntID },
      ]),
    })
      .then((r) => { logApi(r, 'POST /role/all/get'); return r.ok ? r.json() : []; })
      .then((arr) => ({ id: caseIntID, rows: Array.isArray(arr) ? arr : [] }))
      .catch(() => ({ id: caseIntID, rows: [] }));
  });
  const map = {};
  results.forEach(({ id, rows }) => {
    if (!id) return;
    const names = rows
      .filter((r) => r && r.role === "coowner" && r.username)
      .map((r) => r.username);
    if (names.length) map[String(id)] = names;
  });
  return map;
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
