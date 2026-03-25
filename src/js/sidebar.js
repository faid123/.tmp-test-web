// // 创建样式
// const style = document.createElement('style');
// style.textContent = `
//   #sidebarContainer {
//     position: absolute;
//     top: 0;
//     right: -180px; /* ✅ 向右再移出 20px，避免重叠 */
//     bottom: 0;
//     width: 160px;
//     background: rgba(255, 255, 255, 0.9);
//     color: #000;
//     display: flex;
//     flex-direction: column;
//     align-items: center;
//     padding: 10px;
//     border-left: 2px solid #ddd;
//     z-index: 10;
//     box-shadow: -2px 0 10px rgba(0, 0, 0, 0.3);
//     border-top-right-radius: 16px;
//     border-bottom-right-radius: 16px;
//     border-top-left-radius: 16px;
//     border-bottom-left-radius: 16px;
//   }

//   #sidebarContainer.hidden {
//     display: none;
//   }

//   #sidebarContainer button {
//     margin: 5px 0;
//     width: 120px;
//   }

//   #sidebarContainer .color {
//     width: 32px;
//     height: 32px;
//     margin: 3px;
//     border: 1px solid #000;
//     cursor: pointer;
//   }
// `;
// document.head.appendChild(style);


// // 🧩 Sidebar DOM 元素
// const sidebar = document.createElement('div');
// sidebar.id = 'sidebarContainer';
// sidebar.classList.add('hidden');
// sidebar.innerHTML = `
//   <button id="cancelBtn">CANCEL</button>
//   <button id="saveBtn">SAVE</button>
//   <div style="margin: 10px 0; font-weight: bold;">Currently Drawing</div>
//   <button id="arrowBtn">🔗</button>
//   <button id="textBtn">💬</button>
//   <button id="clearBtn">Clear</button>
//   <button id="undoBtn">⤺</button>
//   <button id="redoBtn">⤻</button>
//   <button id="brushBtn">🖌</button>
//   <button id="penBtn">✏</button>
//   <button id="eraserBtn">🧽</button>
//   <label for="sizeSlider">Size</label>
//   <input type="range" id="sizeSlider" min="1" max="50" value="10">
//   <label for="colorPicker">Pick Colour</label>
//   <input type="color" id="colorPicker" value="#00ff00">
// `;
// document.body.appendChild(sidebar);

// // 插入 sidebar 到 .twod-group
// function ensureSidebarIn2D() {
//   const container = document.querySelector('.twod-group');
//   if (container && !container.contains(sidebar)) {
//     container.appendChild(sidebar);
//     console.log('✅ Sidebar 插入成功');
//   }
// }

// // 添加绘图 canvas（只有一层）
// function ensureDrawingCanvas() {
//   const group = document.querySelector('.twod-group');
//   const baseImg = group?.querySelector('.twod-fullscreen-image');
//   if (!group || !baseImg) {
//     console.warn('⚠️ 无法找到 .twod-group 或 .twod-fullscreen-image');
//     return;
//   }

//   let drawCanvas = document.getElementById('draw-canvas');
//   if (drawCanvas) {
//     console.log('🎯 Canvas 已存在');
//     return;
//   }

//   drawCanvas = document.createElement('canvas');
//   drawCanvas.id = 'draw-canvas';
//   drawCanvas.style.position = 'absolute';
//   drawCanvas.style.top = '0';
//   drawCanvas.style.left = '0';
//   drawCanvas.style.zIndex = '5';
//   drawCanvas.style.pointerEvents = 'auto';
//   group.appendChild(drawCanvas);

//   // 等待图片加载完设置宽高
//   if (!baseImg.complete) {
//     baseImg.onload = () => {
//       drawCanvas.width = baseImg.clientWidth;
//       drawCanvas.height = baseImg.clientHeight;
//       initDrawingLogic(drawCanvas);
//     };
//   } else {
//     drawCanvas.width = baseImg.clientWidth;
//     drawCanvas.height = baseImg.clientHeight;
//     initDrawingLogic(drawCanvas);
//   }

//   console.log('✅ Canvas 已插入并准备绘图');
// }

// // 绑定绘图逻辑
// function initDrawingLogic(canvas) {
//   const ctx = canvas.getContext('2d');
//   let drawing = false;
//   let mode = 'brush';
//   const sizeSlider = document.getElementById('sizeSlider');
//   const colorPicker = document.getElementById('colorPicker');
//   let history = [], undone = [];

//   canvas.addEventListener('mousedown', (e) => {
//     drawing = true;
//     ctx.beginPath();
//     ctx.moveTo(e.offsetX, e.offsetY);
//     history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
//     undone = [];
//   });

//   canvas.addEventListener('mousemove', (e) => {
//     if (!drawing) return;
//     ctx.lineWidth = sizeSlider.value;
//     ctx.lineCap = 'round';

//     if (mode === 'eraser') {
//       ctx.globalCompositeOperation = 'destination-out';
//     } else {
//       ctx.globalCompositeOperation = 'source-over';
//       ctx.strokeStyle = colorPicker.value;
//     }

//     ctx.lineTo(e.offsetX, e.offsetY);
//     ctx.stroke();
//   });

//   canvas.addEventListener('mouseup', () => drawing = false);
//   canvas.addEventListener('mouseleave', () => drawing = false);

//   // 工具绑定
//   document.getElementById('brushBtn').onclick = () => mode = 'brush';
//   document.getElementById('penBtn').onclick = () => mode = 'pen';
//   document.getElementById('eraserBtn').onclick = () => mode = 'eraser';

//   document.getElementById('clearBtn').onclick = () => {
//     ctx.clearRect(0, 0, canvas.width, canvas.height);
//     history = []; undone = [];
//   };
//   document.getElementById('undoBtn').onclick = () => {
//     if (history.length > 0) {
//       undone.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
//       ctx.putImageData(history.pop(), 0, 0);
//     }
//   };
//   document.getElementById('redoBtn').onclick = () => {
//     if (undone.length > 0) {
//       history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
//       ctx.putImageData(undone.pop(), 0, 0);
//     }
//   };
//   document.getElementById('saveBtn').onclick = () => {
//     const link = document.createElement('a');
//     link.href = canvas.toDataURL();
//     link.download = 'annotation.png';
//     link.click();
//   };
// }

// // 监听 Annotate 按钮点击
// document.addEventListener('click', (e) => {
//   const annotateBtn = document.querySelector('.smart-btn.annotate');
//   const target = e.target;
//   const isInAnnotate = annotateBtn && (target === annotateBtn || annotateBtn.contains(target));
//   const isInSidebar = target.closest && target.closest('#sidebarContainer');

//   if (isInAnnotate) {
//     console.log('🟢 点击 Annotate');
//     e.stopPropagation();
//     ensureSidebarIn2D();
//     ensureDrawingCanvas();
//     sidebar.classList.toggle('hidden');
//     return;
//   }

//   if (isInSidebar) {
//     console.log('🟡 点击 Sidebar 内部');
//     e.stopPropagation();
//     return;
//   }

//   if (!sidebar.classList.contains('hidden')) {
//     console.log('🔴 点击空白关闭 Sidebar');
//     sidebar.classList.add('hidden');
//   }
// }, true);

// // Cancel 按钮逻辑
// sidebar.querySelector('#cancelBtn').addEventListener('click', () => {
//   sidebar.classList.add('hidden');
// });