import { lol } from "../crypt.js";

document.addEventListener("DOMContentLoaded", () => {
  // ✅ 获取加密 ID
  const urlParams = new URLSearchParams(window.location.search);
  const encryptedId = urlParams.get("id") || "N/A";

  const decryptedId = lol(encryptedId); // ✅ 这里才定义了它！
  // ✅ 更新页面中展示的 ID
  const span = document.getElementById("decrypted-id");
  if (span) {
    span.textContent = decryptedId;
  }

  // ✅ 构造 localStorage 的 key
  const storageKey = `annotateBackground_${encryptedId}`;

  // ✅ 获取图像容器并清空（防止多次渲染）
  const previewArea = document.getElementById("image-preview-area");
  previewArea.innerHTML = "";

  // ✅ 从 localStorage 加载图像
  const composedImg = localStorage.getItem(storageKey);

  if (composedImg) {
    const img = new Image();
    img.src = composedImg;
    img.alt = "Composed dental image";

    img.onload = () => {
      // 设置容器样式
      previewArea.style.position = "relative";

      // 插入底图
      img.style.position = "absolute";
      img.style.top = "0";
      img.style.left = "0";
      img.style.zIndex = "1";
      previewArea.appendChild(img);

      // 创建 Canvas 元素
      const canvasEl = document.createElement("canvas");
      canvasEl.id = "fabric-canvas";
      canvasEl.width = img.width;
      canvasEl.height = img.height;
      canvasEl.style.position = "absolute";
      canvasEl.style.top = "0";
      canvasEl.style.left = "0";
      canvasEl.style.zIndex = "2";
      previewArea.appendChild(canvasEl);

      // 初始化 Fabric 画布
      const canvas = new fabric.Canvas("fabric-canvas");
      window.myCanvas = canvas;

      // 默认开启画笔（不透明）
      applyBrushWithOpacity(1.0);

      // 工具函数：设置当前画笔（支持透明度）
      function applyBrushWithOpacity(opacity = 1.0) {
        const hex = document.getElementById("colorPicker").value;
        const size = parseInt(document.getElementById("sizeSlider").value, 10);
        const rgba = hexToRgba(hex, opacity);

        const brush = new fabric.PencilBrush(canvas);
        brush.color = rgba;
        brush.width = size;
        canvas.freeDrawingBrush = brush;
        canvas.isDrawingMode = true;

        // 隐藏橡皮擦光标
        document.getElementById("eraser-cursor").style.display = "none";
      }

      // 🖌 Brush（透明度 70%）
      document.getElementById("brushBtn").addEventListener("click", () => {
        applyBrushWithOpacity(0.5);
      });

      // ✏ Pen（不透明）
      document.getElementById("penBtn").addEventListener("click", () => {
        applyBrushWithOpacity(1.0);
      });

      // 🧼 Eraser（不擦内容，只显示黑色圆圈）

      // 绑定橡皮擦按钮
      document.getElementById("eraserBtn").addEventListener("click", () => {
        canvas.isDrawingMode = false;
        canvas.on("mouse:down", function (opt) {
          const target = opt.target;
          if (target) {
            canvas.remove(target);
          }
        });
      });

      // 颜色更改时同步更新 brush 颜色
      document.getElementById("colorPicker").addEventListener("input", (e) => {
        const brush = canvas.freeDrawingBrush;
        if (brush && brush.color) {
          const opacity = brush.color.includes("rgba")
            ? parseFloat(brush.color.split(",")[3])
            : 1;
          brush.color = hexToRgba(e.target.value, opacity);
        }
      });

      // 工具函数：hex 转 rgba
      function hexToRgba(hex, alpha = 1.0) {
        const r = parseInt(hex.substr(1, 2), 16);
        const g = parseInt(hex.substr(3, 2), 16);
        const b = parseInt(hex.substr(5, 2), 16);
        return `rgba(${r},${g},${b},${alpha})`;
      }

      document.getElementById("textBtn").addEventListener("click", () => {
        canvas.isDrawingMode = false;

        const text = new fabric.IText("Text here", {
          left: 100,
          top: 100,
          fill: "#000000",

          fontSize: 20,
          erasable: true,
        });

        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.renderAll();

        // ✅ 开始编辑文本
        text.enterEditing();
        text.selectAll();

        // ✅ 确保聚焦（有些浏览器需要）
        setTimeout(() => {
          const textarea = document.querySelector("textarea");
          if (textarea) textarea.focus();
        }, 0);
      });

      document.addEventListener("keydown", (e) => {
        // 如果焦点在输入框内，跳过
        if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
          return;
        }

        if (
          (e.key === "Backspace" || e.key === "Delete") &&
          canvas.getActiveObject()
        ) {
          const obj = canvas.getActiveObject();
          // 可选：限制只删文本框
          // if (obj.type === 'i-text') {
          canvas.remove(obj);
          canvas.discardActiveObject();
          canvas.renderAll();
          // }
        }
      });

      // 绑定清空按钮
      document.getElementById("clearBtn").addEventListener("click", () => {
        canvas.clear();
      });

      // ✅ 初始化 redo 栈（建议放在顶部全局变量区域）
      const redoStack = [];

      // 绑定撤销按钮（Undo）
      document.getElementById("undoBtn").addEventListener("click", () => {
        const objs = canvas._objects;
        if (objs.length > 0) {
          const last = objs[objs.length - 1];
          canvas.remove(last);
          redoStack.push(last); // ✅ 存入 redo 栈
        }
      });

      // 绑定重做按钮（Redo）
      document.getElementById("redoBtn").addEventListener("click", () => {
        if (redoStack.length > 0) {
          const redoObj = redoStack.pop();
          canvas.add(redoObj);
          canvas.renderAll(); // ✅ 重新渲染画布
        }
      });

      let isDrawingConnector = false;
      let connectorStart = null;
      let tempLine = null;

      // 绑定 Connector 按钮
      document.getElementById("arrowBtn").addEventListener("click", () => {
        isDrawingConnector = true;
        connectorStart = null;
        if (tempLine) {
          canvas.remove(tempLine);
          tempLine = null;
        }
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.defaultCursor = "crosshair";
      });

      // 第一次点击起点，第二次点击终点
      canvas.on("mouse:down", function (opt) {
        if (!isDrawingConnector) return;

        const pointer = canvas.getPointer(opt.e);
        const { x, y } = pointer;

        if (!connectorStart) {
          // 记录起点
          connectorStart = { x, y };

          // 添加临时线
          tempLine = new fabric.Line([x, y, x, y], {
            stroke: "black",
            strokeWidth: 2,
            selectable: false,
            evented: false,
          });
          canvas.add(tempLine);
        } else {
          // 完成连接线
          canvas.remove(tempLine);

          const line = new fabric.Line(
            [connectorStart.x, connectorStart.y, x, y],
            {
              stroke: "black",
              strokeWidth: 2,
              selectable: false,
              evented: false,
            }
          );

          const startCircle = new fabric.Circle({
            left: connectorStart.x,
            top: connectorStart.y,
            radius: 3,
            fill: "black",
            originX: "center",
            originY: "center",
          });

          const endCircle = new fabric.Circle({
            left: x,
            top: y,
            radius: 3,
            fill: "black",
            originX: "center",
            originY: "center",
          });

          const connectorGroup = new fabric.Group(
            [line, startCircle, endCircle],
            {
              hasControls: true,
              selectable: true,
            }
          );

          canvas.add(connectorGroup);
          isDrawingConnector = false;
          connectorStart = null;
          tempLine = null;
        }
      });

      // 鼠标移动时动态更新临时线
      canvas.on("mouse:move", function (opt) {
        if (!isDrawingConnector || !connectorStart || !tempLine) return;

        const pointer = canvas.getPointer(opt.e);
        tempLine.set({ x2: pointer.x, y2: pointer.y });
        canvas.renderAll();
      });

      // 改变画笔颜色
      document.getElementById("colorPicker").addEventListener("input", (e) => {
        canvas.freeDrawingBrush.color = e.target.value;
      });

      // 改变画笔粗细
      document.getElementById("sizeSlider").addEventListener("input", (e) => {
        canvas.freeDrawingBrush.width = parseInt(e.target.value, 10);
      });

      document.getElementById("saveBtn")?.addEventListener("click", async () => {
  try {
    /* ---------- 0. 校验登录 ---------- */
    const user = JSON.parse(localStorage.getItem("loggedInUser"));
    if (!user?.uuid) return alert("Login info not found, please log in again.");

    /* ---------- 1. 基本变量 ---------- */
    const caseIntID  = decryptedId;           // 你的逻辑里已有
    const case_id    = caseIntID;
    const uuid       = user.uuid;
    const machine_id = "3a0df9c37b50873c63cebecd7bed73152a5ef616";

    /* ---------- 2. 截图 ---------- */
    const previewArea = document.getElementById("image-preview-area");
    if (!previewArea) return alert("❌ Preview area not found.");

    const canvas   = await html2canvas(previewArea,{ backgroundColor:null, useCORS:true });
    const dataURL  = canvas.toDataURL("image/png");
    const fileName = `${Date.now()}.png`;

    /* ---------- 3. 先取旧记录 ---------- */
    const getRes   = await fetch("https://live.api.smartrpdai.com/api/smartrpd/noticeboard/editedview/get",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify([
        { machine_id, uuid, caseIntID },
        { case_id }
      ])
    });

    let namesArr = [], dataArr = [];
    if (getRes.ok) {
      const old = await getRes.json();   // 可能返回对象，也可能数组
      const row = Array.isArray(old) ? old[0] : old;   // 取第一行
      try { if (row?.filenames) namesArr = JSON.parse(row.filenames); } catch {}
      try { if (row?.data)      dataArr  = JSON.parse(row.data);      } catch {}
    }
    /* ---------- 4. 追加新截图 ---------- */
    namesArr.push(fileName);
    dataArr .push(dataURL);

    /* ---------- 5. 重新上传完整数组 ---------- */
    const payload = [
      { machine_id, uuid, caseIntID },
      {
        case_id,
        filenames: JSON.stringify(namesArr),
        data:      JSON.stringify(dataArr)
      }
    ];

    const saveRes = await fetch("https://live.api.smartrpdai.com/api/smartrpd/noticeboard/editedview",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });

    if (saveRes.ok) {
      alert("✅ Annotation saved successfully.");
    } else {
      console.error("Server returned:", await saveRes.text());
      alert("❌ Upload failed. Please check your network or server.");
    }

  } catch (err) {
    console.error("❌ Request error:", err);
    alert("❌ An error occurred during upload.");
  }
});

    };
  } else {
    const placeholder = document.createElement("p");
    placeholder.textContent =
      "⚠️ Failed to load composed image from localStorage. Please generate the image in the 3D page first.";
    placeholder.style.color = "red";
    previewArea.appendChild(placeholder);
  }
});

function getLoggedInUser() {
  try {
    return JSON.parse(localStorage.getItem("loggedInUser"));
  } catch (err) {
    console.warn("Unable to parse loggedInUser", err);
    return null;
  }
}
