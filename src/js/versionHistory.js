// ../js/versionHistory.js
(function () {
  const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

  // ---------- Utils ----------
  function getLoggedInUser() {
    try {
      const s = localStorage.getItem("loggedInUser");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }

  function getActiveCaseId() {
    if (window.selectedCaseId) return window.selectedCaseId; // 优先用已选中的
    const tr = document.querySelector(".table-body-wrapper .case-table tbody tr.active");
    const id = tr?.dataset?.caseId;
    return id ? Number(id) : null;
  }

  function initialsFrom(name = "") {
    const p = name.trim().split(/\s+/);
    if (!p[0]) return "?";
    return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  }

  function actionToKey(s = "") {
    s = s.toLowerCase();
    if (s.includes("create"))  return "created";
    if (s.includes("edit"))    return "edited";
    if (s.includes("share"))   return "shared";
    if (s.includes("approve")) return "approved";
    if (s.includes("print"))   return "printing";
    return "other";
  }

  function formatMs(ms) {
    if (!ms) return "N/A";
    const t = ms.toString().length === 13 ? Number(ms) : Number(ms) * 1000;
    return new Date(t).toLocaleString();
  }

// 统一灰色线条风格的 SVG 图标
const ICON_STYLE = 'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

const TYPE_ICON = {
  created:  `<svg ${ICON_STYLE}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  edited:   `<svg ${ICON_STYLE}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`,
  shared:   `<svg ${ICON_STYLE}><polyline points="16 6 20 10 16 14"/><path d="M4 12v-2a4 4 0 0 1 4-4h8"/><path d="M20 10v2a4 4 0 0 1-4 4H8"/></svg>`,
  approved: `<svg ${ICON_STYLE}><polyline points="20 6 9 17 4 12"/></svg>`,
  printing: `<svg ${ICON_STYLE}><polyline points="6 9 6 2 18 2 18 9"/><rect x="6" y="14" width="12" height="8"/><path d="M20 9h-16a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h2"/></svg>`,
  other:    `<svg ${ICON_STYLE}><circle cx="12" cy="12" r="3"/></svg>`
};


  // ---------- Fetch helpers ----------
  // 参与者 → 建索引：支持 user_id / id / uuid / username(lower) / email前缀(lower)
  async function fetchUserIndexForCase(caseIntID, uuid) {
    try {
      const res = await fetch("https://live.api.smartrpdai.com/api/smartrpd/role/all/get", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { machine_id: MACHINE_ID, uuid, caseIntID },
          { case_int_id: caseIntID }
        ])
      });
      if (!res.ok) return new Map();
      const arr = await res.json();

      const idx = new Map();
      arr.forEach(u => {
        const name = u.username || (u.email ? u.email.split("@")[0] : "") || "Unknown";
        const actor = { name, initials: initialsFrom(name) };

        const keys = [
          u.user_id,                 // 后端可能提供
          u.id,
          u.uuid,
          name ? name.toLowerCase() : null,
          u.email ? u.email.split("@")[0].toLowerCase() : null
        ].filter(k => k !== null && k !== undefined && k !== "");

        keys.forEach(k => idx.set(String(k).toLowerCase(), actor));
      });

      return idx;
    } catch {
      return new Map();
    }
  }

  async function fetchCaseHistory(caseIntID, uuid) {
    const res = await fetch("https://live.api.smartrpdai.com/api/smartrpd/casehistory/getall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ machine_id: MACHINE_ID, uuid, caseIntID }])
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  // ---------- Render ----------
  function resolveActor(userIndex, rawUserId) {
    if (rawUserId === null || rawUserId === undefined || rawUserId === "") {
      return { name: "Unknown", initials: "?" };
    }
    const key = String(rawUserId).toLowerCase();

    // 精确命中：user_id / id / uuid / username(lower) / email前缀(lower)
    if (userIndex.has(key)) return userIndex.get(key);

    // 兜底：如果 user_id 是 email 全称，试下前缀
    if (key.includes("@")) {
      const prefix = key.split("@")[0];
      if (userIndex.has(prefix)) return userIndex.get(prefix);
    }

    return { name: String(rawUserId), initials: initialsFrom(String(rawUserId)) };
  }

  function renderVersionList(items, userIndex) {
    const listEl = document.getElementById("versionList");
    if (!listEl) return;

    items.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));

    if (!items.length) {
      listEl.innerHTML = `<li class="vh-item">
        <div class="vh-row">
          <div class="vh-op">•</div>
          <div class="vh-col">
            <div class="vh-line1"><span class="vh-op-label">No history</span></div>
            <div class="vh-line2">
              <span class="vh-user"><span class="vh-user-name">—</span></span>
              <time class="vh-timestamp">—</time>
            </div>
          </div>
        </div>
      </li>`;
      return;
    }

    listEl.innerHTML = items.map(it => {
      const key   = actionToKey(it.action || "");
      const icon  = TYPE_ICON[key] || TYPE_ICON.other;
      const actor = resolveActor(userIndex, it.user_id);
      const timeTx= formatMs(it.datetime);

      return `
        <li class="vh-item" data-id="${it.id}" data-op="${key}"
            data-user-id="${it.user_id ?? ""}" data-ts="${it.datetime ?? ""}">
          <div class="vh-row">
            <div class="vh-op" aria-hidden="true">${icon}</div>
            <div class="vh-col">
              <div class="vh-line1">
                <span class="vh-op-label">${it.action || "—"}</span>
              </div>
              <div class="vh-line2">
                <span class="vh-user">
                  <span class="vh-avatar" title="${actor.name}">${actor.initials}</span>
                  <span class="vh-user-name">${actor.name}</span>
                </span>
                <time class="vh-timestamp" datetime="${it.datetime || ""}">${timeTx}</time>
              </div>
            </div>
          </div>
        </li>`;
    }).join("");
  }

  // ---------- Modal ----------
  function openModal() {
    const m = document.getElementById("versionHistoryModal");
    m?.classList.remove("hidden"); m?.classList.add("show");
  }
  function closeModal() {
    const m = document.getElementById("versionHistoryModal");
    m?.classList.remove("show"); m?.classList.add("hidden");
  }

  // ---------- Bind ----------
  document.addEventListener("DOMContentLoaded", () => {
    const btn     = document.getElementById("viewVersionBtn");
    const modal   = document.getElementById("versionHistoryModal");
    const closeBtn= document.getElementById("closeVersionModal");
    const listEl  = document.getElementById("versionList");

    if (!btn || !modal || !listEl) return;

    btn.addEventListener("click", async () => {
      // 收起菜单
      document.getElementById("caseDropdown")?.classList.add("hidden");

      const caseId = getActiveCaseId();
      const user   = getLoggedInUser();

      if (!caseId || !user?.uuid) {
        alert("⚠️ Please select a case first.");
        return;
      }

      // 打开 + Loading
      listEl.innerHTML = `<li class="vh-item">
        <div class="vh-row">
          <div class="vh-op">…</div>
          <div class="vh-col">
            <div class="vh-line1"><span class="vh-op-label">Loading…</span></div>
            <div class="vh-line2">
              <span class="vh-user"><span class="vh-user-name">Please wait</span></span>
              <time class="vh-timestamp">—</time>
            </div>
          </div>
        </div>
      </li>`;
      openModal();

      try {
        // 并发拉取：历史 + 参与者索引
        const [hist, userIndex] = await Promise.all([
          fetchCaseHistory(caseId, user.uuid),
          fetchUserIndexForCase(caseId, user.uuid)
        ]);
        renderVersionList(hist, userIndex);
      } catch (e) {
        console.error("❌ Version history error:", e);
        listEl.innerHTML = `<li class="vh-item">
          <div class="vh-row">
            <div class="vh-op">!</div>
            <div class="vh-col">
              <div class="vh-line1"><span class="vh-op-label">Failed to load history</span></div>
              <div class="vh-line2">
                <span class="vh-user"><span class="vh-user-name">Try again later</span></span>
                <time class="vh-timestamp">—</time>
              </div>
            </div>
          </div>
        </li>`;
      }
    });

    // 关闭手势
    closeBtn?.addEventListener("click", closeModal);
    modal?.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && modal.classList.contains("show")) closeModal();
    });
  });
})();
