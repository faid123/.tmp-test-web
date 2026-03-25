(function () {
  const MACHINE_ID = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

  const notifBtn   = document.getElementById("notificationBtn");
  const notifPopup = document.getElementById("notificationPopup");
  const notifList  = document.getElementById("notificationList");
  const markAllBtn = document.getElementById("markAllBtn");

  const user = JSON.parse(localStorage.getItem("loggedInUser"));
  if (!user || !user.uuid) return;
  const USERNAME = user.username || (user.email ? user.email.split("@")[0] : "");

  /* ====== 红点工具 & 统计函数（新增） ====== */
  function setDotVisible(on) {
    const dot = document.getElementById("notificationDot");
    if (!dot) return;                // 页面里没放红点元素就直接跳过
    dot.classList.toggle("show", !!on);
  }

  // 从后端统计是否存在未读（任一 case 有一条未读就点亮红点）
  async function refreshNotifDotFromAPI() {
    try {
      // 1) 取 case 列表
      const caseRes2 = await fetch(
        "https://live.api.smartrpdai.com/api/smartrpd/case/user/findall/get",
        {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify([
            { machine_id: MACHINE_ID, uuid: user.uuid },
            { uuid: user.uuid }
          ])
        }
      );
      if (!caseRes2.ok) throw new Error("case fetch failed (dot)");
      const caseArr2 = await caseRes2.json();
      const caseIDs2 = Array.isArray(caseArr2) ? [...new Set(caseArr2.map(c => c.id))] : [];

      // 2) 遍历 case 取 alerts，只要发现一条未读就早停
      let foundUnread = false;
      for (const cid of caseIDs2) {
        const aRes2 = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/alerts/getallbytouser",
          {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify([
              { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: cid },
              { to_user: USERNAME }
            ])
          }
        );
        if (!aRes2.ok) continue;
        const list2 = await aRes2.json();
        if (Array.isArray(list2)) {
          for (const a of list2) {
            if (Number(a.read_status) !== 1) { foundUnread = true; break; }
          }
        }
        if (foundUnread) break;
      }

      setDotVisible(foundUnread);
    } catch (err) {
      console.error("[refreshNotifDotFromAPI] failed:", err);
      // 失败时保持当前红点状态
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
  function stopNotificationDotPolling() {
    if (!notifDotTimer) return;
    clearInterval(notifDotTimer);
    notifDotTimer = null;
  }
  /* ====== 🔴 红点自动轮询（独立模块）结束 ====== */

  /* ====== 红点工具 & 统计函数（新增结束） ====== */

  notifBtn.addEventListener("click", () => {
    notifPopup.classList.toggle("hidden");
    if (!notifPopup.classList.contains("hidden")) loadNotifications();
  });
  document.addEventListener("click", e => {
    if (!notifPopup.contains(e.target) && e.target !== notifBtn)
      notifPopup.classList.add("hidden");
  });

  // 页面加载完成就先统计一次红点（无需点开弹窗）
  refreshNotifDotFromAPI();
    // 启动红点轮询：每 5 秒检查一次
  startNotificationDotPolling(5000);


  async function loadNotifications() {
    notifList.innerHTML = "<div style='padding:12px'>Loading…</div>";
    try {
      // A. 先拿当前用户的所有 case
      const caseRes = await fetch(
        "https://live.api.smartrpdai.com/api/smartrpd/case/user/findall/get",
        {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify([
            { machine_id: MACHINE_ID, uuid: user.uuid },
            { uuid: user.uuid }
          ])
        }
      );
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
      for (const cid of caseIDs) {
        const aRes = await fetch(
          "https://live.api.smartrpdai.com/api/smartrpd/alerts/getallbytouser",
          {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify([
              { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: cid },
              { to_user: USERNAME }
            ])
          }
        );
        if (aRes.ok) {
          const list = await aRes.json();
          if (Array.isArray(list)) {
            // ★ 给每条补上 _cid 兜底（有的返回 case_int_id 可能为空/类型不对）
            list.forEach(a => {
              a._cid = cid;
              if (a.case_int_id == null) a.case_int_id = cid;
              allAlerts.push(a);
            });
          }
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
            `https://live.api.smartrpdai.com/api/smartrpd/case/get/${cid}`,
            {
              method : "POST",
              headers: { "Content-Type": "application/json" },
              body   : JSON.stringify([
                { machine_id: MACHINE_ID, uuid: user.uuid, caseIntID: cid }
              ])
            }
          );
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
      div.className = "notification-item" + (a.read_status ? "" : " unread");
      div.innerHTML = `
        <div class="notification-main">
          ${a.read_status ? "" : '<span class="blue-dot"></span>'}
          ${line}
        </div>
        <div class="notification-time">${pretty(a.create_date)}</div>
      `;
      // ★ 绑定到 DOM（用补齐后的 case_int_id / _cid）
      div.dataset.alertId   = a.id;
      div.dataset.caseIntId = a.case_int_id || a._cid;

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
      "https://live.api.smartrpdai.com/api/smartrpd/alerts/setreadstatus",
      {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(payload)
      }
    );
    const text = await res.text(); // 可能是 mysql info
    console.debug("[setreadstatus]", payload, text);
    if (!res.ok) throw new Error(text || "setreadstatus failed");
    return text;
  }

  // 单条点击：先调接口成功，再改 UI（不刷新整块）
  notifList.addEventListener("click", async (e) => {
    const item = e.target.closest(".notification-item");
    if (!item) return;
    if (!item.classList.contains("unread")) return; // 已读不处理
    if (item.dataset.busy === "1") return;

    const alertId   = item.dataset.alertId;
    const caseIntID = item.dataset.caseIntId;
    if (!alertId || !caseIntID) {
      console.warn("missing alertId/caseIntID", item.dataset);
      return;
    }

    item.dataset.busy = "1";
    try {
      await setReadStatus(alertId, caseIntID, 1);
      item.classList.remove("unread");
      item.querySelector(".blue-dot")?.remove();

      // ★ 新增：单条设已读后刷新红点
      refreshNotifDotFromAPI();
    } catch (err) {
      console.error("setReadStatus(one) failed:", err);
      // 失败就不改 UI
    } finally {
      item.dataset.busy = "0";
    }
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
              el.classList.remove("unread");
              el.querySelector(".blue-dot")?.remove();
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
