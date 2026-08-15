import { logApi } from "../shared/apiLog.js";
import { API_BASE, MACHINE_ID } from "../shared/api.js";
(function () {

  const notifBtn   = document.getElementById("notificationBtn");
  const notifPopup = document.getElementById("notificationPopup");
  const notifList  = document.getElementById("notificationList");
  const markAllBtn = document.getElementById("markAllBtn");

  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user || !user.uuid) return;
  const USERNAME = user.username || (user.email ? user.email.split("@")[0] : "");

  /* ====== 红点工具 & 统计函数（新增） ====== */
  function applyUnreadCount(count) {
    const dot = document.getElementById("notificationDot");
    if (dot) {
      dot.classList.toggle("show", count > 0);
      // The new bell badge uses [hidden]; only show the numeric count when > 0.
      if (count > 0) {
        dot.hidden = false;
        dot.textContent = String(count > 99 ? "99+" : count);
      } else {
        dot.hidden = true;
        dot.textContent = "";
      }
    }
    const toolbarBadge = document.getElementById("notificationBadge");
    if (toolbarBadge) toolbarBadge.textContent = String(count > 99 ? "99+" : count);
  }

  // Count unread alerts across all of the user's cases. Returns 0 on any failure.
  async function refreshNotifDotFromAPI() {
    try {
      const caseRes2 = await fetch(
        `${API_BASE}/case/user/findall/get`,
        {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify([
            { machine_id: MACHINE_ID, uuid: user.uuid },
            { uuid: user.uuid }
          ])
        }
      );
      logApi(caseRes2, 'POST /case/user/findall/get');
      if (!caseRes2.ok) throw new Error("case fetch failed (dot)");
      const caseArr2 = await caseRes2.json();
      const caseIDs2 = Array.isArray(caseArr2) ? [...new Set(caseArr2.map(c => c.id))] : [];
      const caseIDSet2 = new Set(caseIDs2.map(id => String(id)));

      let unreadCount = 0;
      const aRes2 = await fetch(
        `${API_BASE}/alerts/getallbytouser`,
        {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify([
            { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: caseIDs2[0] || 0 },
            { to_user: USERNAME }
          ])
        }
      );
      logApi(aRes2, 'POST /alerts/getallbytouser');
      if (aRes2.ok) {
        const list2 = await aRes2.json();
        if (Array.isArray(list2)) {
          for (const a of list2) {
            const belongsToCurrentCase = !a.case_int_id || caseIDSet2.has(String(a.case_int_id));
            if (belongsToCurrentCase && Number(a.read_status) !== 1) unreadCount += 1;
          }
        }
      }

      applyUnreadCount(unreadCount);
    } catch (err) {
      console.error("[refreshNotifDotFromAPI] failed:", err);
    }
  }

    /* ====== 🔴 红点自动轮询（独立模块） ====== */
  let notifDotTimer = null;
  let notifDotInFlight = false;

  async function notifDotTick() {
    if (notifDotInFlight) return;   // 防并发
    notifDotInFlight = true;
    try {
      await refreshNotifDotFromAPI(); // 复用你已有的统计函数
    } finally {
      notifDotInFlight = false;
    }
  }

  // 启动/停止接口：完全独立，不影响原有功能
  function startNotificationDotPolling(intervalMs = 5000) {
    if (notifDotTimer) return;      // 已启动则忽略
    // 先立即跑一次，再进入节拍
    notifDotTick();
    notifDotTimer = setInterval(notifDotTick, intervalMs);
  }
  /* ====== 🔴 红点自动轮询（独立模块）结束 ====== */

  /* ====== 红点工具 & 统计函数（新增结束） ====== */

  notifBtn.addEventListener("click", () => {
    notifPopup.classList.toggle("hidden");
    if (!notifPopup.classList.contains("hidden")) loadNotifications();
  });
  document.addEventListener("click", e => {
    // contains(), not identity: the glyph and badge are children of the button, so
    // an identity check reads a click on them as "outside" and shuts the popup.
    if (!notifPopup.contains(e.target) && !notifBtn.contains(e.target))
      notifPopup.classList.add("hidden");
  });

  // Delayed ~2s so the notifications burst doesn't land on the case list's initial
  // load — the backend rate-limiter trips when both fire at once.
  setTimeout(() => {
    startNotificationDotPolling(15000);
  }, 2000);


  async function loadNotifications() {
    notifList.innerHTML = "<div style='padding:12px'>Loading…</div>";
    try {
      // A. 先拿当前用户的所有 case
      const caseRes = await fetch(
        `${API_BASE}/case/user/findall/get`,
        {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify([
            { machine_id: MACHINE_ID, uuid: user.uuid },
            { uuid: user.uuid }
          ])
        }
      );
      logApi(caseRes, 'POST /case/user/findall/get');
      if (!caseRes.ok) throw new Error("case fetch failed");
      const caseArr = await caseRes.json();
      if (!Array.isArray(caseArr)) throw new Error("case list not array");

      // A.1 建 id->name 映射，统一用字符串 key
      const caseNameMap = {};
      caseArr.forEach(c => { caseNameMap[String(c.id)] = c.case_id; });

      // A.2 去重 case id
      const caseIDs = [...new Set(caseArr.map(c => c.id))];

      // B. per case 拉取 alerts
      const allAlerts = [];
      const caseIDSet = new Set(caseIDs.map(id => String(id)));
      const aRes = await fetch(
        `${API_BASE}/alerts/getallbytouser`,
        {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify([
            { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: caseIDs[0] || 0 },
            { to_user: USERNAME }
          ])
        }
      );
      logApi(aRes, 'POST /alerts/getallbytouser');
      if (aRes.ok) {
        const list = await aRes.json();
        if (Array.isArray(list)) {
          list.forEach(a => {
            if (!a.case_int_id || caseIDSet.has(String(a.case_int_id))) {
              a._cid = a.case_int_id;
              allAlerts.push(a);
            }
          });
        }
      }

      // C. 去重（按 alert.id）
      const uniqueAlerts = [...new Map(allAlerts.map(a => [a.id, a])).values()];

      // D. 对缺名字的 case 再兜底查一次（保留你的逻辑）
      const missingIds = [...new Set(
        uniqueAlerts.filter(a => !caseNameMap[String(a.case_int_id)])
                    .map(a => a.case_int_id)
      )];
      await Promise.all(missingIds.map(async cid => {
        try {
          const r = await fetch(
            `${API_BASE}/case/get/${cid}`,
            {
              method : "POST",
              headers: { "Content-Type": "application/json" },
              body   : JSON.stringify([
                { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: cid }
              ])
            }
          );
          logApi(r, 'POST /case/get/:id');
          if (r.ok) {
            const d = await r.json();
            if (d && d.case_id) caseNameMap[String(cid)] = d.case_id;
          }
        } catch (_) {}
      }));

      // E. 渲染
      render(uniqueAlerts, caseNameMap);
    } catch (e) {
      notifList.innerHTML =
        "<div style='padding:16px;color:red;'>加载失败</div>";
      console.error(e);
    }
  }

  function render(list, nameMap) {
    notifList.innerHTML = "";
    if (!Array.isArray(list) || !list.length) {
      notifList.innerHTML = "<div style='padding:16px;'>No notifications.</div>";
      return;
    }

    // 新的在上
    list.sort((a, b) => b.id - a.id);

    list.forEach(a => {
      const hasStatus  = a.new_status !== undefined && a.new_status !== null && a.new_status !== "";
      const caseName   = nameMap[String(a.case_int_id)] || `Case ${a.case_int_id}`;
      const msgPart    = a.alert_message ? `, with message “${a.alert_message}”` : "";
      let line;

      if (hasStatus) {
        line = `<strong>${a.from_user}</strong> has updated the status of <strong>${caseName}</strong> to <strong>${a.new_status}</strong>${msgPart}`;
      } else {
        line = `<strong>${a.from_user}</strong> has invited you to <strong>${caseName}</strong>${msgPart}`;
      }

      const div = document.createElement("div");
      div.className = "notification-item";
      div.innerHTML = `
        <div class="notification-main">${line}</div>
        <div class="notification-time">${pretty(a.create_date)}</div>
      `;
      // ★ 绑定到 DOM（用补齐后的 case_int_id / _cid）
      div.dataset.alertId   = a.id;
      div.dataset.caseIntId = a.case_int_id || a._cid;
      applyReadUI(div, a.read_status ? 1 : 0);

      notifList.appendChild(div);
    });
  }

  const pretty = t => {
    if (!t) return "";
    const diffMin = Math.floor((Date.now() - new Date(t)) / 60000);
    if (diffMin < 1)  return "just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffH = diffMin / 60 | 0;
    if (diffH < 24)  return `${diffH} h ago`;
    return new Date(t).toLocaleDateString();
  };

  /* ============ 下面是“已读”核心逻辑 ============ */

  // 统一封装：按你 Postman 的正确请求体发起 setreadstatus
  async function setReadStatus(alertId, caseIntID, read = 1) {
    const payload = [
      { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: Number(caseIntID) },
      { id: Number(alertId), read_status: Number(read) }
    ];
    const res  = await fetch(
      `${API_BASE}/alerts/setreadstatus`,
      {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(payload)
      }
    );
    logApi(res, 'POST /alerts/setreadstatus');
    const text = await res.text(); // 可能是 mysql info
    console.debug("[setreadstatus]", payload, text);
    if (!res.ok) throw new Error(text || "setreadstatus failed");
    return text;
  }

  // Bring one row's appearance in line with a read_status. Also the single place
  // that knows the blue dot means "unread", so render and both gestures agree.
  function applyReadUI(item, read) {
    const unread = Number(read) !== 1;
    item.classList.toggle("unread", unread);

    const main = item.querySelector(".notification-main");
    const dot  = item.querySelector(".blue-dot");
    if (unread && !dot && main) {
      const span = document.createElement("span");
      span.className = "blue-dot";
      main.prepend(span);
    } else if (!unread) {
      dot?.remove();
    }

    // The only signpost for a gesture nothing else advertises.
    item.title = unread ? "Click to mark as read" : "Double-click to mark as unread";
  }

  // 单条：先调接口成功，再改 UI（不刷新整块）
  async function setItemRead(item, read) {
    if (item.dataset.busy === "1") return;
    // A reload between the click and the end of the double-click window leaves
    // this row detached; acting on it would post for a row nobody can see.
    if (!item.isConnected) return;

    const alertId   = item.dataset.alertId;
    const caseIntID = item.dataset.caseIntId;
    if (!alertId || !caseIntID) {
      console.warn("missing alertId/caseIntID", item.dataset);
      return;
    }

    item.dataset.busy = "1";
    try {
      await setReadStatus(alertId, caseIntID, read);
      applyReadUI(item, read);

      // ★ 新增：单条设已读后刷新红点
      refreshNotifDotFromAPI();
    } catch (err) {
      console.error(`setReadStatus(one, read=${read}) failed:`, err);
      // 失败就不改 UI
    } finally {
      item.dataset.busy = "0";
    }
  }

  // One click marks read, two marks unread. The single-click action waits out the
  // double-click window, or every "mark unread" round-trips through read first.
  const DOUBLE_CLICK_MS = 250;
  let pendingRead = null;

  notifList.addEventListener("click", (e) => {
    const item = e.target.closest(".notification-item");
    if (!item || !item.classList.contains("unread")) return; // 已读不处理
    clearTimeout(pendingRead);
    pendingRead = setTimeout(() => setItemRead(item, 1), DOUBLE_CLICK_MS);
  });

  notifList.addEventListener("dblclick", (e) => {
    const item = e.target.closest(".notification-item");
    if (!item) return;
    clearTimeout(pendingRead);
    if (item.classList.contains("unread")) return; // 已是未读
    setItemRead(item, 0);
  });

  // 全部已读：逐条调用 setreadstatus（不刷新），最后保持当前列表
  markAllBtn.addEventListener("click", async () => {
    const items = Array.from(
      notifList.querySelectorAll(".notification-item.unread")
    );
    if (!items.length) return;

    markAllBtn.disabled = true;

    try {
      const chunk = 20; // 控制并发
      for (let i = 0; i < items.length; i += chunk) {
        await Promise.all(
          items.slice(i, i + chunk).map(async el => {
            const id  = el.dataset.alertId;
            const cid = el.dataset.caseIntId;
            if (!id || !cid) return;
            try {
              await setReadStatus(id, cid, 1);
              applyReadUI(el, 1);
            } catch (e) {
              console.error("setReadStatus(all) failed:", e);
            }
          })
        );
      }
    } finally {
      markAllBtn.disabled = false;
      // ★ 新增：批量设已读后刷新红点
      refreshNotifDotFromAPI();
    }
  });
})();
