// Admin machine-ID management (web counterpart of the desktop machine-ID admin
// UI). Talks to the admin-only endpoints: machineid, machineid/comments,
// machineid/delete, machineid/getall. Like the user-management page there is no
// /admin URL prefix — the server checks is_admin (Auth.authIsAdmin) from the
// caller uuid in element 0 of the request body and answers 401 for non-admins.
// The local isAdmin flag only decides what UI to show; the server stays
// authoritative.
//
// Backend shapes are CONFIRMED from the controller + model in `routes copy/`:
//   • machineid/getall  ← { search, sortByAscending, limitStartIndex, limitAmount }
//                       → 200 [{ machine_id, comments }, …]  (SELECT DISTINCT)
//                       → 404 { kind:"not_found" } when there are zero machines.
//     limitStartIndex==0 && limitAmount==0 ⇒ the model omits LIMIT ⇒ all rows.
//   • machineid         ← { machine_id, comments }  (register / INSERT)
//   • machineid/comments← { machine_id, comments }  (UPDATE comments by id)
//   • machineid/delete  ← { machine_id }            (hard DELETE by id)
// machine_id is the primary key: comment-edits and deletes are keyed on it, and
// there is no soft-delete/restore — delete removes the row.

import { toast, confirmModal } from "../shared/toast.js";
import { logApi } from "../shared/apiLog.js";
import { setupAppSidebar } from "../shared/appSidebar.js";
import { setupConnectivityIndicator } from "../shared/accessibility.js";

const API_BASE = "https://live.api.smartrpdai.com/api/smartrpd";
const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser") || "null");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// API layer
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.status = status;
    this.data = data; // full parsed error body (code/sqlMessage/sql/kind, etc.)
  }
}

async function apiPost(path, payload, label) {
  const caller = { machine_id: MACHINE_ID, uuid: getLoggedInUser()?.uuid };
  const body = payload === undefined ? [caller] : [caller, payload];

  const res = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  logApi(res, label || `POST /${path}`);

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* some endpoints may answer with an empty body */
  }

  if (!res.ok) {
    const message =
      (data?.serverErrorMessage && data.serverErrorMessage !== "..." && data.serverErrorMessage) ||
      data?.sqlMessage || data?.code || `HTTP ${res.status}`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

// getall filter: search "" ⇒ no LIKE; sort by comments ASC; 0/0 ⇒ no LIMIT so
// every machine is returned.
const MACHINE_LIST_FILTER = () => ({
  search: "",
  sortByAscending: true,
  limitStartIndex: 0,
  limitAmount: 0,
});

const api = {
  // Admin-only: full machine listing (returns 404 not_found when empty).
  listMachines: () => apiPost("machineid/getall", MACHINE_LIST_FILTER()),
  // Admin-only: register (INSERT) a machine.
  registerMachine: (m) => apiPost("machineid", m),
  // Admin-only: update a machine's comment (keyed on machine_id).
  updateComments: (m) => apiPost("machineid/comments", m),
  // Admin-only: hard-delete a machine (keyed on machine_id).
  deleteMachine: (machine_id) => apiPost("machineid/delete", { machine_id }),
};

// Map a server row to what the table needs. The getall query selects exactly
// machine_id + comments. `comments` can arrive as false (the controller's
// default when none is supplied at register time) — normalize to "".
function normalizeMachine(raw) {
  const comments = raw.comments;
  return {
    machineId: raw.machine_id ?? "",
    comments: comments === false || comments == null ? "" : String(comments),
    raw,
  };
}

// ---------------------------------------------------------------------------
// State + rendering
// ---------------------------------------------------------------------------

let allMachines = [];

// When set (via the Documented / Undocumented "View" links), restricts the list
// to machines with / without a comment. null = no restriction.
let docOnlyView = null; // null | "documented" | "undocumented"

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

// machine_id of the machine shown in the detail pane (null = none selected).
let selectedMachineId = null;

function renderMachineStats() {
  let documented = 0;
  for (const m of allMachines) if (m.comments.trim()) documented++;

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };
  set("machineStatTotal", allMachines.length);
  set("machineStatDocumented", documented);
  set("machineStatUndocumented", allMachines.length - documented);
}

function visibleMachines() {
  const q = document.getElementById("machineSearchInput").value.trim().toLowerCase();
  const filter = document.getElementById("machineDocFilter").value;

  return allMachines.filter((m) => {
    const documented = !!m.comments.trim();

    // Stat-card "View" links override the dropdown to focus one group.
    if (docOnlyView === "documented" && !documented) return false;
    if (docOnlyView === "undocumented" && documented) return false;

    if (filter === "documented" && !documented) return false;
    if (filter === "undocumented" && documented) return false;

    if (q && !m.machineId.toLowerCase().includes(q) && !m.comments.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });
}

function renderMachines() {
  const tbody = document.getElementById("machineTableBody");
  const machines = visibleMachines();

  renderMachineStats();

  if (!machines.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="au-empty">No machines to show.</td></tr>`;
    return;
  }

  // Documented first, then by machine ID.
  machines.sort(
    (a, b) =>
      (!!b.comments.trim() - !!a.comments.trim()) ||
      a.machineId.localeCompare(b.machineId)
  );

  tbody.innerHTML = machines
    .map(
      (m) => `
      <tr class="au-row${m.machineId === selectedMachineId ? " is-active" : ""}" data-machine-id="${esc(m.machineId)}" role="button" tabindex="0">
        <td class="mid-id">${esc(m.machineId) || "—"}</td>
        <td>${
          m.comments.trim()
            ? `<span class="mid-comment" title="${esc(m.comments)}">${esc(m.comments)}</span>`
            : `<span class="mid-comment-empty">No comment</span>`
        }</td>
        <td class="cm-td-actions">
          <div class="au-actions">
            <button type="button" class="cm-icon-btn" data-action="edit" title="Edit comment" aria-label="Edit comment">
              <i class="fa fa-pen" aria-hidden="true"></i>
            </button>
            <button type="button" class="cm-icon-btn" data-action="delete" title="Delete" aria-label="Delete machine">
              <i class="fa fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Machine detail pane
// ---------------------------------------------------------------------------

function openMachineDetail(machine) {
  if (!machine) return;
  selectedMachineId = machine.machineId;

  document.getElementById("machineDetailEmpty")?.classList.add("hidden");
  document.getElementById("machineDetailContent")?.classList.remove("hidden");

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set("machineDetailTitle", machine.comments.trim() || machine.machineId || "—");
  set("machineDetailId", machine.machineId || "—");
  set("machineDetailComment", machine.comments.trim() || "No comment");

  document.querySelectorAll("#machineTableBody tr").forEach((tr) =>
    tr.classList.toggle("is-active", tr.dataset.machineId === machine.machineId)
  );
  document.querySelector(".cm-page")?.classList.add("show-details");
}

function closeMachineDetail() {
  document.querySelector(".cm-page")?.classList.remove("show-details");
}

// After a mutation + reload, re-populate the detail pane from the fresh data
// if that machine is still selected (or close it if it was deleted).
function refreshDetailIfSelected(machineId) {
  if (selectedMachineId !== machineId) return;
  const fresh = allMachines.find((m) => m.machineId === machineId);
  if (fresh) openMachineDetail(fresh);
  else {
    selectedMachineId = null;
    document.getElementById("machineDetailContent")?.classList.add("hidden");
    document.getElementById("machineDetailEmpty")?.classList.remove("hidden");
    closeMachineDetail();
  }
}

// ---------------------------------------------------------------------------
// Data loading + admin gate
// ---------------------------------------------------------------------------

function showGate(message) {
  document.getElementById("adminToolbar").classList.add("hidden");
  document.getElementById("machineListWrap").classList.add("hidden");
  const statsBar = document.getElementById("machineStatsBar");
  if (statsBar) statsBar.style.display = "none";
  document.getElementById("machineDetail")?.classList.add("hidden");
  const gate = document.getElementById("adminGate");
  gate.classList.remove("hidden");
  if (message) document.getElementById("adminGateMessage").textContent = message;
}

async function loadMachines() {
  const tbody = document.getElementById("machineTableBody");
  tbody.innerHTML = `<tr><td colspan="3" class="au-empty">Loading machines…</td></tr>`;

  try {
    const data = await api.listMachines();
    const rows = Array.isArray(data) ? data : data?.machines;
    if (!Array.isArray(rows)) {
      console.warn("[admin] unexpected machineid/getall payload:", data);
      throw new ApiError("Unexpected response from machineid/getall.", 200);
    }
    allMachines = rows.filter((r) => r && typeof r === "object").map(normalizeMachine);
    renderMachines();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // Server disagrees with the local isAdmin flag — server wins.
      showGate("The server rejected this account (admin auth failed).");
      return;
    }
    // getall answers 404 { kind:"not_found" } when there are simply no machines
    // registered yet — that's an empty list, not an error.
    if (err instanceof ApiError && err.status === 404) {
      allMachines = [];
      renderMachines();
      return;
    }
    console.error("Failed to load machines:", err);
    tbody.innerHTML = `<tr><td colspan="3" class="au-empty">Failed to load machines — ${esc(err.message)}</td></tr>`;
    toast.error("Failed to load machines.");
  }
}

// ---------------------------------------------------------------------------
// Register / edit modal
// ---------------------------------------------------------------------------

let editingMachine = null; // null = register mode

function openMachineModal(machine = null) {
  editingMachine = machine;

  document.getElementById("machineModalTitle").textContent = machine
    ? "Edit Comment"
    : "Register Machine";

  const idInput = document.getElementById("mmMachineId");
  idInput.value = machine?.machineId ?? "";
  // machine_id is the primary key; only the comment is editable when editing.
  idInput.readOnly = !!machine;

  document.getElementById("mmComments").value = machine?.comments ?? "";
  document.getElementById("machineFormError").textContent = "";

  document.getElementById("machineModal").classList.add("show");
  (machine ? document.getElementById("mmComments") : idInput).focus();
}

function closeMachineModal() {
  document.getElementById("machineModal").classList.remove("show");
  editingMachine = null;
}

async function submitMachineForm() {
  const machineId = document.getElementById("mmMachineId").value.trim();
  const comments = document.getElementById("mmComments").value.trim();
  const errEl = document.getElementById("machineFormError");

  errEl.textContent = "";
  if (!machineId) {
    errEl.textContent = "Please enter a machine ID.";
    return;
  }

  // Register mode: reject a duplicate up front (INSERT would fail on the PK).
  if (!editingMachine && allMachines.some((m) => m.machineId === machineId)) {
    errEl.textContent = "A machine with that ID is already registered.";
    return;
  }

  const btn = document.getElementById("saveMachineBtn");
  btn.disabled = true;
  try {
    if (editingMachine) {
      await api.updateComments({ machine_id: machineId, comments });
      toast.success("Comment updated.");
    } else {
      await api.registerMachine({ machine_id: machineId, comments });
      toast.success("Machine registered.");
    }
    closeMachineModal();
    await loadMachines();
    refreshDetailIfSelected(machineId);
  } catch (err) {
    console.error("Save machine failed:", err);
    errEl.textContent = err.message || "Request failed.";
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

async function handleRowAction(action, machine) {
  if (action === "edit") {
    openMachineModal(machine);
    return;
  }

  if (action === "delete") {
    const label = machine.comments.trim() || machine.machineId;
    const ok = await confirmModal({
      title: `Delete "${label}"?`,
      message: "This permanently removes the machine ID. This cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteMachine(machine.machineId);
      toast.success("Machine deleted.");
      await loadMachines();
      refreshDetailIfSelected(machine.machineId);
    } catch (err) {
      console.error("Delete machine failed:", err);
      toast.error(`Delete failed — ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const me = getLoggedInUser();
  if (!me?.uuid) {
    window.location.href = "../../../index.html";
    return;
  }

  // Populate the header user chip from the logged-in account.
  const uname = me.username || "User";
  const nameEl = document.getElementById("adminUserName");
  const avatarEl = document.getElementById("adminUserAvatar");
  if (nameEl) nameEl.textContent = uname;
  if (avatarEl) avatarEl.textContent = uname.charAt(0);
  const footerUser = document.getElementById("footerUserName");
  if (footerUser) footerUser.textContent = uname;

  // User chip → dropdown with Logout.
  const chip = document.getElementById("adminUserChip");
  const chipMenu = document.getElementById("adminUserDropdown");
  if (chip && chipMenu) {
    const toggleChip = (e) => {
      e.stopPropagation();
      const open = chipMenu.classList.toggle("hidden") === false;
      chip.setAttribute("aria-expanded", String(open));
    };
    chip.addEventListener("click", toggleChip);
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") toggleChip(e);
    });
    document.addEventListener("click", (e) => {
      if (chipMenu.classList.contains("hidden")) return;
      if (!chipMenu.contains(e.target) && !chip.contains(e.target)) {
        chipMenu.classList.add("hidden");
        chip.setAttribute("aria-expanded", "false");
      }
    });
  }
  document.getElementById("userChipLogout")?.addEventListener("click", async () => {
    const ok = await confirmModal({
      title: "Log out?",
      message: "You'll need to sign in again to access the admin tools.",
      confirmText: "Log out",
      cancelText: "Cancel",
      variant: "info",
    });
    if (!ok) return;
    try { localStorage.removeItem("loggedInUser"); } catch { /* ignore */ }
    window.location.href = "../../../index.html";
  });

  // This page is admin-only, so return to the admin case list — a sibling in
  // the same src/pages/admin/ folder.
  const goBack = () => (window.location.href = "./admin_case_list.html");
  document.getElementById("backToCasesBtn").addEventListener("click", goBack);
  document.getElementById("gateBackBtn").addEventListener("click", goBack);

  // Footer hamburger opens the shared slide-in sidebar (same as the case list).
  // This page sits in src/pages/admin/, so index.html is three levels up.
  setupAppSidebar({ indexHref: "../../../index.html" });

  // Footer connectivity (wifi) indicator, matching the case list.
  setupConnectivityIndicator(document.getElementById("footerConnection"));

  // UI-only pre-gate; the server re-checks on every call anyway.
  if (Number(me.isAdmin) !== 1) {
    showGate();
    return;
  }

  document.getElementById("refreshMachinesBtn").addEventListener("click", loadMachines);
  document.getElementById("registerMachineBtn").addEventListener("click", () => openMachineModal());
  document.getElementById("machineSearchInput").addEventListener("input", renderMachines);
  document.getElementById("machineDocFilter").addEventListener("change", renderMachines);

  // Stat-card "View" links: focus the list on documented / undocumented machines
  // and sync the dropdown so the state reads consistently.
  const wireDocLink = (linkId, group) => {
    const link = document.getElementById(linkId);
    link?.addEventListener("click", (e) => {
      e.preventDefault();
      const activating = docOnlyView !== group;
      docOnlyView = activating ? group : null;
      const sel = document.getElementById("machineDocFilter");
      if (sel) sel.value = activating ? group : "all";
      // Reset the sibling link's label.
      document.getElementById(
        group === "documented" ? "viewUndocumentedLink" : "viewDocumentedLink"
      ).textContent = "View";
      document.getElementById("viewUndocumentedLink").classList.remove("is-active");
      document.getElementById("viewDocumentedLink").classList.remove("is-active");
      link.textContent = activating ? "Back to all" : "View";
      link.classList.toggle("is-active", activating);
      renderMachines();
    });
  };
  wireDocLink("viewDocumentedLink", "documented");
  wireDocLink("viewUndocumentedLink", "undocumented");

  // Keep the dropdown authoritative if the user changes it directly.
  document.getElementById("machineDocFilter").addEventListener("change", () => {
    docOnlyView = null;
    ["viewDocumentedLink", "viewUndocumentedLink"].forEach((id) => {
      const l = document.getElementById(id);
      if (l) { l.textContent = "View"; l.classList.remove("is-active"); }
    });
  });

  // Detail pane: back button (mobile) + edit / delete actions.
  document.getElementById("machineBackToListBtn")?.addEventListener("click", closeMachineDetail);
  document.getElementById("machineDetailEditBtn")?.addEventListener("click", () => {
    const m = allMachines.find((x) => x.machineId === selectedMachineId);
    if (m) openMachineModal(m);
  });
  document.getElementById("machineDetailDeleteBtn")?.addEventListener("click", () => {
    const m = allMachines.find((x) => x.machineId === selectedMachineId);
    if (m) handleRowAction("delete", m);
  });

  document.getElementById("closeMachineModal").addEventListener("click", closeMachineModal);
  document.getElementById("cancelMachineModal").addEventListener("click", closeMachineModal);
  document.getElementById("machineForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitMachineForm();
  });
  document.getElementById("machineModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeMachineModal();
  });

  // Event-delegated row actions + row selection (opens the detail pane).
  document.getElementById("machineTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (btn) {
      const id = btn.closest("tr")?.dataset.machineId;
      const machine = allMachines.find((m) => m.machineId === id);
      if (machine) handleRowAction(btn.dataset.action, machine);
      return;
    }
    const row = e.target.closest("tr[data-machine-id]");
    if (!row) return;
    const machine = allMachines.find((m) => m.machineId === row.dataset.machineId);
    if (machine) openMachineDetail(machine);
  });
  // Keyboard: Enter/Space on a focused row opens the detail pane.
  document.getElementById("machineTableBody").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest("tr[data-machine-id]");
    if (!row) return;
    e.preventDefault();
    const machine = allMachines.find((m) => m.machineId === row.dataset.machineId);
    if (machine) openMachineDetail(machine);
  });

  loadMachines();
});
