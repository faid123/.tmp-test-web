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
    return await response.json();
  } catch (err) {
    console.error("❌ Failed to fetch cases:", err);
    return null;
  }
}

// 渲染病例表格
function populateTable(cases) {
  const sel = document.getElementById("filter-status");
  if (sel && sel.value !== "all") {
    cases = cases.filter(c => apiStatusToValue(c.new_status) === sel.value);
  }
  const tbody = document.querySelector(".table-body-wrapper .case-table tbody");
  tbody.innerHTML = "";

  if (!cases || cases.length === 0) {
    tbody.innerHTML =
      "<tr><td colspan='5' style='text-align:center;'>No cases found</td></tr>";
    return;
  }

  cases.forEach((caseItem) => {
    const row = document.createElement("tr");
    row.dataset.caseId   = caseItem.id || caseItem.case_int_id;  

    // 🔍 获取附加数据（包括 expected_date, new_status, assigned_to）
    const dueDate = formatDateTime(caseItem.expected_date); // ✅ 与字段统一
    const newStatus = caseItem.new_status || "N/A";
    const assignedTo = caseItem.assigned_to || "N/A";

    // row 开始处
    // console.log("[row] id", caseItem.id, {
    //   due_date: caseItem.due_date,
    //   new_status: caseItem.new_status,
    //   assigned_to: caseItem.assigned_to,
    // });

    row.innerHTML = `
      <td style="width: 18%;">${caseItem.case_id || "N/A"}</td>
      <td style="width: 18%;">${formatDateTime(caseItem.creation_date)}</td>
      <td style="width: 18%;">${dueDate}</td>
      <td style="width: 18%;">${newStatus}</td>
      <td style="width: 18%;">${assignedTo}</td>
      <td style="width: 12%;">
        <button class="icon-button" title="Attachment"><i class="fa fa-paperclip"></i></button>
        <button class="icon-button" title="Download"><i class="fa fa-download"></i></button>
        <button class="icon-button" title="Flag"><i class="fa fa-flag"></i></button>
      </td>
    `;

    row.addEventListener("click", () => {
      handleRowClick(caseItem.id);

      const allRows = tbody.querySelectorAll("tr");
      allRows.forEach((r) => r.classList.remove("active"));
      row.classList.add("active");
    });

    tbody.appendChild(row);
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
const extra = currentCases.find(c => c.id === caseId || c.case_int_id === caseId);
if (extra) {
  Object.assign(detail, {
    new_status   : extra.new_status,
    expected_date: extra.expected_date,
    assigned_to  : extra.assigned_to,
    comments     : extra.comments,
  });
}

console.log("extra →", extra);                 // ⭐ 调试 1
console.log("detail after merge →", detail);   // ⭐ 调试 2

displayCaseDetails(detail);
    displayCaseDetails(detail); // 更新下方基本信息
    document.getElementById("caseNameDisplay").textContent =
      detail.case_id || "N/A"; // ✅ 展示你要的 case_id

    console.log("🟢 Selected case info:", detail);
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
  document.getElementById("selected-case").textContent = data.case_id || "N/A";
  document.getElementById("created-by").textContent = data.username || "N/A";
  document.getElementById("date-created").textContent = formatDateTime(
    data.creation_date
  );
  document.getElementById("last-edited").textContent = formatDateTime(
    data.last_updated
  );
  const statusSel = document.getElementById("status");
  if (statusSel) statusSel.value = apiStatusToValue(data.new_status);
}

// 日期格式化
function formatDateTime(ts) {
  if (!ts) return "N/A";
  const ms = ts.toString().length === 13 ? Number(ts) : Number(ts) * 1000; // 13 位说明已是毫秒
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

  if (currentThumbnails.length === 0) {
    image.src = "../../assets/default.png";
    image.alt = "No images available";
    image.style.backgroundColor = "#ccc";
    counter.textContent = "IMAGE 0 OF 0";
    return;
  }

  image.src = "data:image/png;base64," + currentThumbnails[currentImageIndex];
  image.alt = `Case Thumbnail ${currentImageIndex + 1}`;
  counter.textContent = `IMAGE ${currentImageIndex + 1} OF ${
    currentThumbnails.length
  }`;
  image.style.backgroundColor = "";
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

  const requestBody = JSON.stringify([
    {
      machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
      uuid: loggedInUser.uuid,
      caseIntID: caseId,
    },
    {
      case_id: caseId,
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
    const filterSel = document.getElementById("filter-status");
if (filterSel) filterSel.addEventListener("change", () => populateTable(currentCases));


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
        populateTable(sorted); // ✅ 每次点击都重新渲染

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
      const user = getLoggedInUser();

      if (!caseId || !user?.uuid) {
        alert("⚠️ Please select a case first.");
        return;
      }

      const confirmed = confirm("Are you sure you want to delete this case?");
      if (!confirmed) return;

      const requestBody = JSON.stringify([
        {
          machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
          uuid: user.uuid,
          caseIntID: caseId,
        },
      ]);

      try {
        const response = await fetch(
          `https://live.api.smartrpdai.com/api/smartrpd/case/delete/${caseId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
          }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();

        alert("✅ Case deleted successfully!");

        // 可选：从 currentCases 中移除该项并重新渲染表格
        currentCases = currentCases.filter(
          (c) => c.id !== caseId && c.case_id !== caseId
        );
        populateTable(currentCases);

        // 清空右侧显示（如果需要）
        document.getElementById("caseNameDisplay").textContent = "";
        document.getElementById("selected-case").textContent = "";
        document.getElementById("created-by").textContent = "";
        document.getElementById("date-created").textContent = "";
        document.getElementById("last-edited").textContent = "";
      } catch (err) {
        console.error("❌ Delete failed:", err);
        alert("❌ Failed to delete case.");
      }
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

  if (renameBtn) {
    renameBtn.addEventListener("click", async () => {
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

      const newCaseName = prompt("Enter new case name:", caseObj.case_id);
      if (!newCaseName || newCaseName.trim() === "") return;

      const requestData = [
        {
          machine_id: "3a0df9c37b50873c63cebecd7bed73152a5ef616",
          uuid: user.uuid,
          caseIntID: caseObj.id,
        },
        {
          case_id: newCaseName.trim(),
        },
      ];

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

        // ✅ 更新本地对象
        caseObj.case_id = newCaseName.trim();
        populateTable(currentCases);
        // ✅ 更新顶部显示
        document.getElementById("caseNameDisplay").textContent =
          newCaseName.trim();

        // ✅ 更新左侧列表中的对应项
        const caseListItems = document.querySelectorAll(".case-list-item");
        caseListItems.forEach((item) => {
          if (item.dataset.caseId === caseId) {
            const nameElement = item.querySelector(".case-name");
            if (nameElement) nameElement.textContent = newCaseName.trim();
          }
        });

        // ✅ 更新所有上下文显示项
        document.querySelectorAll(".case-name-display").forEach((el) => {
          el.textContent = newCaseName.trim();
        });

        // ✅ 关键：刷新表格
        if (typeof renderCaseTable === "function") {
          renderCaseTable(currentCases);
        }

        alert("✅ Case renamed successfully!");
      } catch (error) {
        console.error("❌ Failed to rename case:", error);
        alert(`❌ Failed to rename case: ${error.message}`);
      }
    });
  }

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
      populateTable(currentCases);
    } catch (err) {
      console.error("❌ Status update failed:", err);
      alert("❌ Failed to update status.");
      e.target.value = apiStatusToValue(caseObj.new_status);
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
