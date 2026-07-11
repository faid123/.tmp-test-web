// Admin user management (web counterpart of the desktop UI_AdminUserListing).
// Talks to the admin-only endpoints: user/getall, user/register, user/modify,
// user/delete, user/restore. There is no /admin URL prefix — the server checks
// is_admin from the caller uuid in element 0 of the request body and answers
// 401 {"serverErrorMessage":"admin auth failed"} for non-admins. The local
// isAdmin flag only decides what UI to show; the server stays authoritative.
//
// NOTE: request shapes follow the codebase-wide [{machine_id, uuid}, {...}]
// convention, verified live for user/getall's error path. The success payload
// of getall and the exact mutation payloads are unverified until first run
// with a real admin account — everything shape-related is centralized in the
// api object + normalizeUser below so adjustments stay one-line.

import { toast, confirmModal } from "../toast.js";
import { logApi } from "../apiLog.js";
import { setupAppSidebar } from "../appSidebar.js";
import { setupConnectivityIndicator } from "../accessibility.js";

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
    this.data = data; // full parsed error body (code/sqlMessage/sql, etc.)
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
    // serverErrorMessage is sometimes just "..."; prefer a meaningful field.
    const message =
      (data?.serverErrorMessage && data.serverErrorMessage !== "..." && data.serverErrorMessage) ||
      data?.sqlMessage || data?.code || `HTTP ${res.status}`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

// user/getall → User.getAll(fromDate, toDate, search, sortBy, sortByAscending,
// limitStartIndex, limitAmount) — parameter names confirmed from the backend
// route/controller/model (smartrpd.controller.getAllUsers → user.model.getAll).
//
// Model behaviour that drives the values below:
//   • fromDate == 0 && toDate == 0  → no create_time WHERE clause (all dates).
//   • search === ""                 → no username LIKE filter.
//   • sortBy: 0 = none, 1 = username, 2 = email, 3 = create_time, 4 = is_admin;
//     sortByAscending toggles ASC/DESC.
//   • limitStartIndex == 0 && limitAmount == 0 → NO LIMIT clause is emitted, so
//     every row is returned. (The earlier 500 "LIMIT undefined,undefined" was
//     just these two keys arriving undefined under the wrong names.)
const USER_LIST_FILTER = () => ({
  fromDate: 0,          // 0 = no lower bound
  toDate: 0,            // 0 = no upper bound → all users regardless of date
  search: "",           // no username filter
  sortBy: 1,            // sort by username
  sortByAscending: true,
  limitStartIndex: 0,   // 0 + 0 ⇒ model omits LIMIT ⇒ returns every user
  limitAmount: 0,
});

const api = {
  // Admin-only: full user listing (see USER_LIST_FILTER note re: pagination).
  listUsers: () => apiPost("user/getall", USER_LIST_FILTER()),
  // Admin-only: create a user. is_admin follows login's 0/1 numeric flag.
  registerUser: (u) => apiPost("user/register", u),
  // Admin-only: modify an existing user (target identified by uuid).
  modifyUser: (u) => apiPost("user/modify", u),
  // Admin-only: soft-delete / restore (restore implies delete is soft).
  deleteUser: (uuid) => apiPost("user/delete", { uuid }),
  restoreUser: (uuid) => apiPost("user/restore", { uuid }),
};

// Map a server row to what the table needs. Column names are CONFIRMED from the
// query user/getall runs — SELECT username, email, create_time, is_admin, uuid,
// deleted FROM users — captured live 2026-07-10. (Kept a couple of fallback
// spellings for safety, but is_admin/deleted/create_time are the real ones.)
function normalizeUser(raw) {
  return {
    uuid: raw.uuid ?? raw.user_uuid ?? "",
    username: raw.username ?? raw.user_name ?? "",
    email: raw.email ?? "",
    isAdmin: Number(raw.is_admin ?? raw.isAdmin ?? 0) === 1,
    deleted: Number(raw.deleted ?? raw.is_deleted ?? raw.isDeleted ?? 0) === 1,
    createTime: raw.create_time ?? null,
    raw,
  };
}

// ---------------------------------------------------------------------------
// State + rendering
// ---------------------------------------------------------------------------

let allUsers = [];

// Which month the "New Users" card shows: 0 = current, -1 = last month, …
let newUsersMonthOffset = 0;

// Normalize a timestamp (unix seconds/ms or a date string) to ms, or null.
function tsToMs(ts) {
  if (ts == null || ts === "" || ts === 0 || ts === "0") return null;
  const n = Number(ts);
  if (Number.isFinite(n)) {
    if (n <= 0) return null;
    return String(n).length >= 13 ? n : n * 1000;
  }
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

// [start, end) ms bounds for the month at `offset` relative to the current one.
function monthRange(offset) {
  const n = new Date();
  return {
    start: new Date(n.getFullYear(), n.getMonth() + offset, 1).getTime(),
    end: new Date(n.getFullYear(), n.getMonth() + offset + 1, 1).getTime(),
  };
}

// Overview cards, mirroring the admin case list's stats bar.
function renderUserStats() {
  const now = new Date();
  const { start, end } = monthRange(newUsersMonthOffset);

  let admins = 0, active = 0, deleted = 0, newMonth = 0;
  for (const u of allUsers) {
    if (u.isAdmin) admins++;
    if (u.deleted) deleted++; else active++;
    const ms = tsToMs(u.createTime);
    if (ms != null && ms >= start && ms < end) newMonth++;
  }

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };
  set("userStatTotal", allUsers.length);
  set("userStatAdmins", admins);
  set("userStatActive", active);
  set("userStatDeactivated", deleted);
  set("userStatNew", newMonth);

  const md = new Date(now.getFullYear(), now.getMonth() + newUsersMonthOffset, 1);
  const name = md.toLocaleString(undefined, { month: "long" });
  const label = md.getFullYear() === now.getFullYear() ? name : `${name} ${md.getFullYear()}`;
  set("userStatNewLabel", `New Users (${label})`);

  document
    .querySelectorAll('[data-user-month-delta="1"]')
    .forEach((b) => (b.disabled = newUsersMonthOffset >= 0));
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

// uuid of the user shown in the detail pane (null = none selected).
let selectedUserUuid = null;

// Format a registration timestamp as a short date, or "—".
function formatRegDate(ts) {
  const ms = tsToMs(ts);
  if (ms == null) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function visibleUsers() {
  const q = document.getElementById("userSearchInput").value.trim().toLowerCase();
  const status = document.getElementById("userStatusFilter").value;
  const dateVal = document.getElementById("userDateFilter")?.value || "";

  return allUsers.filter((u) => {
    // Default is Active; "deactivated" shows only deactivated; "all" shows both.
    if (status === "active" && u.deleted) return false;
    if (status === "deactivated" && !u.deleted) return false;

    if (q && !u.username.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
      return false;
    }

    // Filter by registration date (compare calendar day).
    if (dateVal) {
      const ms = tsToMs(u.createTime);
      if (ms == null) return false;
      const d = new Date(ms);
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (ymd !== dateVal) return false;
    }
    return true;
  });
}

function renderUsers() {
  const tbody = document.getElementById("userTableBody");
  const users = visibleUsers();

  renderUserStats();

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="au-empty">No users to show.</td></tr>`;
    return;
  }

  // Active users first, then alphabetically.
  users.sort((a, b) => (a.deleted - b.deleted) || a.username.localeCompare(b.username));

  tbody.innerHTML = users
    .map(
      (u) => `
      <tr class="au-row ${u.deleted ? "au-row-deleted" : ""}${u.uuid === selectedUserUuid ? " is-active" : ""}" data-uuid="${esc(u.uuid)}" role="button" tabindex="0">
        <td>${esc(u.username) || "—"}</td>
        <td>${esc(u.email) || "—"}</td>
        <td><span class="au-badge ${u.isAdmin ? "au-badge-admin" : "au-badge-user"}">${u.isAdmin ? "Admin" : "User"}</span></td>
        <td><span class="au-badge ${u.deleted ? "au-badge-deleted" : "au-badge-active"}">${u.deleted ? "Deactivated" : "Active"}</span></td>
        <td>${esc(formatRegDate(u.createTime))}</td>
        <td class="cm-td-actions">
          <div class="au-actions">
            <button type="button" class="cm-icon-btn" data-action="edit" title="Edit" aria-label="Edit ${esc(u.username)}">
              <i class="fa fa-pen" aria-hidden="true"></i>
            </button>
            ${
              u.deleted
                ? `<button type="button" class="cm-icon-btn" data-action="reactivate" title="Reactivate" aria-label="Reactivate ${esc(u.username)}">
                     <i class="fa fa-rotate-left" aria-hidden="true"></i>
                   </button>`
                : `<button type="button" class="cm-icon-btn" data-action="deactivate" title="Deactivate" aria-label="Deactivate ${esc(u.username)}">
                     <i class="fa fa-user-slash" aria-hidden="true"></i>
                   </button>`
            }
          </div>
        </td>
      </tr>`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// User detail pane
// ---------------------------------------------------------------------------

function openUserDetail(user) {
  if (!user) return;
  selectedUserUuid = user.uuid;

  document.getElementById("userDetailEmpty")?.classList.add("hidden");
  document.getElementById("userDetailContent")?.classList.remove("hidden");

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set("userDetailAvatar", (user.username || "?").charAt(0));
  set("userDetailName", user.username || "—");
  set("userDetailEmail", user.email || "—");
  set("userDetailRole", user.isAdmin ? "Administrator" : "User");
  set("userDetailStatus", user.deleted ? "Deactivated" : "Active");
  set("userDetailDate", formatRegDate(user.createTime));
  set("userDetailUuid", user.uuid || "—");

  const toggleBtn = document.getElementById("userDetailToggleBtn");
  if (toggleBtn) toggleBtn.textContent = user.deleted ? "Reactivate" : "Deactivate";

  // Highlight the selected row + slide the pane in on mobile.
  document.querySelectorAll("#userTableBody tr").forEach((tr) =>
    tr.classList.toggle("is-active", tr.dataset.uuid === user.uuid)
  );
  document.querySelector(".cm-page")?.classList.add("show-details");
}

function closeUserDetail() {
  document.querySelector(".cm-page")?.classList.remove("show-details");
}

// ---------------------------------------------------------------------------
// Data loading + admin gate
// ---------------------------------------------------------------------------

function showGate(message) {
  document.getElementById("adminToolbar").classList.add("hidden");
  document.getElementById("userListWrap").classList.add("hidden");
  const statsBar = document.getElementById("userStatsBar");
  if (statsBar) statsBar.style.display = "none";
  document.getElementById("userDetail")?.classList.add("hidden");
  const gate = document.getElementById("adminGate");
  gate.classList.remove("hidden");
  if (message) document.getElementById("adminGateMessage").textContent = message;
}

async function loadUsers() {
  const tbody = document.getElementById("userTableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="au-empty">Loading users…</td></tr>`;

  try {
    const data = await api.listUsers();
    const rows = Array.isArray(data) ? data : data?.users;
    if (!Array.isArray(rows)) {
      console.warn("[admin] unexpected user/getall payload:", data);
      throw new ApiError("Unexpected response from user/getall.", 200);
    }
    // First real admin run: surface the row shape once so normalizeUser can be
    // corrected quickly if the field names differ.
    if (rows[0]) console.log("[admin] user row keys:", Object.keys(rows[0]));

    allUsers = rows.filter((r) => r && typeof r === "object").map(normalizeUser);
    renderUsers();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // Server disagrees with the local isAdmin flag — server wins.
      showGate("The server rejected this account (admin auth failed).");
      return;
    }
    // Detect the old pagination SQL error as a safety net; the request now
    // sends the confirmed limit params (0/0 → no LIMIT), so this should no
    // longer trip, but keep a clear message in case the backend changes.
    const errBlob = err instanceof ApiError
      ? `${err.message} ${err.data?.code || ""} ${err.data?.sql || ""}`
      : "";
    const isPaginationBug =
      err instanceof ApiError && err.status >= 500 &&
      /ER_SP_UNDECLARED_VAR|undeclared|LIMIT undefined/i.test(errBlob);
    const msg = isPaginationBug
      ? "The user list endpoint (user/getall) rejected the pagination parameters. Backend fix required."
      : `Failed to load users — ${esc(err.message)}`;
    console.error("Failed to load users:", err);
    tbody.innerHTML = `<tr><td colspan="6" class="au-empty">${isPaginationBug ? esc(msg) : msg}</td></tr>`;
    toast.error(isPaginationBug ? "Backend can't list users (see table)." : "Failed to load users.");
  }
}

// ---------------------------------------------------------------------------
// Register / edit modal
// ---------------------------------------------------------------------------

let editingUser = null; // null = register mode

function openUserModal(user = null) {
  editingUser = user;
  const modal = document.getElementById("userModal");

  document.getElementById("userModalTitle").textContent = user ? "Edit User" : "Register User";
  document.getElementById("umUsername").value = user?.username ?? "";
  document.getElementById("umEmail").value = user?.email ?? "";
  document.getElementById("umPassword").value = "";
  document.getElementById("umIsAdmin").checked = !!user?.isAdmin;
  document.getElementById("umPassword").required = !user;
  document.getElementById("umPasswordReq").classList.toggle("hidden", !!user);
  document.getElementById("umPasswordHint").classList.toggle("hidden", !user);
  document.getElementById("userFormError").textContent = "";

  modal.classList.add("show");
  document.getElementById("umUsername").focus();
}

function closeUserModal() {
  document.getElementById("userModal").classList.remove("show");
  editingUser = null;
}

async function submitUserForm() {
  const username = document.getElementById("umUsername").value.trim();
  const email = document.getElementById("umEmail").value.trim();
  const password = document.getElementById("umPassword").value;
  const isAdmin = document.getElementById("umIsAdmin").checked ? 1 : 0;
  const errEl = document.getElementById("userFormError");

  errEl.textContent = "";
  if (!username || !email || (!editingUser && !password)) {
    errEl.textContent = "Please fill in all required fields.";
    return;
  }

  const btn = document.getElementById("saveUserBtn");
  btn.disabled = true;
  try {
    if (editingUser) {
      const payload = { uuid: editingUser.uuid, username, email, is_admin: isAdmin };
      if (password) payload.password = password;
      await api.modifyUser(payload);
      toast.success(`User "${username}" updated.`);
    } else {
      await api.registerUser({ username, email, password, is_admin: isAdmin });
      toast.success(`User "${username}" registered.`);
    }
    closeUserModal();
    await loadUsers();
  } catch (err) {
    console.error("Save user failed:", err);
    errEl.textContent = err.message || "Request failed.";
  } finally {
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

async function handleRowAction(action, user) {
  if (action === "edit") {
    openUserModal(user);
    return;
  }

  if (action === "deactivate") {
    const me = getLoggedInUser();
    if (user.uuid && user.uuid === me?.uuid) {
      toast.error("You cannot deactivate the account you are logged in with.");
      return;
    }
    const ok = await confirmModal({
      title: `Deactivate "${user.username}"?`,
      message: "The user will no longer be able to sign in. They can be reactivated later.",
      confirmText: "Deactivate",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteUser(user.uuid);
      toast.success(`User "${user.username}" deactivated.`);
      await loadUsers();
      refreshDetailIfSelected(user.uuid);
    } catch (err) {
      console.error("Deactivate user failed:", err);
      toast.error(`Deactivate failed — ${err.message}`);
    }
    return;
  }

  if (action === "reactivate") {
    try {
      await api.restoreUser(user.uuid);
      toast.success(`User "${user.username}" reactivated.`);
      await loadUsers();
      refreshDetailIfSelected(user.uuid);
    } catch (err) {
      console.error("Reactivate user failed:", err);
      toast.error(`Reactivate failed — ${err.message}`);
    }
  }
}

// After a mutation + reload, re-populate the detail pane from the fresh data
// if that user is still the selected one.
function refreshDetailIfSelected(uuid) {
  if (selectedUserUuid !== uuid) return;
  const fresh = allUsers.find((u) => u.uuid === uuid);
  if (fresh) openUserDetail(fresh);
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

  // This page is admin-only, so return to the admin case list — now a sibling
  // in the same src/pages/admin/ folder.
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

  document.getElementById("refreshUsersBtn").addEventListener("click", loadUsers);
  document.getElementById("registerUserBtn").addEventListener("click", () => openUserModal());
  document.getElementById("userSearchInput").addEventListener("input", renderUsers);
  document.getElementById("userStatusFilter").addEventListener("change", renderUsers);

  // Registration-date filter + its clear button.
  document.getElementById("userDateFilter")?.addEventListener("change", renderUsers);
  document.getElementById("clearUserDateBtn")?.addEventListener("click", () => {
    const d = document.getElementById("userDateFilter");
    if (d) d.value = "";
    renderUsers();
  });

  // "View" link under the Deactivated card: jump the status filter to
  // deactivated (and toggle back to active).
  const viewDeactivatedLink = document.getElementById("viewDeactivatedLink");
  viewDeactivatedLink?.addEventListener("click", (e) => {
    e.preventDefault();
    const sel = document.getElementById("userStatusFilter");
    const showingDeactivated = sel.value === "deactivated";
    sel.value = showingDeactivated ? "active" : "deactivated";
    viewDeactivatedLink.textContent = showingDeactivated ? "View" : "Back to active";
    viewDeactivatedLink.classList.toggle("is-active", !showingDeactivated);
    renderUsers();
  });

  // Detail pane: back button (mobile) + edit / deactivate-reactivate actions.
  document.getElementById("userBackToListBtn")?.addEventListener("click", closeUserDetail);
  document.getElementById("userDetailEditBtn")?.addEventListener("click", () => {
    const u = allUsers.find((x) => x.uuid === selectedUserUuid);
    if (u) openUserModal(u);
  });
  document.getElementById("userDetailToggleBtn")?.addEventListener("click", () => {
    const u = allUsers.find((x) => x.uuid === selectedUserUuid);
    if (u) handleRowAction(u.deleted ? "reactivate" : "deactivate", u);
  });

  // "New Users" month stepper (never into the future).
  document.querySelectorAll("[data-user-month-delta]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = newUsersMonthOffset + Number(btn.dataset.userMonthDelta);
      if (next > 0) return;
      newUsersMonthOffset = next;
      renderUserStats();
    });
  });

  document.getElementById("closeUserModal").addEventListener("click", closeUserModal);
  document.getElementById("cancelUserModal").addEventListener("click", closeUserModal);
  document.getElementById("userForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitUserForm();
  });
  document.getElementById("userModal").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeUserModal();
  });

  // Event-delegated row actions + row selection (opens the detail pane).
  document.getElementById("userTableBody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (btn) {
      const uuid = btn.closest("tr")?.dataset.uuid;
      const user = allUsers.find((u) => u.uuid === uuid);
      if (user) handleRowAction(btn.dataset.action, user);
      return;
    }
    // Click anywhere else on the row → open the detail pane.
    const row = e.target.closest("tr[data-uuid]");
    if (!row) return;
    const user = allUsers.find((u) => u.uuid === row.dataset.uuid);
    if (user) openUserDetail(user);
  });
  // Keyboard: Enter/Space on a focused row opens the detail pane.
  document.getElementById("userTableBody").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest("tr[data-uuid]");
    if (!row) return;
    e.preventDefault();
    const user = allUsers.find((u) => u.uuid === row.dataset.uuid);
    if (user) openUserDetail(user);
  });

  loadUsers();
});
