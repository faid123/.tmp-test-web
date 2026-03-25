import { lol } from "../crypt.js";

document.addEventListener("DOMContentLoaded", () => loadHistory());

async function loadHistory() {
  /* ---------- 1. 解析并解密 ID ---------- */
  const params       = new URLSearchParams(window.location.search);
  const encryptedId  = params.get("id");
  if (!encryptedId) {
    console.warn("❌ Missing ?id param – cannot load history.");
    return;
  }
  const caseIntID    = lol(encryptedId);        // 解出的数字 ID
  const case_id      = caseIntID;               // 两个字段都要
  const MACHINE_ID   = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

  /* ---------- 2. 当前登录用户（拿 uuid） ---------- */
  let uuid = "";
  try {
    uuid = JSON.parse(localStorage.getItem("loggedInUser"))?.uuid || "";
  } catch (_) {}

  /* ---------- 3. 取历史截图 ---------- */
  const payload = [
    { machine_id: MACHINE_ID, uuid, caseIntID },
    { case_id }
  ];

  let rows = [];
  try {
    const res  = await fetch(
      "https://live.api.smartrpdai.com/api/smartrpd/noticeboard/editedview/get",
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload) }
    );
    rows = await res.json();
  } catch (err) {
    console.error("❌ Fetch error:", err);
  }

  /* ---------- 4. 把图片塞进 #annotation-grid ---------- */
const grid = document.getElementById("annotation-grid");
if (!grid) return;

/* 1. 清空旧缩略图（不会影响外面的 add‑instruction） */
grid.innerHTML = "";

/* 2. ❌ 这三行删掉 / 注释掉 ─────────────────────────── */
/* const addCard = document.querySelector(".add-instruction"); */
/* if (addCard) grid.appendChild(addCard);                   */
/* ────────────────────────────────────────────────────────── */

/* 3. 渲染历史图片 */
const list = Array.isArray(rows) ? rows : [rows];
let total  = 0;

list.forEach(row => {
  if (!row) return;

  let namesArr = [];
  let dataArr  = [];

  try { namesArr = JSON.parse(row.filenames); } catch {}
  try { dataArr  = JSON.parse(row.data);      } catch {}

  if (!Array.isArray(dataArr)) {              // 解析失败退化单条
    namesArr = [row.filenames];
    dataArr  = [row.data];
  }

  dataArr.forEach((b64, idx) => {
    if (!b64) return;                         // 跳过空字符串

    const img = new Image();
    img.src   = b64;
    img.alt   = namesArr[idx] || `edited-${idx}`;

    // 如果需要点击事件 ⇒ 在这里绑定
    // img.addEventListener('click', () => { ... });

    grid.appendChild(img);                    // 直接塞 <img>，没有外层 div
    total++;
  });
});

/* 4. 空状态提示（可留可删） */
if (!total) {
  const hint = document.createElement("p");
  hint.textContent = "No edited images found.";
  hint.style.color = "gray";
  grid.appendChild(hint);
}
}